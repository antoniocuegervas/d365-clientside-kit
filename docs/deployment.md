# Deployment

Expectation-setting up front: this guide assumes you already deploy webresources to a
Dataverse org some way (SPKL here, but any webresource deployment works) and have a
model-driven app to host them. Without an org you can still run everything locally,
Storybook and the full verify gate, you just cannot see the controls on a real form.

## Artifacts

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

### The Fiddler inner loop (edit webresource code without deploying)

The fastest webresource loop serves your LOCAL bundle to the LIVE org, so an
edit is a rebuild plus a browser refresh, no publish at all. Any HTTPS debug
proxy with response replacement works; with Fiddler Classic:

1. **Tools → Options → HTTPS**: enable "Capture HTTPS CONNECTs" and "Decrypt
   HTTPS traffic", and accept the root certificate prompt (the org runs over
   HTTPS, so Fiddler must be able to open it).
2. **AutoResponder tab**: check "Enable rules" AND "Unmatched requests
   passthrough" (without passthrough the rest of the org goes dark).
3. Add a rule matching the bundle by NAME, not full URL:
   `regex:(?insx).*new_clientui\.js` → the local file
   `<repo>\dist\clientui\new_clientui.js`. The artifact name is stable across
   builds on purpose (webpack.config.mjs keeps it deterministic) precisely so
   this one rule keeps matching.
4. `npm run build` (or `build:dev` for faster rebuilds), refresh the browser
   tab. The shell HTML requests the script with a `?v=<hash>` cache-buster,
   which the rule ignores (it matches the name), so the browser always asks
   and Fiddler always answers with your local file.
5. When you are done, disable the rule before judging real deployed behavior,
   and remember the HTML entry itself still comes from the org: changes to
   `clientui.html` (rare) do need a deploy.

If the replaced bundle does not seem to load, check the browser did not cache
it (DevTools → Network → Disable cache while DevTools is open) before
suspecting the rule.

### How the shell reaches Xrm (and the deprecation exposure)

By default the shell finds `Xrm` by walking ancestor frames (`parent.Xrm`),
which works everywhere today but sits on Microsoft's deprecation list with an
unannounced removal date. For a FORM-hosted shell there is a supported path:
register the clienthooks handler `CrmClientSide.KitShell.connect` on the
form's OnLoad (pass execution context; optionally the webresource control's
name as the string parameter). It pushes the form's `Xrm` and form context
into the shell through the web resource control's `getContentWindow`, the
mechanism the deprecation guidance points to, and the shell prefers that over
the walk. Sitemap-hosted and quick-test-URL shells have no form to register
the hook on, so they continue to boot over the walk; that residual exposure
is the platform's to resolve (there is no supported alternative for a
standalone webresource today), and if `parent.Xrm` is ever removed, those
hosting shapes stop booting until one exists.

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

## PCF controls: production build, deploy, and the platform-library floor

The field and grid PCFs (`pcfs/`) do not go through SPKL. Build a Release bundle and
import it in a solution:

- Build Release (production, minified), never `pac pcf push`, which ships a debug bundle.
  Wrap the controls in a solution project once (`pac solution init` plus a
  `pac solution add-reference` per control), then
  `dotnet build -c Release -p:SolutionPackageType=Unmanaged` and
  `pac solution import --force-overwrite --publish-changes`.
- Bump the control version in `ControlManifest.Input.xml` on every redeploy. Reimporting
  the same version publishes, but the form keeps serving the cached previous bundle, so a
  fix looks like it did not deploy.
- The done bar for a PCF is "opened on a real model-driven form and observed rendering",
  not "compiles" or "renders in the test harness". Several failure modes only show once
  the control runs inside the real host.

### Virtual controls and the platform-library floor

Every kit PCF is a `control-type="virtual"` control: the platform hands it the host's
OWN React and Fluent at runtime, so the bundles carry neither (tens of KB each instead
of hundreds), native fidelity tracks the host automatically, and there is exactly one
focus-management (tabster) instance on the page, the host's, so the version-skew
collision that used to blank bundled controls is structurally impossible. The old
re-pin-per-wave runbook is retired with it.

Two version floors matter, and they are deliberately different numbers, both held in
`pcfs/platform-floor.json` and enforced by `npm run check:pcf-floor` (first step of
`npm run verify`):

- **The declared floor** (`platform-library` in each manifest): the version the org
  must ACCEPT at solution import. Declaring newer than the org supports fails the
  import; the runtime serves its current copy regardless, so the manifests declare
  low (React 16.14.0, Fluent 9.46.2) and receive current.
- **The API floor** (`@fluentui/react-components` in each PCF's devDependencies): the
  oldest Fluent delivery the kit's code actually works against. Every PCF compiles
  with exactly this version, so using an API the floor does not export fails the
  build; there is no hand-kept API list to drift. Raise it deliberately when the kit
  adopts a newer Fluent API, and state the supported floor in the README.

The checker also holds the rest of the virtual posture in place: react-dom
externalization stays switched on (`pcfReactPlatformLibraries` in featureconfig.json),
React and Fluent stay out of `dependencies`, and shared code stays clear of
React-18-only APIs (the webresource shell bundles React 18, but the PCF host serves
React 16/17, and shared code runs on both). It also walks each control's import
graph, its own sources plus every shared module it reaches, and fails on any
`@fluentui/*-compat` import the control does not declare: an undeclared one
resolves from the repo root and bundles an unpinned tabster chain while the
build stays green, which is exactly how a new control that renders a shared
date or time field would reproduce the collision the pins exist to prevent.

Two packages are not platform libraries and still ride in bundles where used: the icon
package (each control bundles just the icons it imports, aliased to one copy), and the
date and time picker compat packages (`KitDatePicker` bundles them, pins their internal
tabster chain to the host instance via `overrides`, and aliases them in
webpack.config.js; the checker enforces exactly that combination and rejects tabster
overrides anywhere else). Overlay surfaces in an embedded host render in place or with
an in-tree mount point rather than in a document-level portal, where the theme's CSS
variables do not reach; the lookup flyout, the date picker calendar, the time list, and
the grid hovercard all follow that pattern.

### Standard controls (historical note, and for consumers who bundle)

A consumer can still build a `control-type="standard"` PCF that bundles its own React
and Fluent, and everything the kit learned about that shape remains true: webpack must
dedupe React and Fluent to one copy each (a custom webpack.config.js aliasing them to
the project's node_modules), the bundled Fluent must pin `@fluentui/react-tabster` and
`tabster` to what the host's platform library resolves or a focus-managed component
blanks the control, and the pin must be re-verified every release wave. For scale: the
kit's own controls as standard builds weighed 350 to 750 KB each (tooltip 350, option
set 380, date picker 580, native lookup 610, counterparty grid 750), and each bundled
its own React and Fluent copy per control on the form. The virtual migration retired
all of that for the kit's controls; reach for standard only when a control needs a
library version the platform will not serve.

### The error boundary

Every PCF renders its control inside the shared `ErrorBoundary`
(`shared/controls/presentational/ErrorBoundary.tsx`), so a render throw (a bad prop, or a
tabster collision that slips through between re-pins) shows a neutral "could not be
displayed" message instead of a silently blank container. That message is plain markup with
no Fluent, on purpose, so it still renders when the failure is in the Fluent stack itself.

### Form budget

Virtual controls collapse the old per-form bundle budget. Measured production bundle
sizes after the migration (minified, this repo's builds): option set 7 KB, tooltip
54 KB, native lookup 78 KB, counterparty grid 82 KB, date picker 380 KB (the one
control that still bundles the date and time picker compat packages, which the
platform library does not carry). React and Fluent load once, from the platform, no
matter how many kit controls a form carries, so the old three-or-four-per-form
guidance no longer applies; the remaining per-control cost is each control's own
logic, and the date picker's compat payload is the only line worth watching.

Live datapoints (a small dev org, 2026-07, Unified Interface page-load KPI from the
`&perf=true` overlay, four warm full reloads each): the sample Contact main form
carrying four kit PCFs plus the timeline opened in 1.03 to 1.17 seconds (median
about 1.09 s) with the standard builds, every control bundling its own React and
Fluent, and in 1.24 to 1.86 seconds (median about 1.4 s) with the virtual builds
on a later day. The two sessions are not a controlled A/B (different days, org
load, and cache states; single-org, small samples), so read them as the same
conclusion twice: a form with four kit controls opens warm in roughly a second
and a half either way, and the virtual migration's wins are the ones it was made
for, the retired re-pin runbook, the collapsed bundles, and fidelity tracking the
host, not a headline load-time delta.

## ALM: shipping the controls to customers, not just trying the samples

The managed **sample solution** on the Releases page is a demo artifact: it
exists so someone can try the kit on a trial org and uninstall it cleanly. It is
not the shape a customer deployment ships in. When your fork goes to a real
customer, own the ALM like any other Dataverse code component:

- **Your solution, your publisher.** Create a solution under your own publisher
  prefix (set it once in `kit.config.json`), and put the shell webresources, the
  hook library, and your PCF controls in it. Nothing from the sample solution
  should reach a customer environment.
- **Two solutions when forms are involved.** Keep the kit artifacts
  (webresources, PCF controls) in their own solution, separate from the app
  customizations that reference them (the forms and views a PCF is bound to).
  Controls then promote independently of form changes, and the import order is
  always controls first, then the app solution that depends on them.
- **Unmanaged in dev, managed everywhere else.** Develop and iterate against an
  unmanaged solution in dev, export managed, and promote the managed artifact
  through test to prod, via `pac solution export`/`import` in a pipeline or
  Power Platform pipelines. Never hand-edit customizations in test or prod.
- **Version on every promotion.** Bump the solution version each export, and
  bump each changed PCF's `<control version>` in its manifest (the cache rule
  above applies in every environment, not just dev). The shell webresource
  needs no rename: the cache-busted HTML entry handles it.
- **Uninstall behavior.** A managed uninstall removes the webresources and
  controls, but only after nothing references them: forms still binding a kit
  PCF block the uninstall as dependencies. Remove the bindings (or uninstall
  the dependent app solution) first, then the controls solution. Try the order
  once in test before you rely on it in prod.
- **Metadata is cached per session.** The kit caches metadata reads (labels,
  option sets, view layouts) for the life of the page, so a user with an open
  session keeps seeing pre-promotion metadata until they reload. That is not a
  failed deployment. Where an app needs to pick changes up in place, call
  `context.metadata.clearCache()` and re-run its loads; and remember the form
  definition itself has its own client-side cache (the IndexedDB note in
  gotchas).

The repo's own pipeline (below) covers the build-and-verify half of this; the
export/import promotion half lives with your fork, since it is bound to your
environments and connections.

## CI

`azure-pipelines.yml` runs the full local gate (lint → typecheck → build →
unit → smoke → storybook) plus conditional PCF builds when `shared/` or
`pcfs/` changed, and publishes `dist/` as a pipeline artifact for release
stages to pick up.
