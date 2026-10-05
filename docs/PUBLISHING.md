# Publishing Ogle

1. Work on a focused branch. Keep package.json, lockfile, bridge version, tag and ZIP filename consistent. Update the README version label and direct Windows ZIP link; run `node scripts/check-release-link.cjs`.
2. Run relevant unit and isolated UI tests. Syntax-check every generated Electron harness before launching it. Do not use a user's account or prompt for fixtures.
3. Build the complete Windows package and run `node scripts/package-smoke.cjs`. Test the actual packaged application with isolated profiles, including assistant startup, browser retention, editor saves, shell input, pinning and update guards. Record what was verified and any live-account limits.
4. Keep all of dist tracked through Git LFS. Push a review branch, create and attach its PR, independently review the exact commit, and merge only verified changes.
5. Create `Ogle-VERSION-win32-x64.zip` containing the whole application folder. Create `Ogle-VERSION-win32-x64.zip.sha256` containing its SHA-256 and exact ZIP filename. Write the checksum file as ASCII (not PowerShell UTF-16 output), with one line containing the hexadecimal digest and exact ZIP filename. Upload both to a draft GitHub release for `Tihkal96/Ogle`; verify the uploaded asset digest matches the local digest. The in-app updater requires this exact repository, stable tag and asset naming.
6. Publish against the verified merged commit. Verify the public direct ZIP URL, checksum and release metadata. A draft upload or successful local build is not a published download.
7. Sync main and report the release link, checks and material limitations. Never advertise unverified installer signing, account integration or live provider behavior.

SourceForge points to `https://github.com/Tihkal96/Ogle/releases/latest`; do not maintain a second ZIP there. Reddit is outside this workflow and must remain untouched unless explicitly requested again.

Automatic portable updates retain the installation path and personal profile. Their helper must be armed only after the main process confirms no assistant generation or terminal work and successfully flushes renderer saves. A download or prepared update must never quit Ogle. Retain the previous application as a rollback backup; do not recursively delete computed Windows paths without checking their resolved target.
