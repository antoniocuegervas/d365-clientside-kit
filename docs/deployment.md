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

## PCF controls: production build, deploy, and the tabster pin

The field and grid PCFs (`pcfs/`) do not go through SPKL. Build a Release bundle and
import it in a solution:

- Build Release (production, minified), never `pac pcf push`, which ships a debug bundle
  that can blow past the 5 MB webresource ceiling. Wrap the controls in a solution project
  once (`pac solution init` plus a `pac solution add-reference` per control), then
  `dotnet build -c Release -p:SolutionPackageType=Unmanaged` and
  `pac solution import --force-overwrite --publish-changes`.
- Bump the control version in `ControlManifest.Input.xml` on every redeploy. Reimporting
  the same version publishes, but the form keeps serving the cached previous bundle, so a
  fix looks like it did not deploy.
- The done bar for a PCF is "opened on a real model-driven form and observed rendering",
  not "compiles" or "renders in the test harness". Two of the failure modes below only show
  once the control runs beside the platform's own Fluent.

### Re-pinning tabster to the host

A PCF that bundles its own React 18 and Fluent v9 shares one tabster (focus manager)
instance with the model-driven app on `window`. If the bundled tabster is newer than the
host's, a focus-managed component augments that shared instance with a shape the older host
copy lacks and throws during init, blanking the control with no data queries fired. So the
focus-managed controls pin their bundled Fluent chain to the host's platform-library floor:
`@fluentui/react-components` at the host version, with an `overrides` block forcing
`@fluentui/react-tabster` and `tabster` to the versions that host version resolves.

This pin is a standing maintenance cost, not a one-time fix. Microsoft advances the platform
Fluent on its release waves (roughly twice a year), and a fresh `npm install` floats the
bundled versions ahead again, so parity has to be re-established on the fork:

1. Read the host's live tabster version from a form: open any model-driven form in the
   target org, open the browser console, and read `window.__tabsterInstance._version`. Note
   the platform-library Fluent version too (the loaded `platformlibs/fluent/<ver>/` script).
2. Update `pcfs/fluent-pins.json` (the single source for the pin values), then set each
   pinned PCF's `@fluentui/react-components` and its `overrides` to match, and
   `npm install` in each to refresh the lockfiles. The pin check
   (`npm run check:pcf-pins`, part of `npm run verify`) fails until every PCF agrees with
   the pins file, so a missed manifest cannot slip through, and a brand-new PCF that
   skips the pin or the webpack dedupe is caught the same way.
3. Rebuild Release and redeploy, with the manifest version bump above.
4. Verify on a live form: open a record and confirm each control renders. A build that
   succeeds is not evidence, the collision only shows on the shared-window host.

Which controls carry the pin: the focus-managed ones (date picker, option set, native
lookup, counterparty grid), because the Fluent controls they use (DatePicker, Dropdown,
Combobox, DataGrid, the lookup flyout) genuinely engage tabster. The tooltip control does
not: it renders on a Fluent Tooltip (positioning only, no focus trap), which never touches
the shared instance, so it carries no pin and needs no re-pin. That was confirmed by
bundling a deliberately newer tabster than the host and watching it still render.

### The error boundary

Every PCF renders its control inside the shared `ErrorBoundary`
(`shared/controls/presentational/ErrorBoundary.tsx`), so a render throw (a bad prop, or a
tabster collision that slips through between re-pins) shows a neutral "could not be
displayed" message instead of a silently blank container. That message is plain markup with
no Fluent, on purpose, so it still renders when the failure is in the Fluent stack itself.

### How many kit PCFs one form should carry (the budget)

Each kit PCF bundles its own React and Fluent copy; the webpack dedupe is within a
control, never across controls, so two kit PCFs on one form parse two React and two
Fluent copies. Measured production bundle sizes (minified, this repo's builds):

| Control | Bundle |
|---|---|
| KitTooltip | ~350 KB |
| KitOptionSet | ~380 KB |
| KitDatePicker | ~580 KB |
| KitNativeLookup | ~610 KB |
| KitCounterpartyGrid | ~750 KB |

The download amortizes (webresources cache hard, as this doc keeps saying), but the
parse and execute cost repeats on every form load, per control. The working
recommendation until live numbers say otherwise: **three or four kit field PCFs per
form, plus at most one kit grid PCF.** If a form wants more kit UI than that, deliver
that cluster as one webresource app instead (a section-embedded shell page): one
bundle, one React, and every control in it shares both, which is exactly the
per-control tax the PCF shape cannot avoid.

A first live datapoint (a small dev org, 2026-07): the sample Contact main form
carrying four kit PCFs (tooltip, choice, date picker, native lookup) plus the
timeline opened in 1.03 to 1.17 seconds warm, median about 1.09 s over four full
reloads, reading the Unified Interface page-load KPI from the `&perf=true`
overlay. That is an absolute time, not a delta: the kit-free twin form was not
measured, so the number bounds the cost rather than isolating it. What it does
establish is that four kit controls coexist with a normal, roughly one-second
warm form load. The remaining measurement is the A/B delta against a twin form
without the kit controls; create that twin in the form designer, not through the
raw API (an API-created form never joins the entity's form order, so the app
will not offer it), and re-take the numbers alongside the per-wave re-pin above.

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

The repo's own pipeline (below) covers the build-and-verify half of this; the
export/import promotion half lives with your fork, since it is bound to your
environments and connections.

## CI

`azure-pipelines.yml` runs the full local gate (lint → typecheck → build →
unit → smoke → storybook) plus conditional PCF builds when `shared/` or
`pcfs/` changed, and publishes `dist/` as a pipeline artifact for release
stages to pick up.
