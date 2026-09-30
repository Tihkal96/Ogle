# Release readiness — Ogle 0.6.2

This release improves reliability and everyday use on the current Windows PC. It remains pre-1.0: a second-PC installation/upgrade trial and sustained daily use of live Codex and ChatGPT are still required. Automated local fixtures cannot establish those results.

## Changes and evidence

| Area | Observable improvement | Verification |
| --- | --- | --- |
| Streaming | Text chunks no longer rebuild unchanged composer controls | 1,000 chunks: 9,000 composer DOM mutations before, zero after; all reply text retained |
| Background work | Hidden Codex history is not downloaded repeatedly; opening the panel refreshes it | Real-app isolated profile with counted history requests |
| History races | A late snapshot cannot replace newer streamed/completed text | Deferred history response checks for refresh and initial selection |
| Editor | Tab changes, language changes and saves preserve undo and selection | Real CodeMirror runtime, plus selection geometry in all three themes |
| Shutdown | Native close saves pending notes and editor edits; save failure keeps Ogle open | Immediate-edit native-close test, failure/retry, timeout and concurrency tests |
| Profile recovery | A bad preference does not discard valid notes/drafts/tabs; damaged bytes have a recovery copy | Real temporary files, malformed JSON, invalid field and unreadable target tests |
| Text files | Invalid UTF-8 is rejected before lossy decoding | Invalid byte fixture remains untouched; UTF-8 round trip |
| Find | Search yields between batches, updates during streaming and restores focus | 100,000 matches, bounded painted highlights, literal queries, cancellation, native ChatGPT fixture |
| Settings | Search and jump navigation preserve existing controls and choices | Filtering, empty state, Escape, heading focus and unchanged values |
| Links and Shell | Nested pinned groups open; Enter saves once; terminal status follows its tab | Real DOM/xterm fixture, existing link-edit workflow |
| Selection transfer | Right-click selected text opens the chosen destination without sending/executing | Eight menu destinations, native ChatGPT selection, exact editor text, unassigned Codex draft, preserved chat drafts and explicit shell Run |
| Commands | Ctrl+Shift+P and pet menu provide searchable common actions | Keyboard filtering/navigation/cancel, native ChatGPT overlay/focus and panel actions |
| Diagnostics | File errors are actionable; quoted JSON credentials are redacted | Friendly-message and redaction regressions |

The streaming timings observed in the same local fixture were approximately 32 ms before and 1.7–3 ms after for enqueuing 1,000 chunks. These are local measurements, not a guarantee for every PC or conversation.

## Repeatable checks

```powershell
npm test
npm run package
$env:PETDOCK_TEST_EXE = (Resolve-Path dist/Ogle-win32-x64/Ogle.exe).Path
npm run test:readiness
node scripts/package-smoke.cjs
```

`test:readiness` records its latest results in ignored `artifacts/readiness-results.json`. Focused renderer fixtures use source modules and real CodeMirror/xterm; full-app tests use `PETDOCK_TEST_EXE` when supplied. Tests use isolated profiles and mocked chat transports. They do not send live prompts or request administrator elevation. The suite also exercises all five pinned panels at left/right/bottom, queue ownership and duplicate-completion handling, working-pet interactions, staged collapse, and editor/shell selection.

`scripts/readiness-visual.cjs` captures the actual source app's settings in Graphite/Paper/Midnight, editor, links and command menu for local visual review. Captures remain under ignored artifacts and may show the locally connected account in Settings; do not publish them without review.

## Remaining 1.0 acceptance checks

- Extract and run the release on a second Windows PC without Node/npm/Git, then upgrade an existing profile and confirm notes, drafts, editor tabs and sign-ins survive.
- Exercise live Codex send, steer, queued prompts, approvals, reconnect and completion acknowledgement over normal daily work.
- Exercise live ChatGPT login, send, attachment, image display and clipboard behavior. Website updates and anti-bot checks remain external dependencies; local fixtures cannot guarantee them.
- Verify mixed-DPI/multiple-monitor movement and pinned layouts on physical displays beyond this machine's configuration.
- Validate administrator-shell behavior on both administrator and standard Windows accounts. Windows consent policy is unchanged.

Known scope limits: undo history is retained within a session, not persisted across restarts; find searches loaded content; unsupported file encodings require conversion; counters contain session totals only. Graceful shutdown cannot save renderer edits after a process crash or forced termination. Large no-match searches within one enormous text node still perform that node's literal regex scan synchronously.

## 0.6.1 workflow checks

Additional regressions cover independent hover/collapse, preserved main tab when pinning another panel, caret watching, fixed native application icon, permanent shell drafts, actual editor selection visibility, configurable group persistence, Windows shortcut source icons, local Codex pet installation, and continued Notes use after a real Codex bridge disconnect. Closing the actual Codex desktop process while Ogle runs is still a manual check; disconnect simulation does not prove launch process independence.

## 0.6.2 window and navigation checks

- Always-on-top controller unit tests cover debounced recovery, owned sign-in window ordering, hidden/minimized behavior, UAC suspension, disabling and cleanup. The native Windows runtime test raises a competing topmost window after the initial recovery burst; user32 z-order enumeration confirms Ogle returns above it while the competing window retains focus. The visible-only guard runs once every two seconds; it does not continuously poll the foreground process or read other applications' content.
- Fullscreen runtime checks pass for all seven panels, exact dock bounds restoration, pinned-panel preservation, full viewport input regions, per-tab zoom and real CMD font changes. Trusted Ctrl+wheel in embedded ChatGPT changes its native zoom; synthetic page events cannot do so, and the remote page has no dock API. Escape inside native ChatGPT returns to the dock. Screenshots were visually reviewed.
- Default Shell Ctrl+Alt+S and Links Ctrl+Alt+L bindings pass settings/migration tests, including custom or disabled bindings and collision handling. Direct-panel runtime checks preserve the compact prompt shortcut Ctrl+Alt+P.
- Credited pet download tests retain creator metadata through local installation, Codex mirroring and refresh. Community sprite assets are downloaded by the user rather than redistributed under the application code license.

Native focus/order checks must run sequentially: other UI automation or user interaction can legitimately change the foreground window and invalidate a focus assertion. These checks do not claim control over UAC secure desktop or exclusive fullscreen games.
