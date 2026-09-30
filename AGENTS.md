# Ogle development

- Keep README.md current when behavior, setup or packaging changes.
- Work in focused branches and submit a pull request for changes to main.
- Owner Tihkal96 has authorized Codex to commit and sync this project without asking for each update. Use review branches and pull requests, run the required checks, and merge verified Codex changes into main. External contributions still require owner review; do not weaken repository protections.
- Preserve existing local profiles, browser sessions and legacy PETDOCK_* environment variables.
- Keep the complete Windows build in dist/ tracked through Git LFS, including unpacked native dependencies. Never commit artifacts/, local profiles, credentials or development node_modules/.
- Run checks appropriate to the change; packaged changes require the packaged application smoke check.
- Give parallel writing agents separate file ownership and coordinate shared interfaces.

- On every release, update the README direct Windows ZIP link (label, tag and filename) to the new package version and verify the published asset. Packaging runs scripts/check-release-link.cjs to reject stale links.
- Follow docs/PUBLISHING.md on every release: after the GitHub asset is public and verified, update the version label and direct ZIP URL in existing owner-authored Reddit announcements/comments. Preserve their prose and discussion context; edit existing entries instead of reposting. Record any unavailable or non-editable entry honestly.
