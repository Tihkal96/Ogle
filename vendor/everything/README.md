# Bundled file search

Unmodified signed Windows x64 binaries from voidtools, retrieved 2026-09-27:

- Everything 1.4.1.1032: https://www.voidtools.com/Everything-1.4.1.1032.x64.zip
- ES 1.1.0.38: https://www.voidtools.com/ES-1.1.0.38.x64.zip

Both executables passed Windows Authenticode verification. SHA-256:

```
Everything.exe F191F756996A14A11E5445FA7103D302EFD510CF2FBF920E6C0C8ED51D512E36
es.exe         F7378761CF6E01F51C4123A485E628D70E3FEA147D341F473CE2820844E5CEE5
```

Redistribution notices are included in LICENSE-Everything.txt and LICENSE-ES.txt.
Sources: https://www.voidtools.com/License.txt and https://github.com/voidtools/ES/blob/master/LICENSE.

Packaging copies this directory to `resources/everything`, outside app.asar.
Ogle starts a private named instance only on first search, with its own configuration
and database in the Ogle user profile. It uses ordinary folder indexing of the user's
Desktop, Documents, Downloads, Pictures, Music and Videos; no service, installer,
administrator privileges or whole-drive scan. Folder changes are monitored in the
native process with background IO priority. The native process closes with Ogle.
Initial indexing can take longer for large folders. Search covers names, not contents.
The shipped ES version's `-timeout` checks `EVERYTHING_IPC_IS_DB_LOADED` before
querying Everything 1.4. A database-load timeout exits with code 8, which Ogle
reports as initializing so the visible search retries instead of showing false
empty results. This behavior was verified against the official
https://www.voidtools.com/ES-1.1.0.38.src.zip (`src/es.c`, `_es_find_ipc_window`).

Runtime documentation: https://www.voidtools.com/support/everything/ini/,
https://www.voidtools.com/support/everything/command_line_options/ and
https://www.voidtools.com/support/everything/command_line_interface/.

Run `node tests/bundled-search-runtime.cjs` to exercise a real isolated Unicode
fixture. Set `PETDOCK_TEST_EXE` to the packaged Ogle executable to test its bundled
search binaries. This test does not scan the user's folders or change existing
Everything installations.
