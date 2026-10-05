# Ogle

A Windows dock with an animated pet, Codex tasks, ChatGPT, Claude web chat, Claude Code, notes, a code editor, Links and embedded PowerShell/CMD terminals.

## Download and setup

Download [Ogle 1.0.0](https://github.com/Tihkal96/Ogle/releases/download/v1.0.0/Ogle-1.0.0-win32-x64.zip), extract the entire ZIP, and run `Ogle.exe`. Keep the executable and its supporting files together. The GitHub Source code archives are for development. A release needs no Node.js, npm or Git.

For a stable installation, use the install-for-this-user control in Settings. It copies Ogle into `%LOCALAPPDATA%\Ogle\Application`, creates the selected Desktop/Start menu shortcuts, and preserves the existing profile. The ZIP can also run portably. This is a user-level installation and does not permanently grant administrator shell rights.

Choose the assistant tabs you use at startup or in Settings. Codex requires its installed application and sign-in. ChatGPT and Claude sign in independently inside their browser tabs. Claude Code runs its official CLI; complete its own setup and sign-in in the terminal. Ogle also works with all assistants disabled.

Ogle lives in the Windows tray. Click the pet to reveal the horizontal bar; click a tab to expand. The default idle collapse delay is seven seconds and pauses while the pointer is inside the expanded window. Right-click the pet for window controls. Settings controls startup, shortcuts, themes, pet size, metrics and assistant tabs.

## Everyday controls

| Shortcut | Action |
| --- | --- |
| Ctrl+Alt+C / G | Codex / ChatGPT |
| Ctrl+Alt+E / S / L | Editor / Shell / Links |
| Ctrl+Alt+P | Focus the horizontal prompt |
| Ctrl+Alt+T | Switch its Codex/ChatGPT destination |
| Ctrl+F | Find in the current supported chat/editor |
| Ctrl+mouse wheel | Zoom panel content |

Global shortcuts are customizable. Right-click a tab to pin it beside the main panel; close the pinned pane with its X. Fullscreen controls apply to panel content. Links supports groups, drag ordering and seven toolbar pins. Shell input has an editable command frame; pasted commands are not executed until you run them.

The bundled pets are Rinne Mini (default), Rinne and Lago Realistic. Settings offers credited community pets and refreshes the local library from installed Codex pets. See [artwork credits](assets/PET_ATTRIBUTION.md); third-party artwork keeps its own rights.

## Updates and local data

Settings can check the official GitHub release, verify its ZIP against the published SHA-256, and prepare a separate update. Restart to update is allowed only after active work is stopped and edits are saved. The handoff keeps the application's installation path so existing shortcuts and startup entries continue to work. A backup of the previous application, including any extra files you placed there, is retained beside the installation. Prepared updates can be recovered after a restart; their ZIP is verified again before reuse.

For a manual update, close Ogle after saving, extract the new build, and run its executable. Settings, notes, drafts, editor tabs and browser sessions are stored in your local Ogle profile, outside the application folder. Releases contain no accounts or personal data. Do not delete that profile when replacing the build. Automatic replacement is unavailable for development builds, junctions and protected system locations; use the verified ZIP there.

## Recovery and limits

Settings → Workspace and recovery exports notes, assistant drafts, editor buffers, Links and preferences. Import previews the contents and retains a recovery copy; restored editor buffers have no file paths so they cannot overwrite files. Browser cookies, credentials, administrator access and startup registration are excluded. Saves run off the UI thread, keep a last-good file and recover valid pending writes on startup. Continuous typing is saved at least every 1.5 seconds, with a final flush on normal shutdown.

Open Settings → Debug for technical errors. A browser login or website check must be completed in its tab. Reload is an explicit action and can interrupt that website's response; collapsing Ogle preserves its browser page. Website activity indicators use UI signals and can change when providers update their sites. Fixtures do not guarantee live account behavior.

Windows decides administrator consent for shells; Ogle cannot permanently bypass it. Unsupported hardware meters show N/A. Codex transport availability and model choices depend on the installed Codex version. Long histories load progressively; find covers loaded content. Browser tabs depend on internet connectivity. Save errors keep Ogle open; forced termination and crashes cannot guarantee pending edits survive.

## Development and releases

Run `npm install`, `npm test`, and `npm start` for source development. `npm run package` creates the complete Windows build under `dist/Ogle-win32-x64`; keep that build tracked through Git LFS. Runtime checks use isolated profiles and should never submit live prompts or disturb user sign-ins. Syntax-check generated Electron harnesses before launching them.

Follow [publishing instructions](docs/PUBLISHING.md) and [release acceptance checks](RELEASE_READINESS.md). Every release must update this README's versioned direct ZIP link and verify the uploaded ZIP and SHA-256. Keep documentation about current behavior; Git history contains previous release changes. Leave Reddit alone unless the owner explicitly authorizes it again.

Ogle's source is MIT licensed. [Repository](https://github.com/Tihkal96/Ogle).
