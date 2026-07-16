---
name: dataverse-clientside-reference
description: "Concept pack explaining the Dynamics 365 / Dataverse client-side world as this kit uses it; load when encountering unfamiliar D365/Dataverse terms: webresource, PCF, managed solution, publisher prefix, FetchXML, OData, UCI, Fluent, spkl, EntityMetadata, attributeDescriptor; or before reasoning about platform behavior (Xrm acquisition, caching, solution import, control identity, offline queries, column security)."
---

# Dataverse client-side reference

You know React and TypeScript. This file teaches the Dynamics 365 / Dataverse
half you do not know, scoped to how THIS repo touches it. It is theory and
vocabulary, not a runbook: each topic gives what-it-is, how the kit touches it,
where in the repo, and the trap that bites newcomers. Read the topic you need,
not the whole file. Statements about platform behavior (not kit code) carry a
pointer to where the repo recorded them; treat those as observations from a
point in time, re-verifiable, not laws.

Committed examples throughout the repo use the `new_` publisher prefix and the
`yourorg.crm.dynamics.com` placeholder org. Substitute your own prefix (set in
`kit.config.json`) and your own org URL wherever they appear.

## When NOT to use this skill

This is the concept pack. Task runbooks live in siblings; route there when the
question is "do X", not "what is X":

- Something broken at runtime, blank control, silent UI: `d365kit-debugging-playbook`
- The kit's own three-layer / MVVM / Observable rules: `d365kit-architecture-contract`
- npm install, Node versions, workspace setup, building: `d365kit-build-and-env`
- Deploying, importing solutions, exercising a live org: `d365kit-run-and-operate`
- kit.config.json mechanics, version bumps, prefixes in practice: `d365kit-config-and-versioning`
- DevTools, `&perf=true`, measurement tooling: `d365kit-diagnostics-and-tooling`
- The verify gate, tests, evidence: `d365kit-validation-and-qa`
- Designing an experiment to prove a platform behavior: `d365kit-proof-and-analysis-toolkit`
- Writing or editing docs, voice and style: `d365kit-docs-and-writing`
- Why past decisions went the way they did: `docs/internal/decisions.md` (the decision log)

## 1. The app paradigms: where custom UI can live

**What it is.** Dataverse is the data platform (tables, security, metadata, a
Web API); Dynamics 365 apps sit on it. Custom UI can live in four paradigms:
model-driven apps (metadata-driven forms, views, and navigation generated from
Dataverse config; the classic "CRM" experience), canvas apps (layout-first,
Power Fx, citizen-developer), custom pages (canvas technology hosted inside a
model-driven app as a full page, dialog, or side pane), and code apps (a
standalone React/TypeScript app running on Power Platform via the code-apps
SDK and its connector ecosystem).

**The dividing line.** Canvas, custom pages, and code apps all build BESIDE the
model-driven app. This kit builds INSIDE it. The one line nothing build-beside
crosses: being a bound control inside a model-driven form (a subgrid, a form
field, a grid cell). A custom page can render near the form; a PCF from this
kit can BE the field or the subgrid. That is the kit's whole point
(docs/how-it-compares.md, the comparison home).

**In this kit.** The kit ships webresource apps, form/ribbon/grid scripts, and
PCF controls, all inside the model-driven app. A complete code-app context
adapter was built and then PARKED before release: the code-apps SDK executes
no FetchXML (killing SmartViewGrid and lookup search), its metadata read stops
at base types, and there is no $batch, no dialog, no form access. The decision
log records the parking and the findings; the surviving build-beside direction
is packaging the presentational tier as an npm package
(docs/internal/roadmap.md).

**Repo home.** docs/how-it-compares.md; docs/internal/decisions.md; the
roadmap's parked entries.

**The trap.** Reflexively proposing "use a canvas app / custom page" for a
requirement that lives in the grid or on the field. Also its inverse: the kit's
smart-tier PCFs target model-driven FORMS; on custom pages and canvas apps the
form-context surfaces they read do not exist, so there they render a setup
message, by design (docs/adding-a-pcf.md, "Bind it in the form designer").

## 2. Webresources: org-hosted pages and how they get Xrm

**What it is.** A webresource is a file (HTML, JS, CSS, image) stored as a
Dataverse component and served from the org. `Xrm` is the client API object
(Web API, navigation, form context) that the Unified Interface injects; a
webresource only receives it when it runs INSIDE a model-driven app. There is
a 5 MB size ceiling per webresource (recorded in docs/gotchas.md and
docs/adding-a-pcf.md; re-verify against current Microsoft docs before acting).

**In this kit.** The shell is one HTML webresource (`<prefix>clientui.html`)
plus one JS bundle, bundling its own React 18. It boots by polling for Xrm:
`clientui/bootstrap.tsx` (`waitForXrm`, `findXrm`) prefers injected globals,
falls back to walking ancestor frames (`parent.Xrm`), and after a timeout shows
a visible "Xrm was not found in this window or its parent" error. Opening the
raw `https://<org>/WebResources/new_clientui.html` URL therefore refuses to
boot, expected and documented. Host it via a sitemap subarea, via
`context.navigation.openClientUI(...)`, or via the quick-test URL inside any
model-driven app:
`main.aspx?appid=<id>&pagetype=webresource&webresourceName=new_clientui.html&data=<url-encoded JSON>`.
The shell reads its app key from `?app=` or from that `data` JSON payload
(`{"app":"samples"}`), which is also how the `?app=` registry in
`clientui/apps/index.ts` selects which app renders.

**The injected-host contract.** The `parent.Xrm` walk sits on Microsoft's
deprecation list (recorded in docs/deployment.md; re-verify before acting), so
for form-embedded shells the clienthooks bundle offers the supported path:
register `CrmClientSide.KitShell.connect` on the form's OnLoad (pass execution
context), and it pushes the form's Xrm and form context into every webresource
control through `getContentWindow` (clienthooks/form/KitShell.ts). Injection is
asynchronous; the injected form page is a LIVE SOURCE (`LazyFormBinding` in
shared/context/hostSurface.ts), so a fast boot that wins the race with a
walked Xrm still adopts the injected form context when it lands. The samples
hub's "Hosted beside <entity> record <id>" line is the contract's visible
surface.

**Repo home.** clientui/bootstrap.tsx, clienthooks/form/KitShell.ts,
shared/context/hostSurface.ts, docs/deployment.md ("Hosting the shell", "How
the shell reaches Xrm").

**The trap.** Two. First, testing the raw /WebResources/ URL and concluding the
kit is broken: no model-driven app around it means no Xrm, ever. Second, the
modern form designer has NO "Custom Parameter(data)" field, so you cannot type
the `data` payload for a form-embedded webresource control in the UI; the
recorded workaround is patching the data payload into the form XML via the Web
API (the decision log's injected-host entry).

## 3. PCF: code components bound into forms and grids

**What it is.** PowerApps Component Framework: TypeScript components the
platform hosts inside model-driven forms and grids. A FIELD control binds one
column (value in, value out through `notifyOutputChanged`/`getOutputs`); a
DATASET control binds a view or subgrid and receives its rows. A control's
manifest (`ControlManifest.Input.xml`) declares its namespace, constructor,
version, type, and properties.

**Standard vs virtual.** A `control-type="standard"` PCF bundles its own React
(and Fluent if it uses it). A `control-type="virtual"` control receives the
HOST's React and Fluent at runtime via `<platform-library>` declarations, so it
bundles neither. See pcfs/KitOptionSet/KitOptionSet/ControlManifest.Input.xml:
`control-type="virtual"` plus `<platform-library name="React" version="16.14.0" />`
and `<platform-library name="Fluent" version="9.46.2" />`. All five kit PCFs
are virtual ReactControls: `updateView` RETURNS the element, the platform owns
the React root, no createRoot, nothing to unmount in `destroy`
(docs/adding-a-pcf.md). A live org probed in 2026-07 served React 17.0.2 and a
current Fluent (~9.68) to virtual controls (the decision log records the
probe).

**The two floors.** Deliberately different numbers, both in
pcfs/platform-floor.json, enforced by scripts/check-pcf-floor.mjs as the FIRST
step of `npm run verify`:

- The DECLARED floor (manifest platform-library lines, React 16.14.0 / Fluent
  9.46.2): what the org must ACCEPT at solution import. Declaring newer than
  the org supports fails the import; the runtime serves its current copy
  regardless. Declare low, receive current.
- The API floor (`@fluentui/react-components` 9.61.0 in every PCF's
  devDependencies): the oldest Fluent the kit's code actually works against.
  Enforcement is compilation, not a list: every PCF compiles against exactly
  that version. It is 9.61.0 because SearchBox (the grid's search bar) first
  ships there (platform-floor.json, `fluentApiFloorReason`).

The gap between the floors is the exposure: an org whose platform Fluent falls
between them (sovereign clouds trail the commercial wave: GCC, GCC High, DoD,
China) accepts the import and only fails at runtime; the counterparty grid
probes for the export and states the wave requirement instead of erroring
(recorded in docs/deployment.md; re-verify sovereign-cloud lag against current
Microsoft docs before acting).

**Bundle expectations (recorded at the 2026-07 virtual migration;
docs/deployment.md, "Form budget").** Virtual kit controls: option set 7 KB,
tooltip 54 KB, native lookup 78 KB, counterparty grid 82 KB. The date picker
is ~380 KB because it alone bundles the `@fluentui/*-compat` date/time picker
packages (not part of the platform library). Later releases run somewhat
higher as features land (the size report's 1.25x band tracks it; run
`d365kit-diagnostics-and-tooling`'s bundle-size report for today's figures).
The old standard builds weighed 350-750 KB each.

**The identity rule (org-global, cross-publisher).** A custom control's
identity is the UNPREFIXED `namespace.constructor` pair (`D365Kit.KitOptionSet`)
and it is org-global ACROSS publishers: the platform rejects a second import
with "already created by another publisher", observed live during a release
import verification. The publisher prefix only decorates the registered name
(`new_D365Kit.KitOptionSet`); it does not create a second identity. A fork that
must coexist in one org with another kit deployment needs its OWN manifest
namespace, not just its own publisher (docs/adding-a-pcf.md, "Deployed name and
the publisher prefix"; recorded from a live platform rejection, re-verify
against current Microsoft docs before acting).

**Repo home.** pcfs/ (KitOptionSet, KitTooltip, KitDatePicker as the reference
patterns; KitNativeLookup field-bound; KitCounterpartyGrid dataset),
pcfs/platform-floor.json, scripts/check-pcf-floor.mjs, docs/adding-a-pcf.md.

**The trap.** Bump the manifest `<control version>` on EVERY redeploy or the
platform serves the cached old bundle while the import "succeeds" (topic 8).
And a PCF's done bar is "renders on a deployed form", not "compiles": binding,
caching, and platform-library failures only show on the real form.

## 4. Solutions and ALM: how anything reaches an org

**What it is.** A solution is Dataverse's unit of packaging and transport: a
zip of `solution.xml` (manifest: unique name, version, publisher, root
components), `customizations.xml` (component definitions), and the payload
files. UNMANAGED solutions are editable dev-state; MANAGED solutions install
and uninstall cleanly and are what downstream orgs import. Every solution has a
PUBLISHER whose customization prefix (`new_`) names components. Solution
unique names are org-global, and a managed import cannot layer over an
unmanaged solution of the same name (learned live; the decision log's
release-engineering entry).

**In this kit.** Two deployment paths with different jobs:

- **spkl, the dev inner loop for webresources.** `deployment/deploy.ps1`
  renders `spkl.template.json` into a gitignored spkl.json using
  kit.config.json's prefix and pushes `dist/` webresources to the org. No
  solutions involved beyond the spkl deploy target.
- **The cdsproj, the release artifact path.**
  `deployment/solution/D365UIKit.cdsproj` references the five PCF projects and
  stages the three shell webresources; `npm run build` then
  `dotnet build deployment/solution -c Release` produces the managed
  `D365UIKit.zip` from the repo alone, no org, no secrets. `render-src.mjs`
  stamps publisher/prefix from kit.config.json and the solution version from
  package.json at build time. Webresource component ids are NAME-DERIVED
  deterministic UUIDs, so a rebuilt zip carries the same ids and a newer
  import upgrades an older install instead of colliding.

**The load-bearing empty node.** The committed
`deployment/solution/src/Other/Customizations.xml` MUST keep its empty
`<WebResources />` node: SolutionPackager only reassembles the staged
webresource metadata into customizations.xml when that insertion point exists.
Without it the packer ships the files but registers no component, silently, and
the import creates nothing. Found empirically against an org-exported solution
as ground truth (the decision log records it). Never "simplify" it away.

**Clean-org criterion.** Verifying a release zip needs an org clean for THIS
zip, which is three checks, not a feeling (docs/deployment.md): no custom
control shares the kit controls' namespace under ANY publisher (the identity
rule above), no components carry the zip's publisher prefix, and no solution
already uses the zip's unique name. An org already running the kit fails the
first check under any publisher; the documented workaround is a
verification-only build with a throwaway manifest namespace
(docs/deployment.md, ALM chapter).

**Repo home.** deployment/solution/ (cdsproj, render-src.mjs,
Solution.template.xml, src/Other/Customizations.xml), deployment/deploy.ps1,
kit.config.json, docs/deployment.md ("ALM" chapter).

**The trap.** Assuming prefix disjointness makes an org clean for an import.
Webresources are prefix-scoped; PCF controls are NOT (namespace-identified,
org-global). Both recorded import rejections came from exactly this class of
assumption.

## 5. Data access: Web API, FetchXML, and paging

**What it is.** Dataverse exposes one Web API (OData v4 REST: `$select`,
`$filter`, `$expand`, entity sets like `/accounts`). FetchXML is Dataverse's
own XML query language (joins via link-entity, aggregates, its own paging
cookie), executable through the same Web API. `savedQuery` is a stored system
view (FetchXML plus a layout) you can execute by id.

**In this kit.** FetchXML is authored as multi-line indented template literals;
every interpolated string value goes through `LibraryUtils.escapeXml`
(shared/utils/LibraryUtils.ts; live example
shared/features/counterparty/counterparty.ts). `context.webAPI` is Xrm-shaped
but routes per method (docs/gotchas.md, "Web API: which call routes where"),
the one table to memorize:

- CRUD (`createRecord` etc.): native `Xrm.WebApi` on modern and PCF; cds-client on V8.
- `fetch`, `fetchPage`, `retrieveMultipleByUrl`: the kit's own same-origin XHR
  cds-client EVERYWHERE, because native `Xrm.WebApi` drops the FetchXML paging
  annotations (morerecords, the paging cookie, total counts) and cannot
  re-issue an absolute `@odata.nextLink`. `fetch` is the kit's dominant query path.
- `executeAction`, `executeClassicWorkflow`: cds-client everywhere (the
  ergonomic path: positional args in, parsed body out).
- `execute`: native on modern (the standard `Xrm.WebApi.online.execute`
  request-object contract, actions AND functions), cds emulation on PCF and V8.
  `executeAction` and `execute` are siblings, neither wraps the other.
- `executeMultiple`: cds `$batch` everywhere (native rejects wholesale on one
  failure, which cannot honor the flat one-response-per-request contract).

Success shapes are host-identical; REJECTED promises are host-shaped, so treat
caught errors as opaque (docs/gotchas.md).

**savedQuery composition.** The saved-view grid and the lookups run
`?savedQuery={id}` with `$filter`/`$orderby`/`$top` layered on top. It works and
is live-verified, but Microsoft documents only the bare savedQuery call, so the
composition is undocumented platform behavior with a recorded fallback plan
(docs/gotchas.md; re-verify against current Microsoft docs before acting).

**Entity set names.** Convention-first: `LibraryUtils.entitySetName` pluralizes
the logical name; every `getEntityMetadata` resolution then teaches the cache
the authoritative `EntitySetName` (`LibraryUtils.cacheEntitySetName`). Pass an
explicit set name where you know the convention is wrong; inside a change set a
wrong guess 404s the whole transaction (docs/gotchas.md).

**Paging theory.** Online there are two mechanisms: OData `@odata.nextLink`
with `$skiptoken`, and the FetchXML paging cookie (plus
`returntotalrecordcount` for totals). OFFLINE none of that exists: the
supported offline query options are only `$select`, `$top`, `$filter`,
`$orderby`, `$expand`; `$skip` is never supported; `@odata.nextLink` is
deprecated for mobile offline; and Guid columns support only `eq`/`in` offline,
so a keyset (seek) cursor must be a NON-GUID column (`createdon` or a numeric
sequence). Keyset paging is the one approach that spans both states (recorded
in docs/internal/roadmap.md, "Direction: offline paging demo"; re-verify
against current Microsoft docs before acting). The grid's paging paths are
online-only today; the roadmap records the planned injectable pager seam.

**Repo home.** docs/gotchas.md, shared/utils/LibraryUtils.ts,
shared/context/PCFContext.ts and WebResourceContextV8.ts (routing),
docs/internal/roadmap.md (offline).

**The trap.** Polymorphic (Customer/Owner) lookups write through a
target-suffixed navigation property, `parentcustomerid_account@odata.bind`, not
the bare attribute name; a webresource ViewModel composes that key itself, a
field-bound PCF gets it for free (docs/gotchas.md).

## 6. Metadata: the standard EntityMetadata shape

**What it is.** Dataverse metadata describes tables and columns: display
names, option sets, requirement levels, lookup targets, precision. The standard
client API is `Xrm.Utility.getEntityMetadata(entityName, attributes)` (PCF:
`context.utils.getEntityMetadata`), resolving an EntityMetadata object with
PascalCase members whose `Attributes` is an ItemCollection (`get`/`getAll`).
The rich per-attribute data sits under each item's `attributeDescriptor`,
which is UNDOCUMENTED and not contractual (stable in practice; the platform's
own controls rely on it).

**In this kit.** The kit's metadata contract MIRRORS the standard client API
(a deliberate reversal of an earlier bespoke design, recorded in the decision
log; keep kit APIs close to the standard).
`context.utils.getEntityMetadata(entity, [attr])` then `Attributes.get(attr)`
is the kit-wide pattern. On modern and PCF hosts the native object passes
through untouched (offline-capable, client-cached), with a console-warned
OData fallback; pre-v9 (and that fallback) synthesize the SAME standard shape
from EntityDefinitions OData (shared/metadata/CdsEntityMetadataProvider.ts;
option labels via `$expand=OptionSet,GlobalOptionSet`). `getAttributeMetadata`
is RETIRED and so is the bespoke `IAttributeMetadata` MODEL; the name
survives, deliberately reused to type the standard store item.

**The one decoder file.** Every read of the under-documented
`attributeDescriptor` members lives in exactly one file,
`shared/metadata/attributeMetadataReads.ts`: small tolerant facet helpers
(`attributeKind`, `attributeDisplayName`, `attributeDescription`,
`attributeRequired`, `attributeOptions`, `attributeTargets`,
`attributeIsSecured` and the `attributeCanBeSecuredFor*` flags,
`attributePrecision`/`attributePrecisionSource`, min/max, `findAttributeMetadata`).
Encodings were pinned against a live org; anything unrecognized degrades to
kind "other", flags false, extras undefined. A platform wave that shifts an
encoding breaks one file with a dense test suite, not the smart tier.

**What MetadataService still owns.** Only the kit helpers with NO standard
equivalent: saved views, currency, entity icons, activity types
(`KitMetadataSource`). Views, currency, and the org pricing precision are data
reads riding the host's own IWebApi (offline-capable on modern and PCF);
activity types and entity icons stay on cds-client, being EntityDefinitions
queries only OData can express (docs/architecture.md). The entity icon URL for
OOTB entities rests on a path convention (`/_imgs/svg_<ObjectTypeCode>.svg`),
best-effort only (docs/gotchas.md).

**Repo home.** shared/metadata/attributeMetadataReads.ts,
shared/metadata/CdsEntityMetadataProvider.ts, docs/architecture.md.

**The trap.** Reading `attributeDescriptor` members anywhere outside
attributeMetadataReads.ts. That containment is the design; a second reader
reintroduces the exact fragility the file exists to quarantine.

## 7. Column (field-level) security

**What it is.** Field-level security (FLS): individual columns can be secured
via security profiles, and the PLATFORM enforces per-user read/update access.
The Web API returns a read-denied secured column as null; native forms mask or
lock such fields per user.

**In this kit, split by delivery shape.** A WEBRESOURCE has no per-user access
signal (that resolution lives in the form runtime), so the kit is safe and
honest: a column with metadata `IsSecured` renders read-only by default in the
smart controls, scoped by capability flags (when `CanBeSecuredForUpdate` is
false no profile can ever deny update, so the field stays editable), and
read-denied values simply show empty, indistinguishable from genuinely empty. A
host that knows better passes `readOnly={false}`. A BOUND PCF receives the
user's REAL effective access through the documented property surface
(`context.parameters.<property>.security`, the SecurityValues
editable/readable pair), consumed via one shared read in
`shared/context/pcfHostReads.ts`, so a secured column the user can edit stays
editable. The kit never resolves per-user column permissions itself; if a
webresource UI genuinely needs native-grade FLS, use a native form or a bound
PCF (README.md; docs/gotchas.md, "Column (field-level) security").

**Repo home.** docs/gotchas.md, README.md, shared/context/pcfHostReads.ts,
attributeIsSecured/attributeCanBeSecuredFor* in
shared/metadata/attributeMetadataReads.ts.

**The trap.** Two. First, believing the kit enforces security: it renders a
default, the platform enforces access. Second, this whole area is UNVERIFIED
against real security profiles (recorded in the docs); do not upgrade the
claims past that without the verification.

## 8. UCI client caching: why your just-published change is invisible

**What it is.** The Unified Interface caches aggressively at several distinct
layers, and each has a different clearing story. A publish that "did nothing"
is almost always a cache, not a failed deploy.

**The four layers, as this repo learned them:**

1. **Webresource resource cache.** A model-driven app serves a stable script
   URL from cache indefinitely. The kit defeats this at build time:
   clientui.html references the bundle as `new_clientui.js?v=<hash>` (webpack
   compilation hash), so changed content gets a new URL while the webresource
   NAME stays stable for registrations (docs/deployment.md, "Cache busting").
2. **The form-definition client store.** A published form change (new column,
   swapped control) can stay invisible because the old definition lives in the
   app's IndexedDB/localStorage, immune to reload AND hard reload. Clear the
   site data in DevTools, reload, expect the first load to spend about a minute
   on a cold metadata rebuild (docs/gotchas.md).
3. **The PCF bundle cache.** Reimporting a solution with the SAME
   `<control version>` succeeds, publishes, and keeps serving the previous
   bundle. The manifest version bump is a hard requirement on every redeploy,
   not a propagation lag (docs/gotchas.md, docs/adding-a-pcf.md).
4. **The service worker's Cache Storage.** A burst of rapid publishes can leave
   the form serving EMPTY sections until a full publish plus a cleared Cache
   Storage settles it. Related: UCI mounts below-the-fold webresource controls
   lazily, and on some warm or soft navigations not at all until a cold
   hydration (recorded in the decision log's injected-host entry; re-verify
   against current platform behavior before acting).

**Repo home.** docs/gotchas.md, docs/deployment.md.

**The trap.** Re-diagnosing the solution import, the deploy script, or the kit
itself when the answer is layer 2 or 4. Check caches BEFORE re-deploying. And
when using a debug-proxy replace loop (topic 10), disable the rule before
judging real deployed behavior.

## 9. Fluent UI v9 in this kit

**What it is.** Fluent UI v9 (`@fluentui/react-components`) is Microsoft's
current React design system; the refreshed UCI look is built on it, which is
why the kit can render native-parity UI. Theming flows through a
`FluentProvider` that sets CSS variables; styles are authored with `makeStyles`
(the griffel CSS-in-JS engine).

**In this kit.** One theme module, `shared/theme/` (`d365Theme.ts`); every app
and control renders inside a FluentProvider, and every PCF root builds its
provider from `pcfProviderProps(context)`, which also carries the full-width
style a virtual root needs (the platform mounts controls in a flex container
where a plain div shrinks, docs/adding-a-pcf.md). The webresource shell bundles
its own Fluent with React 18; the PCFs use the platform's copy (topic 3).

**Portals and the transparent popover.** A Fluent Popover/Menu portals its
surface to the document by default. In an embedded PCF that portal mounts
OUTSIDE the control's themed FluentProvider, where the theme's CSS variables
are undefined, so token-based backgrounds and shadows resolve to nothing and
the surface renders transparent with the form showing through. Render overlay
surfaces `inline` (or with an in-tree mountNode): the lookup flyout, the date
picker calendar, the time list, and the grid hovercard all do
(docs/gotchas.md).

**Tabster, one paragraph of history.** Tabster is Fluent's focus-management
engine, and it keeps ONE shared instance on `window`. When the kit's PCFs were
standard controls bundling their own Fluent, a bundled tabster newer than the
host's would augment that shared instance with a shape it lacked and throw
during init, blanking the control; the cure was pinning
`@fluentui/react-tabster` and `tabster` to the host's floor and re-pinning
every release wave. The virtual-control migration retired all of that: with
platform-provided Fluent there is exactly one tabster on the page, the host's,
and the collision is structurally impossible. The single survivor:
KitDatePicker bundles the `@fluentui/*-compat` picker packages (not in the
platform library), so their internal tabster chain stays pinned
(platform-floor.json `compatTabsterPins`) and the floor checker rejects
tabster overrides anywhere else.

**Repo home.** shared/theme/, pcfs/platform-floor.json, docs/gotchas.md,
docs/deployment.md.

**The trap.** For consumers who still build a standard (bundling) PCF, the
whole historical problem returns: dedupe React/Fluent to one copy, pin the
tabster chain, re-verify per wave (docs/deployment.md, "Standard controls",
kept as the historical note).

## 10. Toolchain glossary

- **pac CLI** (Power Platform CLI): Microsoft's command-line tool.
  `pac pcf init` scaffolds a control, `pac solution init/add-reference` builds
  a solution wrapper, `pac solution import` deploys, `pac auth create/select`
  manages org credentials. `pac pcf push` exists but ships a DEBUG bundle with
  no production switch; the kit deploys PCFs through the solution instead
  (docs/adding-a-pcf.md).
- **spkl**: a webresource deployment tool (SparkleXrm lineage), the kit's dev
  inner loop for webresources. Restored via `nuget install spkl`;
  `deployment/deploy.ps1` renders spkl.template.json and runs
  `spkl.exe webresources` non-interactively (docs/deployment.md).
- **SolutionPackager**: the pack/unpack engine for solution zips, run inside
  the cdsproj build here. Its trap is topic 4's empty `<WebResources />` node.
- **cdsproj + PowerApps MSBuild targets**: the MSBuild project type
  (`deployment/solution/D365UIKit.cdsproj`) that compiles referenced PCFs and
  packs the zip via `dotnet build -c Release`;
  `-p:SolutionPackageType=Unmanaged` for the dev variant.
- **Solution Checker**: Microsoft's static analysis over solutions. Recorded
  false positive here: `web-avoid-window-top` (High) reported against a
  bundled-Fluent PCF's bundle.js, pattern-matching Fluent's positioning engine
  reading `DOMRect.top`/`style.top`, not `window.top` (docs/gotchas.md).
  Advisory, relevant to AppSource certification only.
- **Fiddler autoresponder**: the webresource fast loop. An HTTPS debug proxy
  rule matches the bundle by NAME (`regex:(?insx).*new_clientui\.js`) and
  serves your local `dist/` file to the live org, so an edit is a rebuild plus
  a refresh, no publish (docs/deployment.md, "The Fiddler inner loop").

## 11. One-page glossary

| Term | As used in this repo |
|---|---|
| UCI | Unified Interface, the current model-driven client; "refreshed UCI" is the native look the kit matches |
| Model-driven app | A Dataverse app generated from metadata (forms, views, sitemap); the kit's host, and the only place a webresource gets Xrm |
| Dataverse | The data platform under Dynamics 365: tables, security, metadata, the Web API |
| Entity / table | Same thing, old and new names; addressed by logical name (`account`) |
| Attribute / column | A field on a table, old and new names; logical name like `industrycode` |
| Option set / choice | An enumerated column: numeric values with localized labels; rendered by OptionSetField / SmartOptionSet / KitOptionSet |
| Lookup | A reference column pointing at another table's record; polymorphic ones (Customer, Owner) span multiple targets and write target-suffixed `@odata.bind` |
| activitypointer | The base activity table unioning all activity types; it has no openable form, so the grid routes to the real form via `activitytypecode` |
| systemform | The Dataverse record holding a form definition; API-created ones default to `formpresentation` 0 and never join the form order (roadmap learning) |
| savedQuery / view | A stored system view: FetchXML plus a column layout; the kit reads layouts for SmartViewGrid and composes `?savedQuery=` with `$filter` |
| Publisher | The solution-authoring identity whose customization prefix (`new_`) decorates component names |
| Managed solution | The sealed artifact downstream orgs import; installs and uninstalls cleanly, cannot be edited in place |
| Webresource | An org-hosted file component (HTML/JS/CSS); prefix-scoped name, 5 MB ceiling, no Xrm outside a model-driven app |
| PCF | A PowerApps Component Framework code component bound into forms/grids; identity is the unprefixed `namespace.constructor`, org-global |
| FetchXML | Dataverse's XML query language (link-entity joins, aggregates, its own paging cookie); authored here as template literals with `LibraryUtils.escapeXml` |
| OData | The REST dialect of the Dataverse Web API (`$select`, `$filter`, `$expand`, entity sets) |
| FLS | Field-level security: per-column access via security profiles, enforced by the platform, not the kit |
| BPF | Business process flow, the staged chevron bar on forms; reachable through the kit's `formContext` process surface |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: README.md, docs/gotchas.md, docs/deployment.md,
docs/adding-a-pcf.md, docs/architecture.md, docs/glossary.md,
docs/internal/roadmap.md, docs/internal/decisions.md, plus direct reads of the
named source files. Platform facts (offline query limits, sovereign-cloud lag,
the parent.Xrm deprecation, the cross-publisher control identity) were
recorded from observation at dates noted in those docs; re-verify each against
current Microsoft docs before acting on them.

Re-verify drift-prone facts before relying on them (PowerShell):

- Floor numbers and tabster pins: `Get-Content pcfs/platform-floor.json`
- Virtual posture still enforced: `node scripts/check-pcf-floor.mjs`
- Manifests still virtual: `Get-ChildItem pcfs -Recurse -Filter ControlManifest.Input.xml | Select-String 'control-type='`
- Routing table still current: `Select-String -Path docs/gotchas.md -Pattern 'which call routes where'`
- Bundle sizes and floor prose: `Select-String -Path docs/deployment.md -Pattern 'Form budget|platform-library floor'`
