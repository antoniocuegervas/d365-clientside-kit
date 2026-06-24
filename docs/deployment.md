# Deployment

## Artifacts (§11.2)

| Artifact | Webresource / target |
|---|---|
| `dist/clientui/<prefix>clientui.html` | HTML webresource, the single shell entry |
| `dist/clientui/<prefix>clientui.js` | Script webresource the shell loads |
| `dist/clienthooks/<prefix>clienthooks.js` | Library webresource for form/ribbon/grid registration |
| `pcfs/<Control>/out/controls` | PCF, pack into a solution (`pac solution`) |

The publisher prefix lives in one place, `kit.config.json` at the repo root
(default `new_`). Change `publisherPrefix` there once and both the build and the
deploy use it, so the built artifact and the deployed webresource always share a
name. Never hardcode a customer prefix elsewhere in source.

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

`deploy.ps1` builds and runs `spkl.exe webresources` non-interactively, reading the
prefix from `kit.config.json` (the same file the build reads), so the built
artifacts and the deployed webresources always share a name. It renders
`spkl.template.json` into a gitignored `spkl.json` with that prefix. **Never commit**
connection strings, SPKL logs, or `connection.local.json`, .gitignore already
covers them; keep it that way.

## Hosting the shell

A webresource receives the full `Xrm` API (Web API, navigation, metadata) only
when it runs inside a model-driven app. Opening
`https://<org>/WebResources/new_clientui.html` as a top-level URL gives the page
no `Xrm` in this window or any parent frame, so the shell shows "Xrm was not
found" and stops. That is expected, the Unified Interface app shell is what
injects `Xrm`. Host the shell one of three ways:

- **Sitemap subarea (permanent nav entry):** add `new_clientui.html` as a Web
  Resource area in a model-driven app's navigation. It then loads in the app's
  content frame, where `parent.Xrm` is the real client API.
- **From a ribbon, form, or hook (in code):**
  `context.navigation.openClientUI("new_clientui.html", "<app-key>", { anyPayload })`
  opens the shell in the app context and passes the app key plus payload for you.
- **Quick test URL (no sitemap change):** inside any model-driven app, navigate to
  `…/main.aspx?appid=<app-id>&pagetype=webresource&webresourceName=new_clientui.html&data=<json>`
  where `<json>` is a URL-encoded `{"app":"<app-key>"}`. For example
  `data=%7B%22app%22%3A%22samples%22%7D` opens the samples hub. `appid` is any
  model-driven app in the org (a bare Dataverse environment ships none, so create a
  minimal one first), and the webresource need not be in that app's sitemap for
  `pagetype=webresource` to resolve.

The shell reads the app key from `?app=` or from the `data` JSON payload, so the
subarea and the navigateTo paths both select the right app.

## Source maps

`.map` files are generated locally for debugging but are NOT listed in
`spkl.template.json` and must not be deployed (Dataverse webresource size limits).

## Cache busting

Dataverse caches webresources aggressively, and a model-driven app serves a
stable script URL from cache forever even after a republish. The build defeats
this automatically: `clientui.html` references the bundle as
`new_clientui.js?v=<hash>`, where `<hash>` is the webpack compilation hash. A
changed bundle gets a new URL the browser and app cache must refetch, while the
webresource name itself stays stable (so ribbon/form registrations never go
stale). The token only changes when the bundle's content changes.

The practical workflow is therefore:
- redeploy (`deploy.ps1`, or `spkl webresources` on a current `dist/`), which
  publishes the new HTML and JS together;
- reload the app. The new HTML carries the new `?v=`, so the JS is refetched
  with no manual cache clearing.

If a reload still shows old HTML (the outer webresource, not the bundle), it is
the platform's own cache: publish customizations and reload once. For tight
inner-loop UI work, prefer Storybook (no live org needed) and deploy only for
metadata/integration checkpoints; that removes most publish cycles entirely. As
a last-resort fallback while testing, keep DevTools open with "Disable cache"
checked, which also bypasses the Unified Interface service worker.

## CI

`azure-pipelines.yml` runs the full local gate (lint → typecheck → build →
unit → smoke → storybook) plus conditional PCF builds when `shared/` or
`pcfs/` changed, and publishes `dist/` as a pipeline artifact for release
stages to pick up.
