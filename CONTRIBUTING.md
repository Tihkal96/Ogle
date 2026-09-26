# Contributing to Ogle

Ogle is maintained at [github.com/Tihkal96/Ogle](https://github.com/Tihkal96/Ogle). Contributions use forks and pull requests. **@Tihkal96 reviews and merges accepted changes. Contributors should not push directly to the upstream repository.**

## Fork and propose a change

1. Fork the repository into your own GitHub account and clone your fork.
2. Create a focused branch for the change. Keep unrelated fixes in separate pull requests.
3. Install dependencies with `npm ci`. Use `npm start` to run Ogle locally.
4. Implement the change, update relevant tests and documentation, and run the checks below.
5. Push the branch to your fork and open a pull request against `Tihkal96/Ogle`.
6. Respond to review feedback on the same branch. The owner decides whether to merge the pull request.

For a substantial change, open an issue first to explain the problem, intended behavior and scope. A pull request should describe the behavior before and after the change, the checks performed, and any remaining limitations. Include screenshots for visible interface changes.

## Checks

Run the checks that cover the change:

```powershell
npm test
npm run build
```

For packaging changes, run `npm run package` and verify `dist/Ogle-win32-x64/Ogle.exe`. For window, renderer, editor or integration changes, run the relevant runtime checks listed in [README.md](README.md#verification). Run desktop UI tests serially to avoid pointer and focus interference between test windows.

Use an isolated test profile through `PETDOCK_DATA_DIR`. Tests that send prompts require `PETDOCK_SMOKE_THREAD_ID` pointing to a disposable test task you created. Never use someone else's active conversation for a smoke test. Authentication changes, public downloads and Windows administrator consent are separate checks; report them as untested when they were not exercised.

## Scope and compatibility

- Keep files and modules focused on one responsibility, and update the README when behavior, setup or limitations change.
- Preserve the existing `%APPDATA%/PetDock` profile, `persist:petdock-chatgpt` browser partition and `PETDOCK_*` environment variables unless a migration is explicitly part of the proposal.
- Keep account credentials, browser storage, personal notes, test profiles and generated verification artifacts out of commits.
- Do not include regenerated Windows builds in ordinary source pull requests unless the owner requests them. Runnable builds are distributed through [Releases](https://github.com/Tihkal96/Ogle/releases).
- Do not claim that a best-effort website observer or internal Codex interface is a supported public API. Document compatibility assumptions and test evidence.

## Review ownership

[CODEOWNERS](.github/CODEOWNERS) assigns all paths to `@Tihkal96` for review. It is a review-routing file, not a permission grant or proof that branch protection is enabled. Repository access and merge restrictions depend on GitHub settings maintained by the owner.
