"use strict";
// Validate Windows ZIP names and expansion bounds before any extraction.
const fs = require("node:fs/promises");
const path = require("node:path");
async function validateDistributionZip(filename) {
  const file = await fs.open(filename, "r");
  try {
    const stat = await file.stat();
    if (stat.size < 22) throw Error("The update ZIP is incomplete.");
    const tail = Buffer.alloc(Math.min(stat.size, 65557));
    await file.read(tail, 0, tail.length, stat.size - tail.length);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 101010256 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      end = i;
      break;
    }
    if (end < 0) throw Error("The update ZIP directory is missing.");
    const count = tail.readUInt16LE(end + 10), size = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || count === 65535 || !count || count > 1e4 || size > 8 * 1024 * 1024 || offset + size > stat.size - tail.length + end) throw Error("Unsupported update ZIP layout.");
    const directory = Buffer.alloc(size);
    await file.read(directory, 0, size, offset);
    let cursor = 0, total = 0, hasExe = false, hasAsar = false;
    const names = /* @__PURE__ */ new Set();
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > size || directory.readUInt32LE(cursor) !== 33639248) throw Error("Invalid update ZIP entry.");
      const length = directory.readUInt16LE(cursor + 28), extra = directory.readUInt16LE(cursor + 30), comment = directory.readUInt16LE(cursor + 32);
      if (cursor + 46 + length + extra + comment > size) throw Error("Incomplete update ZIP entry.");
      const name = directory.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
      if (!name || name.includes("\\") || name.includes(":") || name.includes("\0") || name.startsWith("/") || name.split("/").some((p) => p === ".." || p === "." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || /[<>"|?*\x00-\x1f]/.test(p)) || !name.startsWith("Ogle-win32-x64/") || names.has(name.toLowerCase())) throw Error("Unsafe update ZIP path.");
      const mode = directory.readUInt32LE(cursor + 38) >>> 16;
      if ((mode & 61440) === 40960) throw Error("Update ZIP links are not allowed.");
      names.add(name.toLowerCase());
      total += directory.readUInt32LE(cursor + 24);
      if (total > 2 * 1024 * 1024 * 1024) throw Error("Update ZIP expands beyond the supported size.");
      hasExe ||= name === "Ogle-win32-x64/Ogle.exe";
      hasAsar ||= name === "Ogle-win32-x64/resources/app.asar";
      cursor += 46 + length + extra + comment;
    }
    if (cursor !== size || !hasExe || !hasAsar) throw Error("The update ZIP does not contain a complete Ogle application.");
    return { entries: count, uncompressedBytes: total };
  } finally {
    await file.close();
  }
}
module.exports = { validateDistributionZip };
