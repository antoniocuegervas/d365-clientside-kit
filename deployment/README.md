# Deployment

SPKL-based webresource publish (§11.3). See [docs/deployment.md](../docs/deployment.md)
for the full guide.

- `spkl.json` — webresource mapping (dist artifacts → webresource unique names)
- `deploy.ps1` — non-interactive build + publish; connection string comes from
  the `SPKL_CONNECTION` env var or `connection.local.json` (gitignored)

**Never commit** connection strings, SPKL logs, or `connection.local.json`.
