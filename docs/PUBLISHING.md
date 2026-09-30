# Publishing Ogle releases

Keep download references synchronized with the actual public release. A successful build or draft release is not a published download.

## Release checklist

1. Read the release version from `package.json`; keep the lockfile, release tag and ZIP filename consistent.
2. Update the README download label and direct asset URL together. The expected form is `Ogle-VERSION-win32-x64.zip` at `https://github.com/Tihkal96/Ogle/releases/download/vVERSION/Ogle-VERSION-win32-x64.zip`. Run `node scripts/check-release-link.cjs`.
3. Build and verify the package, upload its ZIP, publish the release, then check that the public asset downloads and matches the locally verified SHA-256. Do not advertise an unpublished or failed build.
4. Review the owner-authored Reddit entries below and any subsequently recorded announcements. After publication, edit their download block to show the current version and direct ZIP URL. Retain the repository link separately for source code. A `/releases/latest` page is useful as an additional release-history link, but does not satisfy the direct-download requirement.
5. Preserve the existing prose, ownership/AI-assistance disclosures, beta status where applicable, and discussion context. Change only the download/version block unless an adjacent factual statement has become incorrect. Reddit titles cannot generally be edited; clarify a historical title in the body rather than reposting it.
6. Read back each saved entry and verify the displayed version and actual link destination. Check crossposts separately: edit the original, then confirm whether the crosspost reflects the update. Never claim a crosspost was edited if only its source changed.
7. Do not bypass locked/removed posts, access restrictions or community rules. Record blocked updates and their URLs in the release report. Do not create duplicate announcements just to refresh a download link.
8. Keep this inventory current when announcements are added. Record public announcement URLs only; do not commit account/session data or browser exports.

Suggested download block, replacing `VERSION` only after the release is published:

```markdown
Source: https://github.com/Tihkal96/Ogle
Windows download (vVERSION): [Ogle-VERSION-win32-x64.zip](https://github.com/Tihkal96/Ogle/releases/download/vVERSION/Ogle-VERSION-win32-x64.zip)
Extract the whole ZIP and run Ogle.exe.
```

## Existing announcement inventory

Read-only audit on 2026-09-30 under the owner's `u/tikhal96` account found the following. No versioned ZIP or version label was present in these entries at audit time; older entries point to the repository, and the newer announcement points to the latest release page. These are missing direct-download references, not confirmed broken URLs. Recheck current content before editing.

| Entry | Link at audit | Required release update |
| --- | --- | --- |
| [Betausers announcement](https://www.reddit.com/r/Betausers/comments/1wuci1k/windows_testers_wanted_for_ogle_a_dock_for_codex/) | Repository plus `/releases/latest` labelled Latest ZIP | Replace download line with current version and direct ZIP; preserve source link. |
| [alphaandbetausers crosspost](https://www.reddit.com/r/alphaandbetausers/comments/1wuci5x/windows_testers_wanted_for_ogle_a_dock_for_codex/) | Crosspost of the Betausers announcement | Verify source edit appears here; do not repost. |
| [Earlier alphaandbetausers announcement](https://www.reddit.com/r/alphaandbetausers/comments/1wr7ich/windows_beta_ogle_a_programmers_dock_combining/) | Repository labelled Code and Windows ZIP | Keep source link and add current version/direct ZIP. |
| [betatesters announcement](https://www.reddit.com/r/betatesters/comments/1wr7d2n/ogle_a_windows_dock_with_codex_chatgpt_an_editor/) | Repository labelled Code and a ready-to-run Windows ZIP | Keep source link and add current version/direct ZIP. |
| [software discovery comment](https://www.reddit.com/r/software/comments/1wptbrd/comment/pc9un5o/) | Repository labelled Source and a runnable Windows ZIP | Check current community rules and edit existing download reference if permitted; do not create a fresh promotion. |
| [ChatGPTCoding promotion comment](https://www.reddit.com/r/ChatGPTCoding/comments/1wm6cbp/comment/pc9ukc3/) | Repository labelled Code and a ready-to-run Windows ZIP | Keep source link and add current version/direct ZIP. |

## Other distribution surfaces

SourceForge should continue pointing to `https://github.com/Tihkal96/Ogle/releases/latest`, as requested by the owner. Do not upload a second copy of the ZIP there. Any future directory listing should be added to this checklist with its update policy.
