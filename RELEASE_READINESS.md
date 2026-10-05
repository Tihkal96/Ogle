# Ogle release acceptance

A package is ready to publish after relevant automated checks and a packaged startup smoke pass. Version 1.0 additionally needs evidence of installation and upgrade on a second Windows PC, plus sustained daily use without major regressions. Local browser fixtures cannot establish real sign-in, provider permissions or response behavior.

## Current evidence

310 unit tests pass. Packaged checks verify startup, terminal execution, worker saves, recovery export/import/restore, shutdown retry, history races, streamed-text responsiveness and both website activity lifecycles. Isolated Windows helpers verify installation, shortcut targets, update handoff, cancellation and failed-launch rollback. Browser tests use controlled fixtures; physical work-PC installation and live-account acceptance remain outstanding.

## Repeatable verification

- Run `npm test` and the relevant source UI checks serially so test windows do not compete for focus.
- Build with `npm run package`; run `node scripts/package-smoke.cjs` against the resulting build.
- Use isolated profiles and `PETDOCK_TEST_EXE` where supported for packaged browser, editor, shell and layout checks.
- Verify progress while collapsed, working/done acknowledgment, history opening and incremental streaming, native clipboard/find/zoom, settings changes, pinning and normal shutdown saves.
- Verify updater metadata, checksum mismatch, truncated download, unsafe ZIP paths, concurrent downloads and failure cleanup with local network fixtures. Test handoff destination rejection, original-path preservation and rollback without affecting the user's application or profile.
- Review actual narrow and expanded layouts, all themes and physical mixed-DPI monitors. Keep screenshots containing account details private.

## Remaining acceptance on real PCs

- Extract a Windows release without development tools. Upgrade it with existing notes, drafts, editor tabs and browser sessions; confirm startup and shortcuts still point to the same application.
- Exercise Codex sending, steering, queues, model/effort synchronization, approval prompts, reconnect and completion acknowledgment.
- Exercise live ChatGPT and Claude login, attachments, images, clipboard and response lifecycle. Keep Claude Code's official terminal setup and permissions distinct from Claude web chat.
- Check administrator and standard Windows accounts. Confirm elevation requests neither create duplicate terminals nor collapse the dock.
- Confirm active assistant work, terminal sessions and failed saves block restart-to-update. Confirm a staged download alone never exits Ogle.

Record fresh results and their scope in the release report. Do not substitute old release notes or fixture success for live acceptance. Known limits belong in the current README; historical changes belong in Git history.
