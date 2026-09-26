'use strict';

const fs = require('node:fs/promises');
const path = require('node:path').win32;
const { execFile } = require('node:child_process');

const LIMIT = 100;
const SETUP_URL = 'https://www.voidtools.com/downloads/';

// ES queries the existing Everything index. Never build an index or start a
// background process here: discovery and execution happen only on Search.
function candidates(env) {
  const entries = [env.PETDOCK_EVERYTHING_CLI];
  for (const folder of (env.PATH || env.Path || '').split(';')) {
    const clean = folder.trim().replace(/^"|"$/g, '');
    if (clean && path.isAbsolute(clean)) entries.push(path.join(clean, 'es.exe'));
  }
  for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')]) {
    if (base) entries.push(path.join(base, 'Everything', 'es.exe'));
  }
  return [...new Set(entries.filter(value => typeof value === 'string' && path.isAbsolute(value) && /\.exe$/i.test(value)))];
}

function parseResults(output) {
  const results = [], seen = new Set();
  for (const line of String(output).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    // Results are paths, never HTML, command lines, or URLs. Keep Unicode and
    // spaces intact; Windows filenames cannot contain control characters.
    if (!/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(line) || /[\x00-\x1f]/.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); results.push(line);
    if (results.length === LIMIT) break;
  }
  return results;
}

function createFileSearch({ env = process.env, stat = fs.stat, run = execFile } = {}) {
  let busy = false;
  return {
    async search(query) {
      if (typeof query !== 'string' || !query.trim() || query.length > 1024 || /[\x00-\x1f]/.test(query)) {
        throw new Error('Enter a file search of 1–1024 characters.');
      }
      if (busy) return { status: 'busy', results: [], limit: LIMIT, message: 'A file search is already running.' };
      busy = true;
      try {
        let executable;
        for (const candidate of candidates(env)) {
          try { if ((await stat(candidate)).isFile()) { executable = candidate; break; } } catch {}
        }
        if (!executable) return {
          status: 'setup', results: [], limit: LIMIT, setupUrl: SETUP_URL,
          message: 'Install Everything and its ES command-line tool. Put es.exe in the Everything folder or PATH, then start Everything. Ogle does not scan your drives.'
        };
        // Current official ES: -txt forces full paths; -cp preserves Unicode
        // through redirected stdout; -- makes even -reindex a search string.
        // https://www.voidtools.com/support/everything/command_line_interface/
        const args = ['-n', String(LIMIT), '-timeout', '1500', '-txt', '-no-header', '-no-footer', '-no-highlight', '-no-double-quote', '-no-pause', '-cp', '65001', '--', query.trim()];
        const output = await new Promise((resolve, reject) => {
          run(executable, args, { shell: false, windowsHide: true, encoding: 'utf8', timeout: 4000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
        });
        return { status: 'ok', results: parseResults(output), limit: LIMIT };
      } catch (error) {
        const message = error.code === 6 || error.code === 4
          ? 'Update the ES command-line tool from voidtools, then search again.'
          : error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
            ? 'The file search took too long. Try a more specific name.'
            : 'Start Everything and wait for its index to be ready, then search again.';
        return { status: 'unavailable', results: [], limit: LIMIT, message, setupUrl: SETUP_URL };
      } finally { busy = false; }
    }
  };
}

module.exports = { createFileSearch, candidates, parseResults };
