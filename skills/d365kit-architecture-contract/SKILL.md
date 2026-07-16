---
name: d365kit-architecture-contract
description: "Load-bearing design decisions, fixed invariants, and known-weak points of the D365 Client-Side UI Kit (this repo). Load before designing any change, adding a control, app, or PCF, touching shared/, reviewing a contribution, or whenever tempted to refactor, modernize, introduce hooks, Redux, or any second state pattern."
---

# Architecture contract

This skill is the binding design contract for the D365 Client-Side UI Kit. It
states what is fixed, why it is fixed, how each rule is enforced, and where the
design is honestly weak. The public doctrine lives in `docs/` and
`docs/internal/decisions.md` (the decision log); read `AGENTS.md` at the repo
root first for the short version.

Vocabulary used below, defined once (the kit's own five terms are in
`docs/glossary.md`):

- **Webresource**: an HTML/JS file Dynamics 365 hosts in an iframe.
- **PCF**: Power Apps Component Framework, the platform's custom-control model.
- **UCI**: Unified Client Interface, the modern Dynamics 365 web client.
- **Fluent**: Fluent UI v9, Microsoft's React component library (native look).
- **FetchXML**: Dataverse's XML query language.
- **FLS**: field-level security (Dataverse column security).
- **Observable**: the kit's host-owned value with change notification
  (`shared/reactivity/Observable.ts`), not RxJS.
- **Presentational / smart / ViewModel**: the three layers, defined below.

One shared library (`shared/`) ships through three delivery targets: the
webresource shell (`clientui/`, one HTML entry, `?app=` registry, bundles
React 18), the form/ribbon/grid script bundle (`clienthooks/`, UMD), and PCF
controls (`pcfs/`, virtual controls on platform-provided React 17 and Fluent).

## The invariants

Never weaken an enforcement mechanism listed here. Fix defects within the
pattern; do not reach for a reason to change the pattern.

| # | Invariant | Enforcement | Why | Where recorded |
|---|-----------|-------------|-----|--------|
| 1 | Presentational controls are CRM-agnostic: values and Observables in, events out. No context, metadata, Web API, queries, LibraryUtils, smart-tier imports, no `Xrm` global. | ESLint plus a resolution gate, not review: `no-restricted-imports` (patterns `**/context/**`, `**/metadata/**`, `**/data/**`, `**/queries/**`, `**/LibraryUtils*`, `**/controls/smart/**`, `**/smart/**`) and `no-restricted-globals` for `Xrm`, scoped to `shared/controls/presentational/**` and `shared/components/presentational/**`; plus `scripts/check-layer-boundaries.mjs` (second verify step) resolving every presentational import and failing if it lands in a CRM tier, catching spellings the string patterns miss (the sibling `../smart/X`) | Storybook with zero mocks; the boundary survives intermittent maintainers | `eslint.config.mjs`; `scripts/check-layer-boundaries.mjs`; `docs/architecture.md` |
| 2 | Hosts own state: ViewModels, smart wrappers, and PCF roots create Observables; presentational controls only subscribe (via `ObserverComponent`), never mirror into `useState`. | Base-class structure (`ObserverComponent` owns subscribe/unsubscribe/disposed flag) | One state paradigm; unsubscribe and disposal cannot be forgotten | `shared/reactivity/ObserverComponent.ts` |
| 3 | Every Observable a render reads is listed in `this.observe(...)`. | Dev-only warning (`renderReadCheck` brackets each render); silent in production | This is the kit's ONE silently-failing contract: an unobserved read renders once and never updates again, no error | `docs/glossary.md`; `shared/reactivity/renderReadCheck.ts` |
| 4 | ViewModel shape is fixed: constructor takes `IViewModelContext` and kicks the initial load; public Observables named for CRM concepts; handlers as arrow properties; `dispose()` via `SubscriptionTracker`; async callbacks check `tracker.isDisposed`. | Convention plus the sample apps as the reference; contract tests in `tests/unit/clientui/` | A returning developer (or a cold-start agent) orients in one file | `docs/architectural-stance.md` |
| 5 | ViewModel disposal is centralized in `createViewApp`; app Views stay render-only. | `clientui/AppContract.ts`: `AppDisposer.componentWillUnmount` calls `props.viewModel?.dispose?.()` | No View hand-wires teardown; disposal cannot be skipped | `clientui/AppContract.ts` |
| 6 | No second state paradigm: no Redux, no global stores, no hook-first composition. Hooks appear only in tiny `makeStyles` render helpers, never for control data. ViewModels never import Fluent. | Review rule stated in `docs/architectural-stance.md`; CONTRIBUTING says hook refactors will not be merged | Two paradigms doubles the relearning tax the kit exists to remove | `docs/architectural-stance.md`; `CONTRIBUTING.md` |
| 7 | MVVM + Observables + class components ON PURPOSE. Do not modernize. | CONTRIBUTING: "Pull requests that refactor toward hooks or other modern-React idioms will not be merged" | See rationale below | `docs/architectural-stance.md`; the decision log |
| 8 | The context mirrors the commonly-used native Xrm surface. Growth: the commonly-used platform surface may be mirrored on familiarity alone; the obscure tail and kit-invented members need a named consumer and a decision entry. | Decision-log discipline; fake-context contract coverage for mirror members | Zero-training familiarity for PL-400 developers (PL-400 is Microsoft's Power Platform developer certification, shorthand for a typical trained D365 customizer) is the product | the decision log |
| 9 | Where a standard shape exists, mirror it; adapt non-standard hosts TOWARD the standard, never invent a bespoke model. `utils.getEntityMetadata` resolves the platform EntityMetadata shape on every host. | The metadata rework is the precedent; `shared/metadata/attributeMetadataReads.ts` is the ONE sanctioned decoder of the under-documented `attributeDescriptor` members | An earlier bespoke metadata contract was recorded as a mistake and reversed whole (the decision log tells the story) | the decision log (metadata rework entries) |
| 10 | The shell is ONE bundle; `clientui/apps/index.ts` (one import line per app) is the size lever, not code-splitting. | The deploy mapping, cache-busting HTML entry, and autoresponder loop all key on one artifact name; chunks break all three | Recorded numbers: roughly 889 KB full ten-app shell vs 425 KB trimmed to template + hub | the decision log; `docs/architecture.md` |
| 11 | The PCF tier is VIRTUAL: `control-type="virtual"`, platform-provided React and Fluent, React and Fluent in devDependencies only. | `pcfs/platform-floor.json` + `scripts/check-pcf-floor.mjs`, the FIRST step of `npm run verify` | Bundles fell from 350-750 KB to 7-82 KB (date picker ~380 KB, compat exception); the tabster pin runbook is retired | the decision log; `docs/deployment.md` |
| 12 | `shared/` stays clear of React-18-only APIs (`createRoot`, `useId`, `flushSync`, `useSyncExternalStore`, ...). | `check-pcf-floor.mjs` scans every `shared/**/*.ts(x)` line against the list and fails verify | The shell bundles React 18; the PCF host serves React 16/17; shared code runs on both | `scripts/check-pcf-floor.mjs` |
| 13 | One repaint path for both hosts: observer components schedule renders through the `RenderBatch` queue (`scheduleRender`), which flushes once per pass via `unstable_batchedUpdates`. | Structure: `ObserverComponent` hands a stable render request to the shared queue | React 17 only batches inside DOM events; without the shim a three-Observable write paints three times on the PCF host | `shared/reactivity/RenderBatch.ts` |
| 14 | Feature logic that belongs with a control stays with it; hoist to a `shared/features/<name>/` folder only when a second real delivery target consumes it, never as a context-free abstraction. | Decision-log discipline | The counterparty resolver started inside the PCF and moved to `shared/features/counterparty/` only when the webresource twin shipped; both consume it now | `shared/features/counterparty/counterparty.ts` |
| 15 | FetchXML is authored as multi-line indented template literals that read as XML; every interpolated string value goes through `LibraryUtils.escapeXml`. | Convention (a query-builder helper was deliberately deleted; the decision log records why) | Queries paste into FetchXML tools; escaping is the one hand-rolled mistake | `shared/utils/LibraryUtils.ts` (`static escapeXml`) |
| 16 | The injected form page is a LIVE source, never a boot-time snapshot. | `LazyFormBinding` (`shared/context/hostSurface.ts`) re-reads a `FormPageSource` function on every `formContext`/`formAccess` access until a real form appears, then caches for stable identity; both webresource adapters expose lazy getters; `bootstrap.tsx` and `createWebResourceContext` pass functions | `KitShell.connect` injects asynchronously; a fast boot used to capture "no form" forever (the recorded boot race) | the decision log (injected-host entry) |
| 17 | Hosts degrade per method, loudly. Capability calls a host lacks reject with a readable, host-labeled error ("... is not supported on the CRM 8.x host."), never a silent wrong answer. Documented conveniences degrade quietly by design (`getResourceString` returns undefined; `showProgressIndicator`/`refreshParentGrid` no-op). | Adapter code paths in `hostSurface.ts` builders and `WebResourceContextV8.ts` | A ViewModel must not corrupt data because a host silently did nothing | `shared/context/WebResourceContextV8.ts` |

## Why class components and Observables (settled; do not re-argue)

The recurring review challenge is "why not hooks". The standing answer serves
two audiences at once (full statement: `docs/architectural-stance.md`):

1. **Intermittent human maintainers.** A typical D365 implementation ships
   10-20 custom UI pieces in bursts; the maintainers are CRM developers, not
   full-time frontend engineers. Hooks fluency is perishable: the return cost
   was measured both ways, and after 1-2 months away the hooks version was
   prohibitively expensive to re-enter, while the MVVM version was re-legible
   on a walkthrough. Empirical, not aesthetic.
2. **Cold-start coding agents.** An agent writing a new View + ViewModel
   starts with no prior context, exactly like the returning consultant. Plain
   class lifecycles, one way of thinking per file, and lint-enforced layer
   boundaries make generated apps likely right the first time. The mistakes an
   agent most plausibly makes (hook ordering, dependency arrays, stale
   closures) are exactly the hook-specific ones.

There is also a deliberate complexity ceiling: if a requirement cannot be
generated cleanly as a `*View.tsx` + `*ViewModel.ts` pair, it is outside the
kit's scope (99%-native, ship-in-a-day), which is a feature, not a limit.
Revisit triggers (recorded in the decision log): the team becomes a
daily-React shop, or agent generation of MVVM measurably underperforms hooks
against the samples. Reviewer taste is explicitly not a trigger.

## The reactivity contract in practice

- `shared/reactivity/` exports: `Observable`, `ObservableArray`,
  `ObservableEvent`, `SubscriptionTracker`, `ObserverComponent`,
  `RenderBatch` (`scheduleRender`), `renderReadCheck`.
- **`observe()`**: subclasses call `this.observe(...)` once (constructor or
  `componentDidMount`) with every Observable the render reads. Plain values
  and undefined are accepted and skipped, so `OrObservable<T>` props pass
  straight through. `observe()` after unmount is a guarded no-op (a late async
  continuation must not resurrect a subscription nobody will dispose).
- **Disposed-flag safety**: the base class owns `componentWillUnmount` (sets
  the disposed flag, disposes subscriptions, then calls the `onUnmount()`
  hook). Subclasses override `onUnmount()`, never `componentWillUnmount`, so
  base teardown cannot be skipped. The queued render re-checks disposal at
  flush time because a component can unmount between request and repaint.
- **`reobserve()`**: only for a component reused at the same tree position
  whose Observable props changed identity (call from `componentDidUpdate`;
  `SmartFieldBase` does it for you). Stable-prop controls never need it.
- **Lists**: a plain `Observable` holding an array does NOT notify on
  single-item mutation; `rows.value[0].selected = true` silently changes
  nothing on screen. Use `ObservableArray` for any list a grid or list view
  shows; its mutating methods build a fresh array and its dev-mode lock
  freezes one level deep. Grid rows accept `OrObservableList` (plain array,
  `Observable`, or `ObservableArray`); other list props stay plain
  `Observable` on purpose.
- **Timing**: only the repaint coalesces. Observable values and subscriber
  callbacks stay synchronous, and inside DOM event delivery the render runs
  immediately (delaying would fight React's controlled-input caret restore).

## ViewModel shape and the createViewApp lifecycle

The canonical shape (see `docs/architectural-stance.md` for the exemplar):
constructor receives `IViewModelContext` and kicks the initial load; public
readonly Observables named for CRM concepts (`searchRows`,
`selectedAccountId`); handlers as readonly arrow properties (stable identity,
wired explicitly in the View, no scattered inline closures); a private
`SubscriptionTracker`; `dispose()` delegates to `tracker.dispose()`; every
async continuation checks `tracker.isDisposed` before writing state
(`WizardViewModel.finish` is the reference: it guards both the success write
and the `finally`).

`createViewApp(title, View, getProps)` in `clientui/AppContract.ts` is the
one-liner for the 90% case: `getProps` usually returns
`{ viewModel: new XyzViewModel(host.context) }`. Actual lifecycle: apps are
RENDER-ONLY (`IApp.render(host)` is called once, React owns the rest; no
mount/unmount hooks on the adapter). The returned element is
`AppDisposer > ErrorBoundary > View`. The boundary sits BELOW the disposer on
purpose: a render throw is contained as a degraded state, the disposer still
commits, so its `componentWillUnmount` fires and the ViewModel is disposed. A
boundary above the disposer would show the degraded state but leak the
ViewModel. Do not "fix" that ordering.

## The context contract and the three adapters

`IViewModelContext` (`shared/context/IViewModelContext.ts`) is everything
shared React code may take from its host. Smart controls, ViewModels, client
hooks, and PCF roots use it for ALL CRM access; nothing reaches into global
`Xrm.Page`, raw `GetGlobalContext()`, or `parent.Xrm`. Its top-level surface:
`clientUrl`, `user`, `orgVersion`, `isLegacy`, `webAPI` (Xrm.WebApi-shaped
CRUD, `fetch`/`fetchPage`/`retrieveMultipleByUrl`,
`executeAction`/`executeClassicWorkflow`, `execute`/`executeMultiple`,
`executeChangeSet`), `metadata` (kit helpers with no standard equivalent:
views, currency, icons, activity types, `clearCache`), `navigation` (full
mirrored surface plus the kit's `openClientUI`), `utils` (including the
standard `getEntityMetadata(entityName, attributes?)`), `globalContext`,
`client`, `device`, optional `formContext`/`formAccess`, and
`getFormatting()`.

| Adapter | Host | How it maps |
|---------|------|-------------|
| `WebResourceContext` | Modern (v9.2+/UCI) webresource iframe | Thin delegation to native `Xrm.WebApi`, `Xrm.Navigation`, `getGlobalContext`; form page via `LazyFormBinding` (injected source wins, own `Xrm.Page` fallback) |
| `WebResourceContextV8` | CRM 8.x webresource | Same contract; `isLegacy = true`; navigation maps to deprecated v8 `Xrm.Utility` calls (`openEntityForm`, `alertDialog`, `confirmDialog`, `openWebResource`); Web API and metadata ride `cds-client` (XHR OData) because native `Xrm.WebApi` predates v9. "Legacy" means old server APIs; browsers are modern |
| `PCFContext` | `ComponentFramework.Context` | Wraps `context.webAPI`, `context.userSettings`, `context.navigation`, optional `context.utils` (native metadata store, lookup dialog when surfaced); client URL from the undocumented-but-stable `context.page.getClientUrl`; typed structurally so `shared/` compiles without the PCF type package |

`createWebResourceContext` (same file name under `shared/context/`)
auto-detects modern vs legacy (`isModernXrm` = `Xrm.Utility.getGlobalContext`
present), walks ancestor frames for Xrm candidates (stopping safely at
cross-origin), prefers the injected host globals (`__kitInjectedXrm` /
`__kitInjectedFormPage`), and passes the form page as a live function
(injected page first, deepest walked form as fallback). Both the clientui
bootstrap and the clienthooks bundle use it.

The V8 posture is a per-method dial: cheap familiar methods are mirrored
cheaply; whole capabilities 8.x lacks reject with readable errors (exact
strings in source: `"openFile is not supported on the CRM 8.x host."`,
`"navigateTo pageType '...' is not supported on the CRM 8.x host."`; device
and app-properties calls reject as "not available in the <host> host"). Never
convert one of these into a silent no-op.

## Boot flow (webresource shell)

`clientui/bootstrap.tsx` is deliberately linear:

1. Find `#container` (throws if missing; without it not even an error shows).
2. `LibraryUtils.parseWebResourceParams(location.search)`: `?app=` and/or the
   CRM `data` payload.
3. `waitForXrm`: poll `findXrm` every 100 ms, default 10 s timeout, then a
   visible plain-DOM boot error (error rendering never depends on the app
   stack).
4. `createContextFromXrm(xrm, () => findInjectedHost(win)?.formPage)`: adapter
   auto-detected; the injected form page passed as a LIVE source.
5. Registry lookup (`getApp(params.app)`); a missing or unknown app renders a
   boot error listing the registered apps.
6. Render `FluentProvider` (theme honors the user's high-contrast setting) >
   `ErrorBoundary` > `ViewModelContextProvider` > `app.render(host)`.
7. Unmount on `pagehide` (not `beforeunload`: deprioritized and blocks the
   back/forward cache).

## Known-weak points, stated plainly

Do not paper over these in docs or reviews; they are recorded limits.

- **The V8 path has never met a real 8.x org.** Designed, adapter complete,
  mock/smoke tested; no v8 environment exists to exercise it (recorded in
  the roadmap and README).
- **Offline is unverified.** The native metadata pass-through and IWebApi data
  reads are offline-capable by design, but offline behavior itself was never
  exercised (not verifiable from a desktop session).
- **FLS is unverified against real column-security profiles.** The capability
  flags (`CanBeSecuredForUpdate` scoping the read-only default) are decoded
  and unit-tested; org security was deliberately not reconfigured to prove
  them live.
- **The boot race is masked on current UCI.** Current UCI still serves a
  functional deprecated `Xrm.Page` through the frame walk, so injection loss
  does not occur naturally; the losing order was STAGED to verify the fix
  (the decision log records the staging). If UCI ever stops serving
  `Xrm.Page`, the live-source fix is what stands between a form-embedded
  shell and permanent "no form".
- **A plain `Observable` list does not notify on single-item mutation.**
  `ObservableArray` exists precisely for that; the dev lock is one level deep
  only (row objects' nested members are unguarded, accepted for grid speed).
- **The OData metadata synthesis path is fallback-only and less exercised**
  than the native pass-through: it is the pre-v9 primary (untested live, see
  above) and everyone else's console-warned cold fallback.
- **The CI story is executable-from-repo, not CI-executed** (the committed
  azure-pipelines.yml is connected to no service; only the Storybook Pages
  workflow runs). This is deliberate and recorded: the gate is local by
  choice, and the pipeline file is a reference for forks that want hosted CI
  (the decision log records the ruling; docs/deployment.md's CI section
  states it).

## Designed extension seams (for planners)

- **The grid's controlled mode** (`shared/controls/smart/SmartViewGrid.tsx`):
  `overrideFetchXml?: Observable<string | null>` (host supplies the query, the
  saved view still supplies the layout), `onPageChange?: (pageNumber: number)
  => void`, with `pageCount`, `totalRecordCount`, and `currentPage`
  Observables for the override-plus-rich-paging case where the host owns the
  `page`/`count` injection. Also fixed here: the grid sorts server-side or not
  at all (`serverSort`), never one page in memory, and it BINDS ONCE on mount
  (remount with a React `key` to swap bindings).
- **The wizard's `commit()` seam** (`shared/wizard/WizardViewModel.ts`):
  concrete wizards declare `steps`, gate with `isStepValid(index)`, persist in
  `protected abstract commit(): Promise<void>`. `finish()` owns busy-locking,
  disposal guards, and leaves the wizard open on a failed commit for retry.
  The draft lives in memory until Finish, so half-entered records never hit
  the server and server-side logic runs on the one real write.
- **The app registry** (`clientui/apps/index.ts`): one import line per app,
  grouped by tier (shell + onboarding, everyday, composition, exotic-data).
  Adding an app is one line; deleting a line removes its code from the bundle
  entirely. This is the intended fork customization point.
- **The platform-mirror growth rule**: to widen the context, first ask "is
  this the commonly-used Xrm surface a PL-400 dev reaches for?". If yes,
  mirror it 1:1 (names, parameters, return shapes) with fake-context
  coverage. If it is obscure-tail or kit-invented, it needs a named consumer
  and a decision entry. Never invent a kit-private shape where a standard one
  exists.

## Why the floor checker exists (the posture, not the check list)

First step of `npm run verify` (`scripts/check-pcf-floor.mjs` against
`pcfs/platform-floor.json`). The posture it defends: every kit PCF is a
virtual control held to TWO deliberately different floors, the declared
import floor (manifest platform-library React 16.14.0 / Fluent 9.46.2: what
the org must ACCEPT at import; "declare low, receive current") and the API
floor (Fluent 9.61.0 in devDependencies, enforced by compilation, chosen
because SearchBox ships there); compat-bundling controls pin their tabster
chain, and `shared/` stays clear of React-18-only APIs so one codebase serves
the React 18 shell and the React 16/17 PCF host. The check-by-check
enumeration is homed in `d365kit-config-and-versioning` (axis 2); do not
re-derive it here.

## When NOT to use this skill

| You need | Go to |
|----------|-------|
| Diagnosing a live defect, console/network archaeology | d365kit-debugging-playbook |
| Past incidents and reversed decisions in depth | `docs/internal/decisions.md` (the decision log) |
| Dataverse/Xrm platform theory (Web API semantics, FetchXML paging, metadata encodings) | dataverse-clientside-reference |
| Toolchain, node/npm, workspace setup, CI reality | d365kit-build-and-env |
| Deploying, org operations, publish/cache rituals | d365kit-run-and-operate |
| kit.config.json, prefixes, version policy, solution packaging values | d365kit-config-and-versioning |
| Perf monitors, Profiler pinning, floor-check internals as tooling | d365kit-diagnostics-and-tooling |
| Test strategy, Storybook, smoke, the evidence bar | d365kit-validation-and-qa |
| Writing docs or comments in house voice | d365kit-docs-and-writing |
| Building evidence, measurements, proofs | d365kit-proof-and-analysis-toolkit |
| Contribution rules, scope, what will not merge | `CONTRIBUTING.md` |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: `eslint.config.mjs`, `docs/architecture.md`,
`docs/architectural-stance.md`, `docs/glossary.md`, `CONTRIBUTING.md`,
`docs/internal/REBUILD-SPEC.md`, `docs/internal/decisions.md`,
`docs/internal/roadmap.md`, and direct reads of the reactivity, context,
bootstrap, and grid sources named above.

Re-verification one-liners for facts that drift (PowerShell):

- Lint rules intact: `Select-String -Path eslint.config.mjs -Pattern 'no-restricted-imports|no-restricted-globals'`
- Boundary gate intact: `node scripts/check-layer-boundaries.mjs` (expect the OK line naming the presentational file count)
- Floor values: `Select-String -Path pcfs/platform-floor.json -Pattern 'reactDevVersion|fluentApiFloor|declaredPlatformLibraries'`
- Floor and boundary checks first in verify: `Select-String -Path package.json -Pattern 'check-pcf-floor|check-layer-boundaries'`
- escapeXml exists: `Select-String -Path shared/utils/LibraryUtils.ts -Pattern 'static escapeXml'`
- Live form binding intact: `Get-ChildItem shared/context -Recurse -File | Select-String 'LazyFormBinding'`
- Disposal centralization: `Select-String -Path clientui/AppContract.ts -Pattern 'AppDisposer|dispose'`
- Grid seam prop names: `Select-String -Path shared/controls/smart/SmartViewGrid.tsx -Pattern 'overrideFetchXml|onPageChange'`
- Registered apps (bundle size lever): `Select-String -Path clientui/apps/index.ts -Pattern '^import'`
- Decision log tip: `Select-String -Path docs/internal/decisions.md -Pattern '^## D-0' | Select-Object -Last 3`

If any command's output contradicts this file, the repo wins; update this
skill.
