# Deployment

## Artifacts (§11.2)

| Artifact | Webresource / target |
|---|---|
| `dist/clientui/<prefix>clientui.html` | HTML webresource, the single shell entry |
| `dist/clientui/<prefix>clientui.js` | Script webresource the shell loads |
| `dist/clienthooks/<prefix>clienthooks.js` | Library webresource for form/ribbon/grid registration |
| `pcfs/<Control>/out/controls` | PCF, pack into a solution (`pac solution`) |

The publisher prefix is configurable: `PUBLISHER_PREFIX=contoso_ npm run build`
(default `new_`). Never hardcode a customer prefix in source.

## SPKL publish

```powershell
# one-time: restore spkl
nuget install spkl -OutputDirectory deployment/packages

# connection via env var (preferred for CI) …
$env:SPKL_CONNECTION = "AuthType=OAuth;Url=https://org.crm.dynamics.com;..."
./deployment/deploy.ps1

# … or via deployment/connection.local.json (gitignored):
# { "connectionString": "AuthType=OAuth;Url=..." }
```

`deploy.ps1` builds with the requested prefix and runs
`spkl.exe webresources` non-interactively. **Never commit** connection
strings, SPKL logs, or `connection.local.json`, .gitignore already covers
them; keep it that way.

## Source maps

`.map` files are generated locally for debugging but are NOT listed in
`spkl.json` and must not be deployed (Dataverse webresource size limits).

## Cache busting

Dataverse caches webresources aggressively. After publishing:
- model-driven apps generally pick up published changes on reload;
- if a form still serves a stale bundle, bump the webresource (republish) or
  hard-reload with cache disabled while testing;
- avoid renaming the bundle per release, keep one stable name and rely on
  publish + reload, so ribbon/form registrations never go stale.

## CI

`azure-pipelines.yml` runs the full local gate (lint → typecheck → build →
unit → smoke → storybook) plus conditional PCF builds when `shared/` or
`pcfs/` changed, and publishes `dist/` as a pipeline artifact for release
stages to pick up.
