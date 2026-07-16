---
name: d365kit-debugging-playbook
description: "Symptom-to-triage playbook for debugging the D365 Client-Side UI Kit: load when a webresource is blank or shows 'Xrm was not found', a redeployed PCF still serves the stale old bundle, a published form change stays invisible, an Observable-bound value silently stops updating the UI, a specific npm run verify step fails (floor check, lint, typecheck, build, test, smoke, storybook), Storybook will not start (port 6006 taken, stale cache, EPERM on esbuild.exe), a Fluent popover renders transparent inside a PCF, or a Web API or metadata call behaves differently across hosts."
---

# Debugging playbook

Symptom-first triage for this repo's real failure modes, the traps that have
cost real time, and the experiments that split ambiguous symptoms. Deep
platform theory (what a webresource is, the PCF lifecycle, OData) lives in the
sibling skill `dataverse-clientside-reference`; this file assumes it and stays
operational. Where a fix's history matters, the decision log
(`docs/internal/decisions.md`) carries the full story.

Terms used below, one line each:

| Term | Meaning |
|---|---|
| webresource | An HTML/JS file Dataverse stores and serves inside a model-driven app |
| PCF | Power Apps Component Framework control, code bound to a form column or subgrid |
| virtual control | A PCF that renders on the platform's own React and Fluent instead of bundling them (all five kit PCFs) |
| UCI | Unified Interface, the modern model-driven app shell (aggressive client-side caching) |
| Fluent v9 | Microsoft's Fluent UI React library, the kit's UI layer |
| tabster | Fluent v9's focus-management engine; exactly one shared instance lives on `window` |
| Observable / ObservableArray | The kit's reactive value holders (`shared/reactivity/`) |
| ObserverComponent | Class-component base whose `this.observe(...)` wires re-render on Observable change |
| smart control | Metadata-aware control taking `entity` + `attribute`, resolving labels/options/formats via `IViewModelContext` |
| cds-client | The kit's same-origin XHR Web API client (`shared/data/CdsClient.ts`), used where native `Xrm.WebApi` falls short |
| FetchXML | Dataverse's XML query language, the kit grid's dominant query path |
| manifest | A PCF's `ControlManifest.Input.xml` (namespace, constructor, version, properties) |
| FLS | Field-level (column) security |
| SPKL | The webresource deployment tool `deploy.ps1` wraps |

Examples below use the committed `new_` prefix and the
`yourorg.crm.dynamics.com` placeholder; your local builds carry whatever
prefix `kit.config.json` names.

## The first five minutes (any bug)

1. **Where does it reproduce?** Try Storybook or Jest first (fixture data, no
   org): `npm run storybook -- --port 6008 --ci`. Reproduces there: it is kit
   code. Only on the org: suspect cache, deployment, host wiring, or the
   platform, in that order (see Discriminating experiments).
2. **Which layer?** Presentational (values in, events out, renders in Storybook
   with zero mocks), smart (metadata resolution), ViewModel (app logic, owns
   Observables), or context adapter (host plumbing under `shared/context/`).
   A presentational symptom that needs an org to show is almost never
   presentational.
3. **Is this a settled battle?** Skim the decision log for the area before
   theorizing. The classics: blanked bundling PCFs (tabster), stale PCF bundle
   after redeploy, the injected-host boot race, the reversed bespoke metadata
   contract. Do not re-fight a war the decision log already closed.
4. **Read the consoles before forming a theory.** The kit fails loudly by
   design: the shell renders a boot-error panel with the real message, PCFs
   render "This control could not be displayed. Try reloading the page."
   (shared `ErrorBoundary`), the V8 adapter rejects with a readable "not
   supported on the CRM 8.x host". A genuinely SILENT failure narrows the field
   to: a missed `observe()`, an in-place list mutation, a cache, or the
   platform.
5. **If the symptom is silence, switch to a development build.** Dev builds
   (`npm run build:dev`, Storybook) carry the observe-contract warning and the
   ObservableArray mutation throw; production strips both.

## Local build and test: the verify gate

`npm run verify` runs, in order: `check:pcf-floor`, `lint`, `typecheck`,
`build`, `test`, `smoke`, `build-storybook` (package.json). What each step's
failure smells like:

| Step | Runs | Failure smell |
|---|---|---|
| `check:pcf-floor` | `node scripts/check-pcf-floor.mjs` | Prints `<PcfName>: <message>` lines. A PCF drifted from `pcfs/platform-floor.json`: manifest not virtual or wrong platform-library versions, React/Fluent outside devDependencies or off the floor versions, `pcfReactPlatformLibraries` missing in featureconfig.json, an UNDECLARED `@fluentui/*-compat` import anywhere in the control's import graph, tabster overrides where none are allowed, a version range instead of an exact pin, or a React-18-only API in `shared/` |
| `lint` | `eslint .` | Ordinary rule hits, plus the boundary rule: "Presentational controls are CRM-agnostic: no context, no metadata, no Web API, no smart-tier imports." (`no-restricted-imports` scoped to `shared/{controls,components}/presentational/`, eslint.config.mjs). That one means the fix is moving code between layers, not adding a suppress |
| `typecheck` | `tsc --noEmit` | Type errors. Note: `build` uses ts-loader transpileOnly, so a green `build` with a red `typecheck` is normal, the types are ONLY checked here |
| `build` | `webpack --mode production` | Module resolution or loader errors; emits `dist/clientui/<prefix>clientui.*` and `dist/clienthooks/<prefix>clienthooks.js` |
| `test` | `jest` excluding `tests/smoke` | Normal Jest output. One benign trap: a PASSING test prints `console.warn` "PCFContext: no client URL is resolvable; metadata and cds-client calls use relative same-origin URLs." mid-run. Do not stop on it; read Jest's own summary |
| `smoke` | `jest tests/smoke` | **Requires `npm run build` first**: smoke loads the PRODUCTION bundles from `dist/` into jsdom against modern and V8 Xrm mocks. Without a build it fails with "Bundle not found at ..., run 'npm run build' before 'npm run smoke'." A smoke failure after a green `test` usually means bundle-level wiring (globals, boot path), not unit logic. Stale `dist/` gives stale smoke results: rebuild after any source change |
| `build-storybook` | `storybook build` | Story-level compile or import errors; a story importing something CRM-shaped is the common cause |

**The exit-code trap.** Run verify bare and check the shell's own exit
variable; piping it through a pager or tail masks a red gate (the full trap
and the safe capture pattern: `d365kit-validation-and-qa`, section 2).

Timing anchor: expect MINUTES for the full gate, not seconds (the Storybook
build dominates). Read "hang" as a stall with no output progress inside one
step, or a run past ten minutes, and then suspect a half-installed tree (next
section).

## Storybook

| Symptom | Cause | Fix |
|---|---|---|
| Port 6006 taken, or an interactive prompt blocks a scripted run | Another dev server on 6006 | `npm run storybook -- --port 6008 --ci` (the README's own fallback) |
| Fresh install, Storybook fails to start with odd module/cache errors | Stale Storybook cache surviving the reinstall | `Remove-Item -Recurse -Force node_modules\.cache\storybook`, then start again |
| `npm install` dies with EPERM on `node_modules\@esbuild\win32-x64\esbuild.exe` | A RUNNING Storybook dev server holds esbuild.exe; npm's delete phase aborts with node_modules half-removed | Close Storybook (and any vite process), rerun `npm install`. Do not debug the wreckage symptoms individually |
| After such an aborted install: `tsc` says "Cannot find type definition file for 'jest'", or `npx eslint` pulls a wrong-major GLOBAL eslint that crashes on the flat config | Half-deleted node_modules tree | Same fix: stop the dev server, `npm install` again |
| Lookup stories against the fake context show rows with blank names | `createFakeViewModelContext` builds entity metadata via `makeEntityMetadataMock`, which defaults `PrimaryNameAttribute` to `"name"` (tests/mocks/XrmMock.ts). Contact rows carrying `fullname` therefore render nameless | Seed the `entities:` block: `entities: { contact: { primaryNameAttribute: "fullname" } }` (tests/mocks/fakeViewModelContext.ts) |
| A story needs CRM data | By rule it must not: stories take fixture values only, exactly as a ViewModel would supply them (docs/testing.md). If a control cannot render from plain values, it is not presentational | Move the CRM-aware part up a layer, or write a smart-control test on the fake context instead |

## Webresource on the org

| Symptom | Cause | Fix / check |
|---|---|---|
| Page shows "Xrm was not found in this window or its parent. Open this page as a Dynamics 365 webresource." | Opened via the raw `https://<org>/WebResources/...` URL. There is no Xrm in that window or any parent; the shell polls for 10 s (default `xrmTimeoutMs` 10_000 in clientui/bootstrap.tsx) then renders this visible error, it is not a hang | Host it inside a model-driven app: sitemap subarea, `openClientUI` from code, or the quick-test URL: `https://yourorg.crm.dynamics.com/main.aspx?appid=<app-id>&pagetype=webresource&webresourceName=new_clientui.html&data=%7B%22app%22%3A%22samples%22%7D` (docs/deployment.md "Hosting the shell"; substitute your prefix) |
| Boot-error panel "This page could not start" with a message about the app key | Unknown or missing `?app=`/data key; the panel lists every registered app | Pass a registered key; the registry is `clientui/apps/index.ts` |
| A published form change is invisible; plain reload AND Ctrl+Shift+R do not help | The form definition lives in the app's client-side storage (IndexedDB and friends), not the HTTP cache | DevTools > Application > Clear site data, reload. First load afterwards is slow (about a minute of cold metadata rebuild), then the change appears. Check this BEFORE re-diagnosing the import or registration (docs/gotchas.md) |
| After a burst of rapid publishes the form serves empty sections | Publish-burst artifact (recorded live) | One full publish, then clear Cache Storage beside the IndexedDB store, reload |
| An embedded webresource control never mounts on a soft navigation | UCI mounts below-the-fold webresource controls lazily, or not at all until a cold hydration (recorded live) | Full reload or cold navigation to the record; scroll the control into view; do not debug the kit first |
| Redeployed bundle, browser still runs the old one | The HTML entry cache-busts the JS via `?v=<webpack hash>`, but the OUTER HTML webresource itself can be platform-cached | Redeploy publishes HTML+JS together; if the reload still shows old HTML, publish customizations and reload once. Last resort while testing: DevTools open with "Disable cache" (also bypasses the service worker) |
| Fiddler autoresponder loop stopped serving the local bundle | The rule matches by NAME (`regex:(?insx).*<prefix>clientui\.js`); a browser cache hit skips the request entirely | DevTools > Network > Disable cache; remember your local artifacts carry YOUR prefix while the docs' examples say `new_`; disable the rule before judging genuinely deployed behavior |
| Shell boots on a form but `formAccess`/`formContext` stay undefined | Either no `CrmClientSide.KitShell.connect` on the form's OnLoad, or a pre-fix bundle losing the injection race (the form page was captured once at boot; fixed by the live source `LazyFormBinding` in shared/context/hostSurface.ts) | Confirm the OnLoad registration and that the deployed bundle includes the live-source fix. To prove a race vs a config error, stage the losing order deterministically: `d365kit-proof-and-analysis-toolkit` carries the staging recipe |
| Not sure the injected-host path resolved at all | The samples hub renders one line, "Hosted beside <entity> record <id>" (`clientui/apps/samples-hub/HostedRecordLine.tsx`), only when form access resolves | Use it as the naked-eye probe; standalone hostings correctly render nothing there |
| Sample app shows per-field red metadata errors like "Entity With Id = LogicalName='opportunity' does not exist" | The org lacks that module (an org without the Sales module has no `opportunity`, no `account.territoryid`) | Environment gap, not a bug; the 404s in the network tab confirm it |

## PCF on the org

| Symptom | Cause | Fix / check |
|---|---|---|
| The fix "did not deploy": form runs the previous build after a successful import | Reimporting the SAME `<control version>` publishes but the platform keeps serving the cached old bundle. Hard requirement, not a propagation lag | Bump the version in `ControlManifest.Input.xml` on EVERY redeploy (docs/gotchas.md, docs/adding-a-pcf.md) |
| Popover/Menu/flyout surface renders transparent, form shows through | Fluent portals the surface OUTSIDE the control's themed `FluentProvider`; theme CSS variables are undefined there | Render the surface inline (`NativeLookupField` does; the date picker uses `inlinePopup`, the time list a themed `mountNode`) (docs/gotchas.md) |
| "This control could not be displayed. Try reloading the page." | The shared `ErrorBoundary` caught a render throw; the message is deliberately Fluent-free so it renders even when Fluent itself is the failure | Read the console for the real error; reproduce the control's root in Storybook if possible |
| Solution import fails "Webresource content size is too big" | A DEBUG bundle over Dataverse's 5 MB webresource ceiling; `pac pcf push` has no production switch | Build Release through a solution wrapper: `dotnet build -c Release -p:SolutionPackageType=Unmanaged`, then `pac solution import` (docs/adding-a-pcf.md) |
| Import rejected "already created by another publisher" | Custom-control identity is the UNPREFIXED `namespace.constructor`, org-global ACROSS publishers; the prefix decorates the name only | A coexisting fork needs its own manifest namespace, not just its own publisher (docs/adding-a-pcf.md) |
| Control renders narrower than the native fields beside it | The platform mounts a virtual control in a flex container; a plain div shrinks to content | Wrap the tree in `FluentProvider` built from `pcfProviderProps(context)` (`shared/theme/d365Theme.ts`), which carries the full-width style |
| Smart PCF shows a setup message instead of the control | It is on a custom page or canvas app; the smart tier targets model-driven FORMS (those hosts do not populate the form-context surfaces it reads) | Expected; use a model-driven form (README) |
| `pac` is not recognized, or the deploy hangs on auth | pac CLI not installed or no auth profile | Prerequisites block in docs/adding-a-pcf.md section 0 (`pac auth create --environment <url>`); operational runbook: `d365kit-run-and-operate` |
| Old notes tell you to pin tabster or re-pin per wave | HISTORICAL. The kit's PCFs are virtual: the platform serves React 17 and current Fluent, exactly one tabster on the page, the collision is structurally impossible | Check the current posture first (`pcfs/platform-floor.json`). The ONE surviving pin rides `KitDatePicker`'s bundled date/time compat packages, enforced by the floor checker. See the story below before touching any of it |
| A consumer's `control-type="standard"` PCF blanks on a form with the platform's unhandled-error dialog and NO data queries fired | The old tabster version-skew collision, still real for controls that bundle Fluent | Pin the bundled chain to the host's floor; read the host's live version via `window.__tabsterInstance._version` in the form's DevTools console (docs/gotchas.md, docs/deployment.md historical note) |
| Solution Checker flags `web-avoid-window-top` (High) on a bundling control | Pattern-match false positive on Fluent's positioning engine reading `DOMRect.top`/`style.top` | Advisory, dismissable; relevant only to AppSource certification (docs/gotchas.md) |

## Reactivity: a value stops updating the UI

The kit's ONE silent contract: a View lists every Observable whose `.value`
its render reads in `this.observe(...)` (constructor). Miss one and that value
simply stops updating, with no error, in production.

| Symptom | Cause | Fix / check |
|---|---|---|
| A field or label freezes at its first value; everything else works | An Observable read in `render()` but missing from `observe(...)` | Reproduce in a DEV build: development warns "<Component> read an Observable's value during render without observing it. The screen will not update when that value changes." (`shared/reactivity/renderReadCheck.ts`). Add the source to `observe(...)` |
| Unsure what needs observing | The distinction: reading `x.value` in render needs observing; PASSING the Observable `x` itself into a kit control does not (the control subscribes internally) | Copy the template app's shape (`clientui/apps/template/`); the warning above catches the wrong guess in dev |
| Grid/list does not reflect a change to ONE item | Mutating inside a plain-Observable-held list notifies nobody: `rows.value[0].selected = true` does nothing (a top-level `rows.value.push(x)` throws in development) | Replace the list (`rows.update(r => r.map(...))`) or, better for grid rows, use `ObservableArray` and its methods (`push`, `removeAt`, `updateAt`, `replaceWhere`, ...): they notify, and development throws on an accidental in-place edit (docs/gotchas.md) |
| Component rebound to a DIFFERENT Observable keeps listening to the old one | Observables are usually identity-stable; a swap needs `reobserve(...)` from `componentDidUpdate` | `SmartFieldBase` already does this; hand-rolled Views must (shared/reactivity/ObserverComponent.ts) |
| "Maximum update depth exceeded", control blank | Writing an OBSERVED Observable from `componentDidUpdate`: each write forces an update, which writes again | Derive values in `render()` from the source (dataset, props); keep only guarded async results in React state |
| Suspected excessive re-rendering on a form | Smart-field loads commit one loading paint plus one content paint (Profiler-pinned tests), and with `&perf=true` on the form URL the kit controls sit inside the platform's own band (native twins flag at 2-3) | Compare against the native twin with `&perf=true` before optimizing; measurement recipes: `d365kit-diagnostics-and-tooling` |
| Teardown/timer leaks after unmount | A subclass overrode `componentWillUnmount` | Override `onUnmount()` instead; the base owns `componentWillUnmount` and always runs the subscription teardown (ObserverComponent) |

## Data layer: calls behaving differently than expected

`context.webAPI` is Xrm-shaped but not every method hits the native host
(docs/gotchas.md "Web API: which call routes where"). Condensed:

| Method | Modern webresource | PCF | V8 |
|---|---|---|---|
| create/update/delete/retrieve/retrieveMultipleRecords | native | native | cds-client |
| `fetch`, `fetchPage`, `retrieveMultipleByUrl` | cds-client | cds-client | cds-client |
| `executeAction`, `executeClassicWorkflow` | cds-client | cds-client | cds-client |
| `execute` | native | cds-client | cds-client |
| `executeMultiple` | cds-client | cds-client | cds-client |

Success shapes are host-independent (held equal on purpose); REJECTION shapes
are host-coupled: native CRUD rejects with the Xrm error object (`errorCode`,
`message`), cds-client paths reject with `CdsClientError` (`status`,
`message`, `responseText`), and on modern `execute` resolves `ok: false` for
both network and business failures. Code that inspects a caught error is
host-coupled; code that only reacts to "it failed" is not.

| Symptom | Cause / rule | Fix / check |
|---|---|---|
| Grid or lookup query breaks only on some surface | The `?savedQuery={id}` + `$filter`/`$orderby`/`$top` composition is a TESTED CONVENTION, live-verified, but not documented platform contract. On PCF the same options string passes through the native webAPI | If a wave regresses it: the grid falls back to the rich FetchXML path; lookup search has NO fallback today; the ready fix is rerouting through cds-client like the fetch paths (docs/gotchas.md) |
| Quick find matches "too much" | Search text passes into a FetchXML `like` literally: `%` and `_` are wildcards, begins-with by default, `quickFindOperator="contains"` opts into substring (and defeats index seeks on large tables) | Matches native behavior on purpose; do not "fix" the wildcard passthrough |
| 404 on a write or `@odata.bind`, especially inside a change set | Entity SET names are convention-first (Dataverse pluralization); metadata loads teach the real `EntitySetName` opportunistically. Inside a change set one wrong guess 404s the WHOLE transaction | Pass the explicit `entitySet` (on `odataBind`, on `IChangeSetRequest`) for entities whose set name breaks convention |
| Web API rejects a lookup write on `customerid`/`ownerid`/`parentcustomerid` | Polymorphic lookups need the target-suffixed navigation property: `` `${attr}_${ref.logicalName}@odata.bind` `` (for example `parentcustomerid_account@odata.bind`), not the bare attribute | Compose the key from the picked target on the webresource path; a field-bound PCF gets the routing free from the platform (docs/gotchas.md) |
| Money field shows unexpected decimals | `PrecisionSource` decides: 0 attribute precision, 1 record currency precision, 2 org pricing precision. All three resolve (source 2 rides `getPricingDecimalPrecision()`, shared/controls/smart/SmartNumberField.tsx) | docs/gotchas.md carries the money-precision entry |
| Grid row invoke on an activity shows a readable error instead of opening the form | The bound view lacks the Activity Type column; the grid routes on the raw `activitytypecode` value | Keep `activitytypecode` on any activity view the grid binds, or supply `onItemInvoked` |
| Unsure whether to call `executeAction` or `execute` | `executeAction(name, params?, boundTo?)` is the ergonomic action-only path, parsed body out; `execute(request)` mirrors `Xrm.WebApi.online.execute` (actions AND functions, fetch-like response, call `.json()`). The cds emulation of `execute` REJECTS CRUD requests by design | Reach for `executeAction` first; `execute` when you hold an Xrm-shaped request or need a function |
| A call rejects "not supported on the CRM 8.x host" | The V8 adapter maps the 8.x subset and rejects the rest loudly, never silently no-ops | Treat as a host capability ceiling, not a bug. The whole V8 path is best-effort and untested against a live 8.x org (no environment; README) |
| Metadata looks stale mid-session after an org change | Kit metadata reads cache for the page's life | `context.metadata.clearCache()` then re-run loads; the form definition has its own client cache (webresource table above) |
| Need to decode an attribute's raw descriptor members | `shared/metadata/attributeMetadataReads.ts` is the ONE sanctioned reader of the under-documented `attributeDescriptor` encodings | Never decode descriptors elsewhere |

## Discriminating experiments

| Question | Experiment | How to read it |
|---|---|---|
| Cache or code? | PCF: bump the manifest version and redeploy. Webresource: confirm the HTML references a NEW `?v=` hash. Form definition: DevTools > Application > Clear site data, reload. Cross-check in a second browser profile or InPrivate window (a genuinely cold cache) | Symptom survives a cold cache and a version bump: it is code. Symptom vanishes: it was cache; stop diffing source |
| Kit or platform? | Put the NATIVE twin control on the same form beside the kit control (same column, same data). Add `&perf=true` to the app URL for the UCI perf overlay | Native twins flag at 2-3 renders and the kit sits inside that band; a behavior the twin shares is the platform's, accept it or work around it knowingly. A divergence is the kit's |
| Org or repo? | Reproduce on fixture data: the presentational control in Storybook, the smart control or ViewModel on `createFakeViewModelContext`, the boot path in smoke | Reproduces off-org: repo code, fix locally with the fast loop. Does not: host wiring, org state, or deployment; move to the org tables above |
| Boot race or config error? (embedded shell without form access) | Verify the OnLoad registration first; then stage the losing order deterministically against the deployed bundle (no usable walked Page, injection supplied AFTER boot) and watch for adoption | The staging recipe lives in `d365kit-proof-and-analysis-toolkit`. Adoption after late injection proves the fix is deployed; no adoption means a pre-fix bundle or a missing registration |
| Environment gap or defect? | Check the network tab for metadata 404s on the entity/attribute the errors name | Per-field inline errors with no crash is the DESIGNED degradation; the missing module is the answer |

## The two costliest sinks, and what their recurrence smells like

**1. The tabster/pin era (retired by the virtual-control migration).** When
the kit's PCFs bundled React 18 + Fluent v9, each control shared ONE tabster
instance on `window` with the model-driven host. A bundled tabster NEWER than
the host's augmented that shared instance with a shape it lacked and threw
from a layout effect ("Cannot read properties of undefined (reading 'set')");
React unmounted the whole control, so it rendered for one frame and vanished,
with no data queries fired. Invisible in the harness and in Storybook (no
second Fluent there); diagnosed only by building with `devtool: "source-map"`
and decoding the minified stack (every frame `@fluentui/react-tabster`). The
running costs: a per-wave re-pin runbook, 350-750 KB bundles, a 5.7 MB debug
bundle that hit the 5 MB import ceiling. The virtual migration removed the
entire class: the platform now serves its own React and Fluent, one tabster
on the page, skew structurally impossible. What a recurrence looks like
TODAY: (a) a new control whose shared code touches a `@fluentui/*-compat`
package WITHOUT declaring it, which silently bundles the repo root's unpinned
tabster chain while the build stays green (the floor checker's import-graph
scan exists precisely for this), or (b) a consumer's standard-type control
that bundles Fluent (still legitimately needs the pin discipline in
docs/deployment.md's historical note). Lessons: "compiles" and "renders in
the harness" prove nothing about the host, the done bar is a deployed form;
and measure the host (`window.__tabsterInstance._version`) instead of
assuming.

**2. The bespoke-metadata wrong turn (reversed whole; the decision log tells
it).** An agent built one custom OData metadata provider normalizing
everything into a kit-private `IAttributeMetadata` shape, justified by "one
normalized shape beats three host shapes", on wrong information it had itself
produced about the native API's completeness. The reversal cost a full rework
wave: `getAttributeMetadata` retired, the custom model deleted (the NAME
`IAttributeMetadata` survives, deliberately reused to type the STANDARD store
item), the contract moved to `context.utils.getEntityMetadata(entityName,
attributes)` mirroring the platform, with non-standard hosts adapting TOWARD
the standard shape. The smell to catch early: any proposal that invents a
kit-private contract where a standard client API shape exists, especially one
sold on uniformity or normalization. When you feel that pull, stop and read
`d365kit-architecture-contract` (the standard-mirror invariant) before
writing a line.

## When NOT to use this skill

| You are actually trying to | Use instead |
|---|---|
| Set up a machine from scratch, or untangle install traps beyond the Storybook fixes above | `d365kit-build-and-env` |
| Run, deploy, or exercise the kit on a live org (SPKL, solution import, form binding walkthroughs) | `d365kit-run-and-operate` |
| Understand prefixes, kit.config.json, version policy, manifest versions as POLICY rather than as a cache fix | `d365kit-config-and-versioning` |
| Learn the platform concepts themselves (webresources, PCF lifecycle, OData, FetchXML theory) | `dataverse-clientside-reference` |
| Read the full history of a battle this file only summarizes | `docs/internal/decisions.md` (the decision log) |
| Measure instead of eyeball (profiler recipes, perf overlay, render counting, bundle sizes) | `d365kit-diagnostics-and-tooling` |
| Design or run a platform probe/staged experiment | `d365kit-proof-and-analysis-toolkit` |
| Write or extend tests, or decide what evidence "fixed" requires | `d365kit-validation-and-qa` |
| Check whether a change is architecturally allowed | `d365kit-architecture-contract` |
| Fix or write docs | `d365kit-docs-and-writing` |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: `docs/gotchas.md` (every entry), `README.md`,
`docs/deployment.md`, `docs/testing.md`, `docs/adding-a-pcf.md`,
`eslint.config.mjs`, `scripts/check-pcf-floor.mjs`,
`pcfs/platform-floor.json`, `clientui/bootstrap.tsx`, the reactivity sources,
the context adapters, the mocks, and the decision log. Live-org observations
(publish-burst behavior, lazy mounting, the render-band datapoints) are
recorded platform behavior from 2026-07 sessions; re-verify before leaning
hard on them.

One-line re-verification for the facts that can drift (PowerShell):

```powershell
node -v; npm -v                                                              # toolchain pins
Select-String -Path package.json -Pattern '"verify"'                        # gate order unchanged
Get-Content pcfs\platform-floor.json                                        # floors and the one tabster pin
Select-String -Path tests\smoke\clientui.smoke.test.ts -Pattern "npm run build"   # smoke-needs-build message
Select-String -Path clientui\bootstrap.tsx -Pattern "Xrm was not found","10_000"  # boot error and poll timeout
Select-String -Path shared\reactivity\renderReadCheck.ts -Pattern "without observing"  # dev observe warning exists
Select-String -Path shared\controls\smart\SmartNumberField.tsx -Pattern "getPricingDecimalPrecision"  # precision source 2 resolved
Select-String -Path eslint.config.mjs -Pattern "CRM-agnostic"               # presentational boundary rule
```
