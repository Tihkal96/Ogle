# PetDock

A Windows desktop dock with an animated pet, Codex tasks, classic ChatGPT, a code editor, shortcut groups and embedded terminals. Existing pet projects are preserved; the app includes copies of Rinnegan and Lago Cartoon and can use installed v2 pets.

## Run

### Get it on another Windows PC

The complete Windows x64 build is tracked in `dist/` using Git LFS. Install Git with Git LFS, then clone this repository and run `git lfs pull` from its directory. Open `dist/PetDock-win32-x64/PetDock.exe`; keep the whole build folder together. Node.js is only required for development, not to run the packaged app.

```powershell
git lfs install
git clone https://github.com/Tihkal96/PetDock.git
cd PetDock
git lfs pull
.\Launch-PetDock.ps1
```

Install and sign in to Codex on that PC. Sign in to ChatGPT separately inside PetDock. Accounts, notes, settings and chat sessions are local to each PC and are not included in this repository. Windows startup is enabled by default and can be turned off in Settings.

### Development

Open `dist/PetDock-win32-x64/PetDock.exe`, or use `Launch-PetDock.ps1`. Development: `npm ci`, then `npm start`. Codex must be installed, signed in, and available as `codex.exe` on PATH. Set `PETDOCK_CODEX_PATH` to its full executable path if needed.

## Version 0.5

The compact toolbar is 36 pixels tall and its idle ball is 26 pixels. Compact tool buttons are unselected; the up arrow opens the last full panel and the down arrow folds it. Shell now comes before Links. Quick prompts fold to the ball after five seconds without actual mouse/keyboard/input activity, keeping their text and image attachments. Focus alone does not keep the prompt open.

Working animation loops continuously while Codex or the embedded ChatGPT tab is working. Completion/failure reactions start at frame zero, take priority over hover, and wait until other work finishes. ChatGPT detection is best-effort: it observes stop/streaming and final action controls in the embedded website, including while hidden. Navigation does not count as completion. Website changes, very short generations, and manual Stop can limit classification; it is not an official ChatGPT event API. The observer reads activity booleans, not conversation text.

Editor Tab accepts an active completion instead of moving focus, and indents otherwise. Shell creation controls stay left; common commands are on the right. Release admin access is in Settings.

Links defaults to an Android-style icon grid. Groups and real folders open separate icon pages with navigation rather than expanding inline. Windows icons refresh for existing shortcuts, and website favicons are fetched from the site's own `/favicon.ico` when available. Details view remains available. This update migrates earlier default layouts to icons once; later view choices persist.

Start with Windows is on by default for the packaged app and can be disabled in Settings. It registers one per-user login entry. On a login launch, PetDock gives Codex's own startup a grace period, checks its desktop connection/process, and opens it only if absent. Test profiles and development runs never register startup entries. The window's taskbar icon follows the selected pet's first idle frame; the executable's bundled icon uses Rinnegan's first idle frame. Windows may cache an already-pinned launcher icon separately.

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
- Links has one Add action for URLs, files, folders and applications. Drop files/folders from Explorer or links from a browser. Create nested virtual groups, drag items into them, move/reorder items, rename groups, edit aliases/targets, and choose icons or details. Removing a group preserves its children at the parent level. Folder trees can be expanded.
- Shell contains PowerShell/CMD tabs, working-folder selection, clear screen/scrollback, Ctrl+C, restart and close. Administrator shells share one authenticated elevated helper for the dock's lifetime. Close a shell and open another without repeating UAC; Release admin access closes the elevated sessions and helper. Restarting PetDock requires fresh consent. The main dock and browser remain unelevated.
- Settings includes account sign-in/out, pet selection and scale, pet installation, themes, time/date visibility and formats, and dock behavior.

## Codex connection

Version 0.3 fixes the desktop task `already has an active writer` conflict by discovering the existing task owner through local desktop IPC and routing the turn to it. It follows canonical task snapshots for tasks opened in the dock. It does not infer readiness from animation pixels, steal writer locks, or automatically retry an uncertain submission.

The desktop IPC integration was verified against installed Codex **26.924.2738.0**. It is an internal versioned interface and may need updates after a Codex upgrade. It does not guarantee observation of every unopened task across every host. The public app-server connection remains responsible for task listing, account operations and tasks without a desktop owner. If desktop coordination is unavailable, the fallback reports that limitation instead of claiming desktop activity is visible.

Desktop-owned turns inherit their task settings. Standalone turns use `workspace-write` and `on-request` approvals. Supported standalone command/file requests can be answered explicitly; other request types remain pending. Avoid quitting during work on standalone tasks that should continue. Desktop-owned work remains owned by desktop Codex.

## Accounts and pets

ChatGPT loads the real `https://chatgpt.com/` website. The `persist:petdock-chatgpt` partition is unchanged, including the user's existing login. No cookies/tokens are extracted from other applications. Auth provider windows may open for login; regular ChatGPT stays in the dock. Sign-out requires an explicit confirmation and clears this dock's browser session. Microphone, camera and location requests are currently denied. If the site rejects the embedded browser, use Open in Browser. Write ChatGPT prompts in its own tab; the compact composer targets Codex.

Codex account actions use the local app-server account flow. Signing out can affect other local Codex clients and is confirmed explicitly.

Pet installation accepts a slug such as `rinnegan`, `npx codex-pets add rinnegan`, or an HTTPS ZIP URL (including a pasted curl example). It extracts the download target; it does not execute pasted shell commands. Packages must contain one v2 manifest and a PNG/WebP 8-column, 11-row atlas. Only the sanitized manifest and sprite are installed, with archive size/path checks. Existing pets are never overwritten. Destination: `$CODEX_HOME/pets`, or `%USERPROFILE%/.codex/pets`; `PETDOCK_PETS_DIR` overrides it for tests.

## Data and modules

Settings, notes, pins, drafts, editor tabs and shortcuts live in `settings.json` under `%APPDATA%/PetDock`. ChatGPT's browser partition lives there too. Drafts are plain local text. `PETDOCK_DATA_DIR` selects a separate profile for tests. Terminal processes end when the dock exits; scrollback is not persisted.

- `src/main/main.cjs`, `window-layout.cjs`: windows, geometry, trusted IPC and lifecycle.
- `src/main/startup.cjs`, `pet-icon.cjs`: per-user startup, duplicate-launch checks and pet taskbar icons.
- `src/main/codex-bridge.cjs`: app-server transport, desktop coordination, history and turns.
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

Version 0.5 adds `tests/editor-links-runtime.cjs`, `tests/chatgpt-activity-runtime.cjs`, and `tests/taskbar-runtime.cjs`. These verify Tab completion with focus retention, icon-page navigation, existing Windows icon refresh, startup setting persistence, hidden ChatGPT activity transitions, and native taskbar icon changes on pet selection. Compact and interaction checks now cover five-second inactivity, retained image/text drafts, continuous combined work, and a full completion frame cycle despite hover. Startup unit checks verify duplicate prevention and avoid modifying real Windows login entries.

Run `npm test`, `node tests/compact-runtime.cjs`, `node tests/interaction-runtime.cjs`, `node tests/attachments-runtime.cjs`, `node tests/shortcuts-runtime.cjs`, `node tests/chatgpt-controls-runtime.cjs`, `npm run test:layout`, `npm run test:ui`, `npm run package`, and `node scripts/package-smoke.cjs`. Tests that send prompts require `PETDOCK_SMOKE_THREAD_ID` to identify a disposable test task you created. Feature checks send response-only prompts to that explicit task. Attachments runtime with `--real-send` additionally sends a synthetic colored-square image. Screenshots/reports and isolated test profiles are under the excluded `artifacts/` directory. Start/package rebuild frontend bundles automatically.

Fresh version 0.4 verification covers all compact-state transitions, picker selection, locked quick composition, restored always-on-top, Auto/pin visibility, drag/context menu and desktop animation states. Pasted image previews/removal/task isolation and image-only IPC forwarding passed; a real synthetic blue-square image sent through desktop coordination returned `BLUE`. Live editor and terminal backgrounds matched each of the three themes. Packager exclusions are configured in JavaScript so Windows cannot strip regex anchors and remove dependencies' runtime folders.

Version 0.3 checks cover desktop ownership routing and state normalization, real CMD/PowerShell output, pipe authentication and helper reuse, safe pet installation with fake downloads, real editor saving, dirty-tab persistence, nested shortcut drops including an OS-backed File, and Enter-to-send receiving a real desktop-owned Codex response. Interaction checks exercise real renderer events, trusted IPC and window movement with OS cursor/menu boundaries stubbed. ChatGPT controls use an isolated HTTPS fixture without signing into or out of an account. Ordinary Electron screenshots omit the embedded browser view; layout verification also captures the native window.

Actual UAC consent and elevated privileges are not exercised by automated tests. Pipe/worker lifecycle tests run without elevation; the Admin button invokes Windows consent when used. Pet download tests use fixtures; public catalog availability is independent of the app.

## Further extensions

Custom toolbar ordering, additional widgets, full language-server/compiler diagnostics, and direct ChatGPT composition from the compact composer remain future work. This is not a complete Notepad++ replacement.

Integration references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Windows UAC](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works).
