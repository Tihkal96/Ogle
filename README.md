# Ogle

A Windows desktop dock with an animated pet, Codex tasks, classic ChatGPT, a code editor, shortcut groups and embedded terminals. Existing pet projects are preserved; the app bundles only Rinne Mini (the default), Rinne, and Lago Realistic. Separately installed custom v2 pets remain available. Saved pet choices are preserved; missing choices fall back to Rinne Mini.

## Download and run

Repository: [Tihkal96/Ogle](https://github.com/Tihkal96/Ogle).

### Windows release — no source checkout needed

1. Open [Releases](https://github.com/Tihkal96/Ogle/releases) and download the Windows x64 build archive attached to the release or download directly [Ogle 0.5.18](https://github.com/Tihkal96/Ogle/releases/download/v0.5.18/Ogle-0.5.18-win32-x64.zip) . The automatically generated **Source code** archives are not the runnable application.
2. Extract the entire build archive. Keep its executable, resources and supporting files together.
3. Run `Ogle.exe` from the extracted build folder. Node.js, npm, Git and Git LFS are not required to run a release build.

For a local repository build, the executable is `dist/Ogle-win32-x64/Ogle.exe`; `Launch-Ogle.ps1` launches that build.

To use Codex features, install and sign in to Codex on that PC. Sign in to ChatGPT separately inside Ogle. Accounts, notes, settings and chat sessions are local to each PC and are not included in releases or this repository. Windows startup is enabled by default for the packaged app and can be turned off in Settings.

### Development

```powershell
git clone https://github.com/Tihkal96/Ogle.git
cd Ogle
npm ci
npm start
```

Build the Windows application with `npm run package`, then launch `dist/Ogle-win32-x64/Ogle.exe` or `./Launch-Ogle.ps1`. Codex features require Codex to be installed and signed in. Ogle discovers `codex.exe` through PATH, the local Codex installation, Microsoft Store package, and standard npm native package locations. If your installation is elsewhere, set `PETDOCK_CODEX_PATH` to the full executable path and restart Ogle. A missing installation now shows setup guidance instead of a raw ENOENT error.

### Compatibility with earlier PetDock versions

Ogle is the new project and application name. Existing user data remains under `%APPDATA%/PetDock`, including settings, notes and the `persist:petdock-chatgpt` browser partition, so the rename does not create a fresh profile. Environment variables retain their `PETDOCK_*` names for compatibility; use the names documented below rather than substituting `OGLE_*`.

## Contributing

Fork [Tihkal96/Ogle](https://github.com/Tihkal96/Ogle), make changes on a branch in your fork, and open a pull request. **@Tihkal96 reviews and merges contributions; contributors do not push directly to the upstream repository.** See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and checks. [CODEOWNERS](.github/CODEOWNERS) assigns review ownership; it does not by itself enforce repository permissions or branch protection.

## Release checklist for maintainers and AI agents

Every upgrade must update the direct Windows ZIP download link above: its visible version, release tag and ZIP filename must all match `package.json`. Update package-lock and the bridge client version too, build and verify the complete tracked Windows package, upload the matching ZIP and checksum, and verify that the published link downloads that release. `scripts/check-release-link.cjs` runs during packaging and rejects a stale README download link. Do not leave an older direct-download URL after publishing a newer release.

## Version 0.5.18

The dock toolbar and expanded panels can extend beyond screen edges and into the taskbar area. Only the pet is constrained to the visible work area, so expansion no longer moves it merely to fit the full dock. Drag the pet back to bring controls into view.

## Version 0.5.17

Right-click Codex, ChatGPT, Editor, Shell or Links in the toolbar and choose **Pin** to attach that panel beside the main dock. One panel can be pinned at a time. The main panel opens Editor, or Shell when Editor is pinned. Settings → Dock behavior → Pinned panel position chooses Left (default), Right or Bottom. The attached panel’s top-right × removes the pin without closing its files, tasks or terminal sessions. While pinned, Ogle stays fully expanded; close the attached panel to allow collapse again. Pin state lasts for the current session.

Metrics track the pet’s position, not the toolbar’s edges. The default auto-collapse delay is now 7 seconds; existing saved delay choices remain unchanged.

Before 1.0, verify clean installation and upgrades on a second Windows PC, sustained daily use of both chat integrations, pinned layouts across monitor sizes/DPI, and recovery from connection loss without lost drafts or editor data.

## Version 0.5.16

Editor selection uses a clearer blue highlight; other matching words are underlined so they cannot be mistaken for the selected range.

Pets run from Ogle’s local library. Startup and Settings → Pet → Refresh library copy available Codex pets locally, preserving them when Codex is unavailable. Pet downloads also work independently of Codex.

## Version 0.5.15

Metrics stay within the horizontal/full bar edges, including their optional background; long values cannot spill past the block. Automatic collapse pauses while an administrator terminal or helper approval is pending. The full countdown starts again after approval, cancellation or failure, and overlapping requests keep the hold until all finish. Windows permission behavior remains unchanged.

## Version 0.5.14

Ctrl+Alt+G switches the horizontal chat bar between Codex and ChatGPT. Customize or disable it in Settings → Keyboard shortcuts → Switch Codex / ChatGPT. An open prompt keeps focus and restores each destination’s draft; from other modes the shortcut reveals the horizontal bar. It never sends a message.

Administrator prompts on standard Windows accounts remain once per Ogle session. Existing persistent access requires an administrator account; no unattended privilege grant is installed for standard accounts.

## Version 0.5.13

Pet hover and left/right drag reactions now play during work and return to the continuous working animation. Focusing the horizontal prompt makes the pet follow the pointer with its watching poses. The ChatGPT bar reads “Write a prompt to ChatGPT...”.

The expanded panel pauses automatic collapse while the pointer remains over it, including the embedded ChatGPT view. A fresh full delay starts after leaving. Editor language/profile changes and new/open files return focus to the writing area. Shift+arrows selects editor text and rendered terminal text for copying; terminal selections do not edit the shell command line.

Links search excludes folders by default. The Folders checkbox includes them and saves the preference, while retaining native background filename/path search.

## Version 0.5.12

Right-click the pet to show or hide metrics without changing which rows are enabled. Settings adds a background (off by default) and independent text/background transparency. The default block sits farther right. Hidden metrics retain session counters.

File search now includes local fixed drives and matches paths as well as filenames. The first native background index may take minutes; Ogle reports preparation and retries automatically while Links is visible. Codex history has a read-only compatibility fallback for servers that report `list_turns is not supported yet`, without resuming or changing the task.

Standard Windows accounts can open Admin shells through the Windows administrator credential prompt, once per Ogle session. Persistent access across restarts still requires an administrator account.

## Version 0.5.11

The horizontal Codex picker is a compact, searchable dropdown with project headings. Links groups contain full-size icons; groups with more than four items show three icons and a + tile that expands inline. Drag labels to reorder links and groups or move a link into a frame.

Running Codex tasks now offer separate Queue and Steer controls. Editor and Shell have Copy and Paste buttons; the shell interrupt remains separate. Settings supports three configurable shortcuts: show/hide Ogle, expand/collapse the panel, and horizontal bar/ball (default Ctrl+Alt+B). Meters use Century Gothic and sit farther right behind the pet. Panel controls are smaller and flatter, with tooltips for icon buttons.

## Version 0.5.9

The compact chat destination menu now excludes both choices from Windows' drag region, fixing the unclickable Codex option. Settings → Pet → Click action offers opening Codex, playing a random animation, showing the full panel or bar, toggling the panel, opening ChatGPT, or doing nothing. Dragging still moves the pet.

Run, Windows tools and search share one compact row at the top of Links. Choosing a Windows tool opens it immediately. File search starts 300 ms after typing pauses. Everything and ES are now bundled, with licenses and provenance in `vendor/everything`; users do not install anything. A private non-admin process builds its index only on first search and closes with Ogle. Search covers readable files on local fixed drives plus redirected personal folders, matching filenames and paths, not file contents. Initial whole-drive indexing may take several minutes and uses one native background worker; subsequent file changes are monitored with background IO priority. Results are capped at 100 and initial database loading is reported before querying. Existing Everything installations are left alone.

In the packaged app, the first **Admin** shell (or Settings → Administrator terminals → Enable administrator access) asks Windows once to install a protected helper under Program Files. Its fixed scheduled task starts on demand and works across Ogle restarts and Windows sign-ins. The main dock and ChatGPT stay unelevated. Persistent installation requires an administrator Windows account. Standard accounts instead use the session helper with administrator credentials through Windows UAC; approval lasts until Ogle exits. Closing administrator shells leaves permission installed. **Remove administrator access** removes the task/helper and asks Windows again; replacing the protected helper after an update also requires consent. The persistent helper protocol is versioned; maintainers must require removal/reinstallation when an incompatible or security-sensitive helper update is shipped. UAC policies are never disabled.

Automated checks cover protected installer script parsing, authenticated/encrypted IPC, tampering/replay rejection and broker restarts. Real UAC installation and highest-privilege scheduled-task execution require desktop consent and were not exercised by automated tests.

## Version 0.5.8 (superseded search setup)

Links supports seven toolbar pins. The drop-target box is removed; drop directly into the Links area or a group. Its Run box opens programs, folders, URLs and commands with arguments (quote executable paths containing spaces). The Windows tools menu includes Registry Editor, DCOM/Component Services, Control Panel, Remote Desktop, management consoles and IIS; unavailable Windows components are disabled. Normal Windows permissions and UAC still apply.

Optional filename search uses [Everything and its separate ES command-line tool](https://www.voidtools.com/support/everything/command_line_interface/). Install both, keep Everything running, and put `es.exe` in its Everything installation folder or PATH; alternatively set `PETDOCK_EVERYTHING_CLI` to its absolute executable path before starting Ogle. Search runs only on Enter/Search, returns at most 100 paths and times out after four seconds. Ogle creates no index, scans no drives and runs no background searches. Everything maintains its own external index and has its own resource cost. Click a result to open it. This is filename search, not full-text content indexing.

Long-running work now gets one brief random animation after each minute, then resumes the working animation for another minute. Work/approval/completion state remains authoritative.

## Version 0.5.7

After a minute of uninterrupted idle, the pet plays one random wave or happy animation, then returns to idle for another minute. Working, approvals, hover and completion reactions take priority. The horizontal ChatGPT bar says “Write prompt…”. Its arrow or right-click menu switches between Codex and ChatGPT while keeping their drafts separate.

Codex conversations open at the latest message on first selection and remember where you scrolled when switching tasks or panels during the session. While Codex is working, **Queue** captures your prompt and images for that task. Queued prompts send one at a time after confirmed completion; use **Remove** to cancel one. Failed sends stay paused with an explicit **Retry** button; check the conversation before retrying an uncertain send. Queues are local to the running Ogle session (up to 20 prompts per task), and wait through approval requests. This queues the next turn rather than interrupting or steering the active turn.

## Version 0.5.6

Links now asks before removal and discards unfinished edits when navigating away, collapsing or leaving the dock. A vertical separator distinguishes Links from pinned shortcuts. Codex displays user/assistant messages without streaming thinking or tool output into the UI. Message updates are batched and paused while hidden; switching between full panels avoids hiding/resizing an unchanged window.

## Version 0.5.5

ChatGPT’s Copy buttons can write to the clipboard from its visible, focused main page. Clipboard reads and access from other origins, hidden views, and subframes remain blocked. Pinned links stay on the toolbar in both horizontal and full-panel modes, with compact spacing for all five pins. The reported image-search placeholders loaded normally after reopening the conversation; no image proxy or security bypass was added.

`node tests/chatgpt-clipboard-runtime.cjs` checks the real clipboard API with isolated pages and restores the clipboard afterward. `node tests/pinned-links-runtime.cjs` checks both toolbar sizes and pinned-link navigation.

## Version 0.5.4

Window transitions now hide the native Windows surface during size changes, after smoothly moving the existing pet anchor when screen edges require it. Pin protects only the full panel; manual and automatic full collapse show the toolbar before the ball, with the same configured delay for each idle stage. Stationary pointer events caused by redraw no longer restart that delay or reopen the ball.

## Version 0.5.3

Technical failures are kept under **Settings → Debug → Open debug log**. The session log includes timestamps and repeat counts, with Copy, Clear and Close controls. Background Codex connection/refresh failures do not display error banners; failed actions show short readable messages. Logs are bounded to 200 entries, stay in memory, and are not uploaded automatically.

Run `node tests/debug-runtime.cjs` to verify quiet background failures, readable notifications, log controls and redaction.

## Version 0.5.2

On first launch, choose Codex or ChatGPT for the horizontal chat bar; change it later under Settings → Dock behavior → Horizontal chat bar. Codex retains its project/task picker. ChatGPT uses the conversation already open in its embedded tab, or starts from the new-chat page, and opens that tab when sending. Paste or drop text/files/images, or use the attachment button (up to four attachments, 8 MB each, 16 MB total). Codex remains image-only. Drafts are kept separately. The ChatGPT website integration checks its message box and attachments before clicking Send once; different website drafts are protected, while an exact matching text-only draft can be sent on an explicit retry. Failures keep the dock draft for review. Website UI changes may require an update. Sending is covered by isolated website fixtures, including localized Send controls, and a text-only send was verified in a live signed-in account.

The compact toolbar is 36 pixels tall and its idle ball is 26 pixels. The conversation selector has its own row below the tool buttons. Pin up to five items in Links to show their icons immediately after Links in the horizontal bar; unpin an item to free a slot. Folder and group pins open their contents in Links. Compact tool buttons are unselected; the crosshair control opens or collapses the last full panel, and the pin keeps only the full panel open. Shell now comes before Links. Auto-collapse delay is adjustable in Settings (1–120 seconds), defaulting to 7 seconds for the toolbar, quick prompt and unpinned panels. Manual collapse always shows the horizontal bar first; automatic collapse of an unpinned full panel also shows the bar first. After another interval using the same delay setting, the bar folds to the ball, even when the pin is enabled. Pointer, keyboard and scroll activity reset inactivity timers. Native size changes use a brief coordinated fade so stale window frames are not displayed at a new position; the pet keeps the same size in compact and full layouts. Quick prompts fold to the ball after the configured delay without actual mouse/keyboard/input activity, keeping their text and image attachments. Focus alone does not keep the prompt open.

Working animation loops continuously while Codex or the embedded ChatGPT tab is working. Completion/failure reactions start at frame zero, take priority over hover, and wait until other work finishes. ChatGPT detection is best-effort: it observes stop/streaming and final action controls in the embedded website, including while hidden. Navigation does not count as completion. Website changes, very short generations, and manual Stop can limit classification; it is not an official ChatGPT event API. The observer reads activity booleans, not conversation text.

Editor Tab accepts an active completion instead of moving focus, and indents otherwise. Shell creation controls stay left; common commands are on the right. Release admin access is in Settings.

Links defaults to an Android-style icon grid. Groups and real folders open separate icon pages with navigation rather than expanding inline. Windows icons refresh for existing shortcuts, and website favicons are fetched from the site's own `/favicon.ico` when available. Details view remains available. This update migrates earlier default layouts to icons once; later view choices persist.

Start with Windows is on by default for the packaged app and can be disabled in Settings. It registers one per-user login entry. On a login launch, Ogle gives Codex's own startup a grace period, checks its desktop connection/process, and opens it only if absent. Test profiles and development runs never register startup entries. The window's taskbar icon follows the selected pet's first idle frame; the executable's bundled icon uses Rinne Mini's first idle frame. Windows may cache an already-pinned launcher icon separately.

### Version 0.4 foundation

The dock now uses a restrained HUD style with charcoal, light and dark-blue palettes. The pet remains visible above a small idle ball. Hover reveals the compact bar horizontally; full panels open only when a tool is clicked. Clicking the active conversation name opens a prompt below the bar and keeps it compact. The adjacent picker selects a Codex project/task without opening the full task panel. Classic ChatGPT remains in its own embedded tab.

The always-on-top diamond is back in the toolbar. Auto lives in Settings and defaults on; disabling it makes the bar click-only and hides the keep-open pin. A green status light replaces the connected label. The old app title/subtitle are removed. Editor and terminal palettes now follow theme changes immediately, including existing sessions.

Paste PNG, JPEG or WebP images into the Codex composer to see removable previews. Images are sent as actual Codex image inputs, with or without text. Limits: four images, 8 MB each, 16 MB combined. Pending attachments stay with their task during this app session and are cleared after a successful send; unlike text drafts they are not saved across restarts.

### Existing workspace features

- Drag the pet to move the dock; click it to open the selected task in Codex. Hover plays its greeting animation. Right-click the pet for window controls, Settings and Quit.
- Hover reveals only the compact bar; tool clicks open full panels. The keep-open pin is available when Auto is on. Separate PS/CMD toolbar shortcuts and visible close/minimize buttons are removed.
- Browse local Codex tasks, filter by project, search, pin tasks locally, and retain separate drafts. Send with Enter; Shift+Enter inserts a line. Hide the task sidebar, jump to the latest message, and read while updates arrive without losing scroll position or drafts. The list refreshes automatically every 10 seconds.
- Desktop-owned tasks send through their existing owner and receive live task snapshots. Running, approval/input and completion states drive the pet. Desktop approvals open in Codex; the dock does not automatically approve them.
- Classic ChatGPT stays in a tab in the dock with New Chat, Back, Reload, Latest and Open in Browser. Its own sidebar provides past chats. Existing login storage is preserved.
- Notes autosave. The code editor has persistent tabs, language selection, highlighting, line numbers, folding, search/replace, UTF-8 open/save, overwrite conflict prompts and JSON syntax checks. Ctrl+S saves; Ctrl+Shift+S saves as. Dirty tabs survive restart; closing them requires an explicit discard action.
- Editor modes include C, C++, C#, Visual Basic, CMD, SQL and PowerShell, alongside JavaScript, TypeScript, HTML, CSS, Python, JSON and Markdown. C#/VB profiles for .NET 3.5, .NET 4 and modern code provide basic compatibility hints. These are not compiler validation or a complete language server.
- Links has one Add action for URLs, files, folders and applications. Drop files/folders from Explorer or links from a browser. Create nested virtual groups, drag items into them, move/reorder items, rename groups, edit aliases/targets, and choose icons or details. Removing a group preserves its children at the parent level. Groups and folders open navigable icon pages.
- Shell contains PowerShell/CMD tabs, working-folder selection, clear screen/scrollback, Ctrl+C, restart and close. Packaged administrator shells on administrator accounts use the protected persistent helper described above. Standard accounts use the Windows credential prompt and session helper. Settings can close active shells or remove durable access. Development and isolated test profiles retain the session-only helper. The main dock and browser remain unelevated.
- Settings includes account sign-in/out, pet selection and scale, pet installation, themes, time/date visibility and formats, and dock behavior.

## Codex connection

Version 0.3 fixes the desktop task `already has an active writer` conflict by discovering the existing task owner through local desktop IPC and routing the turn to it. It follows canonical task snapshots for tasks opened in the dock. It does not infer readiness from animation pixels, steal writer locks, or automatically retry an uncertain submission.

The desktop IPC integration was verified against installed Codex **26.924.2738.0**. It is an internal versioned interface and may need updates after a Codex upgrade. It does not guarantee observation of every unopened task across every host. The public app-server connection remains responsible for task listing, account operations and tasks without a desktop owner. If desktop coordination is unavailable, the fallback reports that limitation instead of claiming desktop activity is visible.

Desktop-owned turns inherit their task settings. Standalone turns use `workspace-write` and `on-request` approvals. Supported standalone command/file requests can be answered explicitly; other request types remain pending. Avoid quitting during work on standalone tasks that should continue. Desktop-owned work remains owned by desktop Codex.

## Accounts and pets

ChatGPT loads the real `https://chatgpt.com/` website. The `persist:petdock-chatgpt` partition is unchanged, including the user's existing login. No cookies/tokens are extracted from other applications. Auth provider windows may open for login; regular ChatGPT stays in the dock. Sign-out requires an explicit confirmation and clears this dock's browser session. Microphone, camera and location requests are currently denied. If the site rejects the embedded browser, use Open in Browser. Write ChatGPT prompts in its own tab; the compact composer targets Codex.

Codex account actions use the local app-server account flow. Signing out can affect other local Codex clients and is confirmed explicitly.

Pet installation accepts a slug such as `rinnegan`, `npx codex-pets add rinnegan`, or an HTTPS ZIP URL (including a pasted curl example). It extracts the download target; it does not execute pasted shell commands. Packages must contain one v2 manifest and a PNG/WebP 8-column, 11-row atlas. Only the sanitized manifest and sprite are installed, with archive size/path checks. Existing pets are never overwritten. Destination: `%APPDATA%/PetDock/pets` (or `pets` inside `PETDOCK_DATA_DIR`). Startup and Refresh library synchronize from `$CODEX_HOME/pets` or `%USERPROFILE%/.codex/pets`; `PETDOCK_PETS_DIR` overrides this source for compatibility. Runtime sprites and manifests stay local to Ogle. Missing Codex folders simply reload the local library; no Codex sign-in or connection is required.

## Data and modules

Settings, notes, pins, drafts, editor tabs and shortcuts live in `settings.json` under `%APPDATA%/PetDock`. ChatGPT's browser partition lives there too. Drafts are plain local text. `PETDOCK_DATA_DIR` selects a separate profile for tests. Terminal processes end when the dock exits; scrollback is not persisted.

- `src/main/main.cjs`, `window-layout.cjs`: windows, geometry, trusted IPC and lifecycle.
- `src/main/startup.cjs`, `pet-icon.cjs`: per-user startup, duplicate-launch checks and pet taskbar icons.
- `src/main/codex-bridge.cjs`: app-server transport, desktop coordination, history and turns.
- `src/main/codex-executable.cjs`: executable discovery for Windows installations without a CLI PATH entry.
- `src/main/settings.cjs`: validated atomic settings persistence.
- `src/main/chatgpt-panel.cjs`, `chatgpt-activity.cjs`: isolated embedded ChatGPT view, controls and best-effort activity signals.
- `src/main/files.cjs`: editor files, conflict prompts, shortcuts and icons.
- `src/main/pet-library.cjs`: package validation, installation and pet discovery.
- `src/main/terminal-manager.cjs`, `elevated-broker.cjs`, `terminal-worker.cjs`: ConPTY sessions and shared optional UAC helper.
- `src/renderer/app.js`, `attachments.js`: task UI, image composition, pet interaction and panel behavior.
- `src/renderer/editor.js`, `shortcuts.js`, `terminal.js`, `settings.js`: workspace modules.
- `src/vendor-entry.js`, `scripts/build-vendor.cjs`: bundled CodeMirror/xterm dependencies.
- `assets/pets/`: bundled manifests and sprite sheets.

## Verification

`node tests/layout-transition-runtime.cjs` checks transparent redraw, edge clamping, rapid switches and reduced motion. `node tests/pin-behavior-runtime.cjs` checks two-stage collapse with and without pinning. `node tests/compact-chat-runtime.cjs` checks first-run choice, persistence, ChatGPT text/file transfer through real IPC, and Codex switching. `node tests/chatgpt-composer-runtime.cjs` checks website text/files/images, busy/draft protection and uncertain-send handling with local HTTPS fixtures. `node tests/chatgpt-interaction-runtime.cjs` checks native embedded keyboard/mouse activity. `node tests/attachments-files-runtime.cjs` checks attachment contexts and file inputs.

`node tests/pinned-links-runtime.cjs` verifies the five-pin limit, link targets, persistence and separate conversation row. `node tests/auto-collapse-runtime.cjs` verifies the 7-second default, seconds display, saved values and configured collapse deadline. `node tests/pet-menu-runtime.cjs` opens and closes the real native pet menu through renderer IPC, checking that no native object is returned across the process boundary. Set `PETDOCK_TEST_EXE` to the packaged executable to verify the shipped build. The packaged smoke check removes Codex from PATH and uses an empty custom-pet directory to verify executable discovery and the three bundled pets.

Version 0.5 adds `tests/editor-links-runtime.cjs`, `tests/chatgpt-activity-runtime.cjs`, and `tests/taskbar-runtime.cjs`. These verify Tab completion with focus retention, icon-page navigation, existing Windows icon refresh, startup setting persistence, hidden ChatGPT activity transitions, and native taskbar icon changes on pet selection. Compact and interaction checks now cover configurable inactivity, retained image/text drafts, continuous combined work, and a full completion frame cycle despite hover. Startup unit checks verify duplicate prevention and avoid modifying real Windows login entries.

Run `npm test`, `node tests/compact-runtime.cjs`, `node tests/interaction-runtime.cjs`, `node tests/attachments-runtime.cjs`, `node tests/shortcuts-runtime.cjs`, `node tests/chatgpt-controls-runtime.cjs`, `npm run test:layout`, `npm run test:ui`, `npm run package`, and `node scripts/package-smoke.cjs`. Tests that send prompts require `PETDOCK_SMOKE_THREAD_ID` to identify a disposable test task you created. Feature checks send response-only prompts to that explicit task. Attachments runtime with `--real-send` additionally sends a synthetic colored-square image. Screenshots/reports and isolated test profiles are under the excluded `artifacts/` directory. Start/package rebuild frontend bundles automatically.

Fresh version 0.4 verification covers all compact-state transitions, picker selection, locked quick composition, restored always-on-top, Auto/pin visibility, drag/context menu and desktop animation states. Pasted image previews/removal/task isolation and image-only IPC forwarding passed; a real synthetic blue-square image sent through desktop coordination returned `BLUE`. Live editor and terminal backgrounds matched each of the three themes. Packager exclusions are configured in JavaScript so Windows cannot strip regex anchors and remove dependencies' runtime folders.

Version 0.3 checks cover desktop ownership routing and state normalization, real CMD/PowerShell output, pipe authentication and helper reuse, safe pet installation with fake downloads, real editor saving, dirty-tab persistence, nested shortcut drops including an OS-backed File, and Enter-to-send receiving a real desktop-owned Codex response. Interaction checks exercise real renderer events, trusted IPC and window movement with OS cursor/menu boundaries stubbed. ChatGPT controls use an isolated HTTPS fixture without signing into or out of an account. Ordinary Electron screenshots omit the embedded browser view; layout verification also captures the native window.

Actual UAC consent and elevated privileges are not exercised by automated tests. Pipe/worker lifecycle tests run without elevation; the Admin button invokes Windows consent when used. Pet download tests use fixtures; public catalog availability is independent of the app.

## Further extensions

Custom toolbar ordering, additional widgets, and full language-server/compiler diagnostics remain future work. This is not a complete Notepad++ replacement.

Integration references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Windows UAC](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works).


## v0.5.15: compact controls, counters and keyboard shortcuts

- A small white statistics block shows mouse-click and keystroke totals for the current Ogle session, plus system CPU and RAM usage. Settings → Counters & meters controls each row and places the block left, right or above the pet. Totals are not persisted. The non-elevated Windows collector counts input events only; it never reads key codes, typed text, window titles or clipboard content. Disabling both input rows stops the collector. CPU/RAM sampling runs every two seconds, with no disk index or network traffic.
- Settings → Keyboard shortcuts records your key combination. Defaults: **Ctrl+Alt+O** shows/hides Ogle; **Ctrl+Alt+Space** expands/collapses the panel. Press Backspace in a shortcut field and Set to disable it. Conflicting shortcuts are rejected while preserving the previous binding.
- Codex, editor, shell and Links controls use smaller buttons and clear symbols with hover labels. Links group borders now contain their nested items. Redundant root navigation, destination and pinned-count rows have been removed; additions go into the currently open group.
- Editor **Ctrl+F** opens a readable floating Find/Replace dialog. It closes when Ogle collapses manually or automatically, and when leaving the editor.

Before releasing, run `npm test`, the focused `tests/*-runtime.cjs` checks for changed features, `npm run package`, and the packaged smoke check. Keep the direct Windows ZIP link above synchronized with every version, and verify the published asset.

`node tests/pinned-panel-runtime.cjs` checks all five side panels, placement, collapse hold, composer placement and editor preservation.

## License and distribution

Ogle's original source code is licensed under the [MIT License](LICENSE). This grant does not relicense bundled artwork, trademarks, third-party libraries, Electron/Chromium, or the Everything utilities. Their existing rights and notices remain in force. Pet artwork is excluded from the MIT grant unless it has its own explicit license.

The [SourceForge project](https://sourceforge.net/projects/ogle-dock/) provides an additional download location. GitHub remains the source repository and issue tracker. When publishing future releases, refresh both download locations and verify the uploaded ZIP checksums.
