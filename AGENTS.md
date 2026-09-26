# Ogle development

- Keep README.md current when behavior, setup or packaging changes.
- Work in focused branches and submit a pull request for changes to main.
- Do not merge, push directly to main, publish a release, or sync changes into main without explicit approval from repository owner Tihkal96 for those changes.
- Preserve existing local profiles, browser sessions and legacy PETDOCK_* environment variables.
- Keep the complete Windows build in dist/ tracked through Git LFS, including unpacked native dependencies. Never commit artifacts/, local profiles, credentials or development node_modules/.
- Run checks appropriate to the change; packaged changes require the packaged application smoke check.
- Give parallel writing agents separate file ownership and coordinate shared interfaces.
