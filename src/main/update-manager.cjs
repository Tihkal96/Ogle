"use strict";
// Downloads official releases into an isolated cache. Preparing never closes Ogle.
const fs = require("node:fs/promises"), path = require("node:path"), crypto = require("node:crypto"), { execFile } = require("node:child_process");
const { createReadStream } = require("node:fs");
const { validateDistributionZip } = require("./update-distribution.cjs");
const REPOSITORY = "Tihkal96/Ogle", LATEST = "https://api.github.com/repos/" + REPOSITORY + "/releases/latest";
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw Error("Unsupported release version.");
  const numbers = match.slice(1).map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw Error("Unsupported release version.");
  return numbers;
}
function isNewer(value, current) {
  const a = parseVersion(value), b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function assetUrl(url, version, name) {
  return url === "https://github.com/" + REPOSITORY + "/releases/download/v" + version + "/" + name;
}
function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}
function extractWindows(zip, destination) {
  return new Promise((resolve, reject) => {
    const script = "Expand-Archive -LiteralPath " + psLiteral(zip) + " -DestinationPath " + psLiteral(destination) + " -Force -ErrorAction Stop";
    execFile("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 18e4, maxBuffer: 1024 * 1024 }, (error) => error ? reject(Error("Windows could not extract the verified update. Your existing application is unchanged.")) : resolve());
  });
}
class UpdateManager {
  constructor({ currentVersion, dataDir, fetcher = globalThis.fetch, extractor = extractWindows, onProgress = () => {
  } }) {
    parseVersion(currentVersion);
    Object.assign(this, { currentVersion, dataDir, fetcher, extractor, onProgress });
    this.release = null;
    this.pending = null;
    this.ready = null;
    this.integrity = null;
    this.stage = null;
  }
  async request(url, timeout = 12e4) {
    const response = await this.fetcher(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Ogle-update-check" }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw Error(response.status === 404 ? "No published Windows update is available." : "GitHub could not provide the update. Try again later.");
    return response;
  }
  async text(response, limit) {
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw Error("The update response exceeds the supported size.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async check() {
    const metadata = JSON.parse(await this.text(await this.request(LATEST), 512 * 1024));
    if (metadata.draft || metadata.prerelease) throw Error("The latest release is not a stable public build.");
    const version = metadata.tag_name?.replace(/^v/, "");
    parseVersion(version);
    const name = "Ogle-" + version + "-win32-x64.zip", assets = metadata.assets || [], zip = assets.find((a) => a.name === name), checksum = assets.find((a) => a.name === name + ".sha256");
    if (!zip || !checksum || !assetUrl(zip.browser_download_url, version, name) || !assetUrl(checksum.browser_download_url, version, name + ".sha256") || !Number.isSafeInteger(zip.size) || zip.size <= 0 || zip.size > 512 * 1024 * 1024) throw Error("The release is missing its official verified Windows download.");
    this.release = { version, name, size: zip.size, url: zip.browser_download_url, checksumUrl: checksum.browser_download_url, digest: zip.digest };
    return { currentVersion: this.currentVersion, version, available: isNewer(version, this.currentVersion), releaseUrl: "https://github.com/" + REPOSITORY + "/releases/tag/v" + version };
  }
  prepare() {
    if (this.pending) return this.pending;
    this.pending = this.download().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async hashFile(filename) {
    const hash = crypto.createHash("sha256");
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest("hex");
  }
  async verifyReady() {
    if (!this.ready || !this.integrity) return false;
    try {
      await this.ensureDirectory();
      return await this.hashFile(this.ready.exePath) === this.integrity.exe && await this.hashFile(path.join(this.ready.folder, "resources", "app.asar")) === this.integrity.asar;
    } catch {
      return false;
    }
  }
  async cachedStage(root, release, expected) {
    if (this.ready?.version === release.version && this.ready.sha256 === expected && await this.verifyReady()) return { ready: this.ready };
    try {
      const record = path.join(root, "ready.json"), stat = await fs.lstat(record);
      if (stat.isSymbolicLink() || stat.size > 4096) return null;
      const saved = JSON.parse(await fs.readFile(record, "utf8"));
      if (saved.version !== release.version || !/^staged-\d+\.\d+\.\d+-[A-Za-z0-9_-]+$/.test(saved.stage)) return null;
      const stage = path.join(root, saved.stage);
      if ((await fs.lstat(stage)).isSymbolicLink() || path.dirname(await fs.realpath(stage)).toLowerCase() !== root.toLowerCase()) return null;
      const zip = path.join(stage, release.name);
      if ((await fs.lstat(zip)).isSymbolicLink() || (await fs.stat(zip)).size !== release.size || await this.hashFile(zip) !== expected) return null;
      await validateDistributionZip(zip);
      return { stage, zip };
    } catch {
      return null;
    }
  }
  async extractedReady(stage, zip, release, expected, root) {
    this.onProgress({ phase: "extracting" });
    const destination = await fs.mkdtemp(path.join(stage, "application-"));
    await this.extractor(zip, destination);
    const folder = path.join(destination, "Ogle-win32-x64"), exePath = path.join(folder, "Ogle.exe");
    await fs.access(exePath);
    await fs.access(path.join(folder, "resources", "app.asar"));
    this.integrity = { exe: await this.hashFile(exePath), asar: await this.hashFile(path.join(folder, "resources", "app.asar")) };
    this.ready = { ready: true, version: release.version, folder, exePath, sha256: expected };
    this.stage = stage;
    const temporary = path.join(root, "ready-" + crypto.randomUUID() + ".tmp");
    await fs.writeFile(temporary, JSON.stringify({ version: release.version, stage: path.basename(stage) }), { flag: "wx" });
    await fs.rename(temporary, path.join(root, "ready.json"));
    this.onProgress({ phase: "ready", version: release.version });
    return this.ready;
  }
  async download() {
    const checked = await this.check();
    if (!checked.available) return { ...checked, ready: false };
    const release = this.release, checksumText = await this.text(await this.request(release.checksumUrl), 4096);
    const match = /^([a-fA-F0-9]{64})(?:[ \t]+\*?([^\r\n]+))?\s*$/.exec(checksumText);
    if (!match || match[2] && match[2] !== release.name) throw Error("The release checksum file is invalid.");
    const expected = match[1].toLowerCase();
    if (release.digest && release.digest !== "sha256:" + expected) throw Error("GitHub and the published checksum disagree.");
    const root = await this.ensureDirectory(), cache = await this.cachedStage(root, release, expected);
    if (cache?.ready) return cache.ready;
    if (cache) return this.extractedReady(cache.stage, cache.zip, release, expected, root);
    const staging = await fs.mkdtemp(path.join(root, "staged-" + release.version + "-")), zip = path.join(staging, release.name), partial = zip + ".partial";
    try {
      const response = await this.request(release.url, 6e5), hash = crypto.createHash("sha256"), file = await fs.open(partial, "wx");
      let received = 0, lastProgress = 0;
      try {
        for await (const chunk of response.body) {
          received += chunk.length;
          if (received > release.size) throw Error("The download exceeds its published size.");
          hash.update(chunk);
          await file.writeFile(chunk);
          if (Date.now() - lastProgress >= 200 || received === release.size) {
            lastProgress = Date.now();
            this.onProgress({ phase: "downloading", received, total: release.size });
          }
        }
      } finally {
        await file.close();
      }
      if (received !== release.size || hash.digest("hex") !== expected) throw Error("Update verification failed. Your current application is unchanged.");
      await fs.rename(partial, zip);
      await validateDistributionZip(zip);
      return await this.extractedReady(staging, zip, release, expected, root);
    } catch (error) {
      await this.cleanupStage(staging, root).catch(() => {
      });
      throw error;
    }
  }
  async cleanupStage(stage, root) {
    const canonicalRoot = await fs.realpath(root), canonicalStage = await fs.realpath(stage);
    if ((await fs.lstat(stage)).isSymbolicLink() || canonicalRoot.toLowerCase() !== path.resolve(root).toLowerCase() || path.dirname(canonicalStage).toLowerCase() !== canonicalRoot.toLowerCase() || !path.basename(canonicalStage).startsWith("staged-")) throw Error("Unsafe update cleanup location.");
    await fs.rm(canonicalStage, { recursive: true, force: true });
  }
  async ensureDirectory() {
    const directory = path.join(path.resolve(this.dataDir), "updates");
    await fs.mkdir(directory, { recursive: true });
    if ((await fs.lstat(directory)).isSymbolicLink() || (await fs.realpath(directory)).toLowerCase() !== directory.toLowerCase()) throw Error("The update cache must be a real directory, not a junction.");
    return directory;
  }
}
module.exports = { UpdateManager, parseVersion, isNewer, extractWindows, LATEST };
