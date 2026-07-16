---
name: d365kit-run-and-operate
description: "Operations runbook for the D365 Client-Side UI Kit repo; load it when running the samples or Storybook locally, hosting the clientui shell in a model-driven app, deploying webresources (deploy.ps1, SPKL, the Fiddler loop) or PCF controls, building the D365UIKit solution zip, opening your dev org, registering or console-testing client hooks, busting Dataverse caches, or verifying anything on a real form."
---

# Run and operate the D365 Client-Side UI Kit

This is the operations skill: how to run the kit locally with zero org, how to
host and exercise it on a live dev org, how to deploy each artifact tier, and
the cache rituals that make deployments visible.

Examples use the committed `new_` prefix and the `yourorg.crm.dynamics.com`
placeholder; substitute your own prefix (from `kit.config.json`) and org URL.
Be deliberate about which org you point deploys at: use a dev org you own, and
keep customizations inside one solution you control.

## Your org card (fill in once per environment)

Keep a local note (NOT committed if the values are private) with:

| Item | Value |
|---|---|
| Org | `https://yourorg.crm.dynamics.com` |
| Model-driven app id | `<app-guid>` (any app in the org works for the quick-test URL) |
| Samples hub URL | `https://yourorg.crm.dynamics.com/main.aspx?appid=<app-guid>&pagetype=webresource&webresourceName=<prefix>clientui.html&data=%7B%22app%22%3A%22samples%22%7D` |
| Maker portal solution | the solution that holds YOUR kit customizations |

Recommended org conventions (the ones this repo works by):

- **All org customizations** (tables, columns, forms, control bindings,
  commands) go in ONE solution in the maker portal, nowhere else.
- **Hide, don't remove:** when a verification needs a field or control placed
  on a form, leave it on the form HIDDEN afterwards instead of removing it (so
  it can be unhidden to retest). One exception: a control binding blocks a
  managed solution uninstall, so import-verification bindings get fully
  removed before the uninstall.

## 1. Run locally with zero org

A fresh workspace needs `npm install` first (engines: Node >=24 <25, npm >=11
<12; fresh-machine setup and the install-vs-ci story: `d365kit-build-and-env`).
Then:

```powershell
npm run storybook       # dev server on http://localhost:6006
npm run verify          # the whole local gate, in order
```

Storybook covers presentational controls AND whole sample screens: the
scenario stories under `tests/storybook/scenarios/` recreate each sample
screen from presentational controls on fixture data (the story plays the
ViewModel; zero CRM mocks in stories is a hard rule). One of them,
`templateAppRealWiring.stories.tsx`, boots the app's real View + ViewModel
against the shared fake context and is the pattern a new app's story copies.
This is the fastest UI loop by far; deploy only for metadata and integration
checkpoints.

`npm run verify` runs, in order: `check:pcf-floor`, `check:layer-boundaries`,
`lint`, `typecheck`, `build`, `test`, `smoke`, `build-storybook`. Run it bare and read npm's own
exit code; never pipe it through `tail` or similar (the exit code becomes the
pipe's). `npm run smoke` on its own requires a prior `npm run build`; smoke
loads the production `dist/` bundles.

### The sample apps (registry: `clientui/apps/index.ts`)

| App key | What it demonstrates | Use as few-shot reference for |
|---|---|---|
| `samples` | Samples hub: launcher tiles for every sample; shows a "Hosted beside (entity) record (id)" line when form-hosted | Nothing, it is the landing app |
| `template` | Minimal scaffold: registration + View + ViewModel | Standard fields in a webresource or PCF; the copy-from starting point |
| `sample-company-search` | Saved view + code-level control | Saved-view grid + selection + edit panel |
| `sample-master-detail` | Account grid + editable contact | Master grid driving an editable detail form |
| `sample-opportunity-search` | Kitchen-sink filters | Filter form over an entity |
| `sample-territory-cascade` | Chained lookups + option set | Dependent lookups |
| `sample-new-account-wizard` | Multi-step gated input | Wizard with an in-memory draft |
| `sample-merged-grid` | Rows from two FetchXML queries | Rows merged from several queries |
| `sample-activities-grid` | All activity types merged | Mixed activity types in one list |
| `sample-counterparty-grid` | Cross-type activities with the external party (the flagship; same feature ships as the `KitCounterpartyGrid` dataset PCF) | Synthesized-column, cross-type dataset work |

A NEW app does not appear in Storybook by itself; write a scenario story for
it (`docs/adding-a-webresource-app.md`, step 3).

## 2. Hosting the shell: URL anatomy

A webresource only receives `Xrm` inside a model-driven app. The quick-test
URL recipe, part by part:

| Part | Value | Notes |
|---|---|---|
| Base | `https://yourorg.crm.dynamics.com/main.aspx` | Your org base |
| `appid` | a model-driven app id | Any app in the org works; the webresource need NOT be in its sitemap |
| `pagetype` | `webresource` | Literal |
| `webresourceName` | `<prefix>clientui.html` | The single HTML shell entry |
| `data` | URL-encoded `{"app":"<app-key>"}` | In a console: `encodeURIComponent('{"app":"samples"}')` gives `%7B%22app%22%3A%22samples%22%7D` |

Swap the `data` payload's app key for any row in the table above to open that
sample directly. The shell also reads `?app=` (used by sitemap subareas), and
`context.navigation.openClientUI("<prefix>clientui.html", "<app-key>", { payload })`
opens it from a ribbon, form, or hook.

Where `Xrm` comes from: by default the shell walks ancestor frames
(`parent.Xrm`), which is on Microsoft's deprecation list. A FORM-hosted shell
has the supported alternative: register `CrmClientSide.KitShell.connect` on
the form's OnLoad (section 6); the shell prefers the injected Xrm and adopts a
late-landing injection through a live form-page source. Sitemap and
quick-test-URL shells have no form, so they stay on the walk.

Opening the raw `https://yourorg.crm.dynamics.com/WebResources/<prefix>clientui.html`
as a top-level URL gives NO `Xrm` in any frame; the shell shows "Xrm was not
found" and refuses to boot. That is expected, not a defect.

## 3. Webresource dev inner loop

`npm run build` (production) or `npm run build:dev` (faster) writes `dist/`,
with names taken from the `kit.config.json` prefix. The three shipped
webresources, exactly as `deployment/spkl.template.json` maps them:

| Webresource unique name | Built file | Type | Role |
|---|---|---|---|
| `<prefix>clientui.html` | `dist/clientui/<prefix>clientui.html` | HTML (1) | Unified client UI shell, single HTML entry, `?app=` selection |
| `<prefix>clientui.js` | `dist/clientui/<prefix>clientui.js` | Script (3) | Client UI bundle, shell + registered apps |
| `<prefix>clienthooks.js` | `dist/clienthooks/<prefix>clienthooks.js` | Script (3) | `CrmClientSide` form/ribbon/grid hook library |

`.map` files are generated locally but never deployed (Dataverse size limits;
the template does not list them).

### deploy.ps1 anatomy (SPKL publish)

`deployment/deploy.ps1` is non-interactive. What it does, in order:

1. Reads `kit.config.json`: `publisherPrefix` (required, throws if missing)
   and optional `solutionName` (defaults to `D365UIKit`; the webresources land
   in that solution).
2. Resolves the connection string: `$env:SPKL_CONNECTION` wins; else
   `deployment/connection.local.json` with shape
   `{ "connectionString": "AuthType=OAuth;Url=...;..." }`. Both are
   gitignored; never commit either.
3. Runs `npm run build` at the repo root (webpack reads the same
   `kit.config.json`, so artifact and webresource names cannot drift).
4. Renders `deployment/spkl.template.json` to the gitignored
   `deployment/spkl.json`, replacing `{{prefix}}` and `{{solution}}`.
5. Runs `spkl.exe webresources <manifest> <connection>`. It expects
   `deployment/packages/spkl/tools/spkl.exe`; restore once with
   `nuget install spkl -OutputDirectory deployment/packages`, or pass
   `-SpklPath`.

```powershell
# one-time
nuget install spkl -OutputDirectory deployment/packages

# per session (the string is an XrmTooling connection string)
$env:SPKL_CONNECTION = "AuthType=OAuth;Url=https://yourorg.crm.dynamics.com;Username=<you>;AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=Auto"
./deployment/deploy.ps1
```

### The Fiddler autoresponder loop (the single biggest webresource speed-up)

Serve your LOCAL bundle straight to the LIVE org, no deploy, no publish: an
edit becomes rebuild + browser refresh. With Fiddler Classic:

1. Tools, Options, HTTPS: enable "Capture HTTPS CONNECTs" and "Decrypt HTTPS
   traffic", accept the root certificate.
2. AutoResponder tab: check "Enable rules" AND "Unmatched requests
   passthrough" (without passthrough the rest of the org goes dark).
3. Add a rule matching the bundle by NAME, not full URL:
   `regex:(?insx).*<prefix>clientui\.js` mapped to your local
   `dist\clientui\<prefix>clientui.js`. The artifact name is deterministic
   across builds precisely so this one rule keeps matching.
4. `npm run build` (or `build:dev`), refresh the browser tab. The shell HTML
   requests the script with a `?v=<hash>` cache-buster; the rule ignores it
   (name match), so Fiddler always answers with your local file.
5. Disable the rule before judging real deployed behavior. The HTML entry
   itself still comes from the org: changes to `clientui.html` (rare) do need
   a deploy.

If the replaced bundle does not seem to load, open DevTools, Network, check
"Disable cache" before suspecting the rule. The same technique works for
`<prefix>clienthooks.js`.

## 4. The PCF deploy loop

The five controls: `KitOptionSet`, `KitTooltip`, `KitDatePicker`,
`KitNativeLookup`, `KitCounterpartyGrid`. Manifest path pattern:
`pcfs/<Control>/<Control>/ControlManifest.Input.xml`. PCFs do NOT go through
SPKL.

For a fast dev loop, scaffold an UNTRACKED local wrapper solution per group of
controls you deploy together. The `pcfs/_*` naming keeps the floor checker and
the size report out of it (they skip that prefix by convention):

```powershell
mkdir pcfs/_myDeploy; cd pcfs/_myDeploy
pac solution init --publisher-name YourPublisher --publisher-prefix new
pac solution add-reference --path ../KitNativeLookup     # repeat per control
```

Then the loop:

```powershell
# 1. MANDATORY: bump <control version="..."> in the control's ControlManifest.Input.xml,
#    or the platform serves the stale cached bundle (the import "succeeds" anyway).
# 2. Build the wrapper, unmanaged, Release (production bundle):
dotnet build pcfs/_myDeploy -c Release -p:SolutionPackageType=Unmanaged
# 3. Import the zip from the wrapper's bin/Release (named after the wrapper):
pac solution import --path pcfs/_myDeploy/bin/Release/_myDeploy.zip --force-overwrite --publish-changes
```

ALWAYS read the pac output TEXT for "Error": pac can exit 0 on a failed
import.

Then bind or verify in the form designer, inside your solution in the maker
portal: select the column, Components, + Component, pick the control
(registered name `<prefix>D365Kit.<Constructor>`), save, publish, hard-refresh
(Ctrl+Shift+R). The done bar for a PCF is "renders on a real deployed form",
never "compiles".

Small controls can alternatively `pac pcf push --publisher-prefix <prefix
WITHOUT trailing underscore>` for a quick dev push, but it ships a DEBUG
bundle (5 MB webresource ceiling, no production switch); never ship that way
(docs/adding-a-pcf.md).

Identity warning (learned from a live rejection): a control's
`namespace.constructor` (`D365Kit.KitOptionSet`) is org-global ACROSS
publishers; the prefix decorates the name but creates no second identity. A
fork that must coexist with another kit deployment in one org needs its own
manifest namespace, not just its own publisher.

Packer warning: `pac solution init` scaffolds
`Microsoft.PowerApps.MSBuild.Solution` at `1.*`, a 1.x SolutionPackager. Fine
for a controls-and-webresources wrapper like this, but a 1.x packer silently
DROPS component types it does not recognize when packing from unpacked source
(an AI Builder prompt was dropped with only a "root components are not defined
in customizations" warning, no error). If the wrapper ever grows another
component type, bump the pin to 2.x first. The kit's own
`deployment/solution` wrapper is pinned to 2.8.1 for this reason. Do not touch
the `.pcfproj` `Microsoft.PowerApps.MSBuild.Pcf` `1.*` pins: that is the PCF
builder, a different package, and it stays 1.x.

## 5. The release artifact: the kit solution zip

`deployment/solution/D365UIKit.cdsproj` packs the five PCFs (Release builds)
plus the three shell webresources into one solution zip, from the repo alone,
no org, no secrets:

```powershell
npm install                                    # once, fresh workspace
npm run build                                  # dist/ must exist or render-src.mjs fails with a clear message
dotnet build deployment/solution -c Release    # managed zip: deployment/solution/bin/Release/D365UIKit.zip
```

- Default output is **Managed** (the release shape); add
  `-p:SolutionPackageType=Unmanaged` for a dev import.
- `render-src.mjs` runs before packing (the `RenderSolutionSrc` target): it
  stamps publisher, prefix, and solution name from `kit.config.json` and the
  version from `package.json` into `src/Other/Solution.xml`, and stages the
  three webresources from `dist/` with their `.data.xml` definitions.
  Webresource ids are UUID v5 over the name, so rebuilds keep component
  identity and a newer import UPDATES a prior one.
- The committed `deployment/solution/src/Other/Customizations.xml` MUST keep
  its empty `<WebResources />` node. Without it SolutionPackager silently
  packs the files but registers no webresource components, and an import
  creates nothing.
- The zip carries whatever prefix your `kit.config.json` names; a
  committed-config build carries `new_`.
- The kit's own releases carry only the managed SAMPLE solution (a demo
  export); the kit zip is built by consumers, deliberately not a download
  (importing a downloaded copy would pin the controls' org-global namespace
  against any later fork in the same org). Before importing a kit zip
  anywhere, the org must be clean for it (three checks) or use the
  verification-only throwaway-namespace technique: both are in
  `docs/deployment.md`, ALM chapter.

## 6. Client hooks operations

Hooks ship in the `CrmClientSide` UMD bundle
(`dist/clienthooks/<prefix>clienthooks.js`). The export path in
`clienthooks/index.ts` IS the registration name. Current inventory:

| Registration name | Kind | CRM wiring |
|---|---|---|
| `CrmClientSide.Account.Form.onLoad` | Form event | Add the library, set the function name, check "pass execution context" |
| `CrmClientSide.Account.Form.onSave` | Form event | Same |
| `CrmClientSide.Account.Ribbon.openCompanySearch` | Ribbon command (modal) | CrmParameter: `PrimaryControl` |
| `CrmClientSide.Account.Ribbon.openCompanySearchPane` | Ribbon command (side pane) | CrmParameter: `PrimaryControl` |
| `CrmClientSide.Account.Ribbon.isRecordSaved` | Enable rule | CrmParameter: `PrimaryControl` |
| `CrmClientSide.LockedGrid.onRecordSelect` | Editable grid event | Register on `OnRecordSelect` |
| `CrmClientSide.KitShell.connect` | Form OnLoad | Pass execution context; optional string parameter names ONE webresource control, default connects all |

Registering (distilled from `docs/adding-a-client-hook.md`): upload
`<prefix>clienthooks.js` as a library webresource, add it to the form, wire
events with the function names above. CRM loads libraries before firing
events, so `Xrm` is always present when a handler runs.

`KitShell.connect` is not a template: it is the supported boot path for
form-hosted shells. It pushes the form's `Xrm` and form context into every
webresource control via `getContentWindow`; the shell adopts a late injection
through a live source, so registration order needs no care. Note: the modern
form designer has no "Custom Parameter(data)" field, so a form-embedded
webresource control's `data` payload has to be patched into the form XML via
the Web API if you need one.

### Console-injection live test

Exercise a LOCAL hooks build against a LIVE form without deploying or
registering anything:

1. Open a record form in your app; open DevTools.
2. Paste the entire text of `dist/clienthooks/<prefix>clienthooks.js` into the
   console. The UMD bundle defines `window.CrmClientSide`.
3. Invoke handlers directly. `ClientHook.formContextOf` accepts an execution
   context OR a bare form context, and current UCI still serves the deprecated
   `Xrm.Page` (recorded; re-verify), so both shapes work:

```js
CrmClientSide.Account.Form.onLoad({ getFormContext: () => Xrm.Page });
CrmClientSide.Account.Form.onSave({ getFormContext: () => Xrm.Page });
// Ribbon default targets new_clientui.html; point it at your real name first:
CrmClientSide.Account.Ribbon.webResourceName = "<prefix>clientui.html";
CrmClientSide.Account.Ribbon.openCompanySearch(Xrm.Page);
```

4. Limits: `LockedGrid.onRecordSelect` needs a real grid event context, and
   `KitShell.connect`'s injection only proves anything with a form-embedded
   shell webresource present.

## 7. Cache busting and publish rituals

The build defeats the worst of Dataverse caching automatically:
`clientui.html` references the bundle as
`<prefix>clientui.js?v=<webpack compilation hash>`, so a changed bundle is a
new URL while the webresource NAME stays stable (registrations and the
Fiddler rule never go stale). Normal flow: redeploy (HTML + JS publish
together), reload the app, done.

| Symptom | Ritual |
|---|---|
| Reload still shows old shell HTML | Platform cache: publish all customizations, reload once |
| PCF fix "did not deploy" | You did not bump the manifest `<control version>`; bump and reimport (section 4) |
| Published change still invisible | Full publish, then clear the browser's Cache Storage (DevTools, Application, Cache Storage) and reload |
| Empty form after rapid publish bursts | Recorded UCI behavior: let one full publish settle, clear Cache Storage, reload |
| Form-embedded webresource never mounts on soft navigation | UCI mounts below-the-fold webresource controls lazily or not at all on soft navigations (recorded): hard reload the form |
| Stale labels, option sets, or view layouts after a deploy | Per-session metadata cache: reload, or call `context.metadata.clearCache()` in-app |
| Form definition itself stale after designer changes | Client-side form cache (IndexedDB): see `docs/gotchas.md` |
| Anything deeper or weirder | Route to the sibling skill `d365kit-debugging-playbook` |

Last-resort while testing: keep DevTools open with "Disable cache" checked
(also bypasses the Unified Interface service worker). And prefer Storybook for
tight UI loops; most publish cycles should never exist.

## 8. After-deploy verification quickies

Fast acceptance after any webresource deploy:

1. Open the samples hub URL (your org card). Expect the hub tiles, console
   free of errors.
2. Open company search (hub tile, or swap the `data` payload to
   `%7B%22app%22%3A%22sample-company-search%22%7D`). Expect LIVE account rows
   to load.
3. If form-hosted, expect the hub's "Hosted beside (entity) record (id)" line
   once the record resolves.

The full manual sandbox checklist (`docs/testing.md`):

1. Deploy webresources, open the shell inside a model-driven app (never the
   raw `/WebResources/` URL).
2. Walk each sample; compare controls side by side with native UCI forms
   (labels, spacing, focus, validation, hover).
3. Register the example hooks on Account form/ribbon/grid; verify behavior.
4. Install PCFs from `pcfs/*/out` via a solution; bind to columns and verify
   on a real form.

Perf question? Append `&perf=true` to the app URL for the UCI page-load KPI
overlay (the baseline numbers live in `docs/deployment.md`, form-budget
section).

## 9. Artifact landing zones

All build output is gitignored; nothing below is ever committed.

| Path | What lands there | Produced by |
|---|---|---|
| `dist/clientui/`, `dist/clienthooks/` | The three webresources plus local-only `.map` files | `npm run build` / `build:dev` |
| `pcfs/<Control>/out/controls` | Per-control PCF build output | `npm run build` inside the control |
| `pcfs/_*/bin/Release/*.zip` | Unmanaged dev-import zips from your untracked wrappers | `dotnet build` on a wrapper |
| `deployment/solution/bin/Release/D365UIKit.zip` | The kit solution zip (managed by default) | `dotnet build deployment/solution -c Release` |
| `deployment/solution/src/WebResources/`, `src/Other/Solution.xml` | Rendered staging (gitignored halves of the solution source) | `render-src.mjs` (runs inside the build) |
| `deployment/spkl.json` | Rendered SPKL manifest | `deploy.ps1` |
| `storybook-static/` | Built Storybook | `npm run build-storybook` |
| `coverage/` | Jest coverage report | `npm run coverage` |

## When NOT to use this skill

| You are trying to... | Go to |
|---|---|
| Diagnose broken behavior beyond the section 7 rituals (blank controls, boot failures, metadata weirdness) | `d365kit-debugging-playbook` |
| Install or toolchain breakage, fresh-machine setup, npm install vs npm ci | `d365kit-build-and-env` |
| kit.config.json semantics, prefix and version POLICY, manifest-version rules beyond the bump step in section 4 | `d365kit-config-and-versioning` |
| What evidence a claim needs (live-verification protocols) | `d365kit-validation-and-qa` |
| Measuring perf, size, or renders | `d365kit-diagnostics-and-tooling` |
| An unfamiliar platform term (SPKL, UMD, solution, publisher prefix, execution context) | `dataverse-clientside-reference` |
| Why a deploy or org constraint exists (import identity, tabster history) | `docs/internal/decisions.md` (the decision log) |
| Designing an org probe or staged experiment rather than a routine deploy | `d365kit-proof-and-analysis-toolkit` |
| Author a new webresource app, PCF, or client hook | `docs/adding-a-webresource-app.md`, `docs/adding-a-pcf.md`, `docs/adding-a-client-hook.md` |
| Understand or defend the architecture | `d365kit-architecture-contract` |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: `docs/deployment.md` (primary), `deployment/deploy.ps1`,
`deployment/spkl.template.json`, `deployment/solution/render-src.mjs`,
`deployment/solution/D365UIKit.cdsproj`, `docs/testing.md`,
`docs/adding-a-webresource-app.md`, `docs/adding-a-client-hook.md`,
`docs/adding-a-pcf.md`, `clientui/apps/index.ts`, `clienthooks/index.ts`,
`webpack.config.mjs`, `package.json`.

Drift-prone facts, one-line re-verification each:

| Fact | Re-verify with |
|---|---|
| Webresource names and mapping | `Get-Content deployment/spkl.template.json` |
| App keys | `Select-String -Path clientui\apps\*\app.ts -Pattern 'registerApp' -Context 0,1` |
| Verify order and scripts | `(Get-Content package.json -Raw | ConvertFrom-Json).scripts` |
| Hook registration names | `Get-Content clienthooks/index.ts` |
| Solution zip stamping inputs | `Get-Content deployment/solution/render-src.mjs -TotalCount 60` |
| Empty WebResources node intact | `Select-String -Path deployment\solution\src\Other\Customizations.xml -Pattern 'WebResources'` |
| Org auth alive | `pac auth list` |
