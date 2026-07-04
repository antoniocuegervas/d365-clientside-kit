# Deployment

Two pieces. See [docs/deployment.md](../docs/deployment.md) for the full guide.

**SPKL webresource publish** (the dev inner loop, pushes `dist/` to an org):

- `spkl.template.json`, webresource mapping (dist artifacts to webresource
  unique names), rendered to a gitignored `spkl.json` with the
  `kit.config.json` prefix
- `deploy.ps1`, non-interactive build + publish; connection string comes from
  the `SPKL_CONNECTION` env var or `connection.local.json` (gitignored)

**Solution project** (`solution/`, the release artifact): packs the five PCF
controls and the shell webresources into a managed zip from the repo alone,
no org connection. See [solution/README.md](solution/README.md).

**Never commit** connection strings, SPKL logs, or `connection.local.json`.
