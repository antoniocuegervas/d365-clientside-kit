# Roadmap and open ideas

The original forward-looking items here have shipped (recorded under "Shipped").
Four directions are open: an offline paging demo, a real tooltip (its
hint-opt-in half shipped with the metadata rework; the control is open), an
inline record-preview capability for lookups, and the presentational tier as
an npm package for build-beside consumption. Two ideas are parked, each with
its reason recorded there. One former direction, in-app release communication,
is retired from the kit entirely: it needs custom schema to run and is a
product, not a sample, so it ships as a standalone solution built on the kit
(the decision log records the reasoning, D-058).

## Direction: offline paging demo (PCF and webresource grid)

### The gap

Paging a Dataverse result set behaves differently online and offline, and the
platform offers no single mechanism that spans both. Online there is cookie
paging (`@odata.nextLink` with `$skiptoken`, or the FetchXML paging cookie).
Offline none of that exists: `$skip` is never supported, the FetchXML paging
cookie is online-only, and `@odata.nextLink` is deprecated for mobile offline.
The supported offline query options are just `$select`, `$top`, `$filter`,
`$orderby`, and `$expand`. So there is no general-case paging solution we can hand
a consumer; Microsoft intends this to be solved per scenario. That makes it worth
demonstrating concretely rather than documenting in the abstract.

### What to demo

A grid that pages correctly in both connection states using keyset (seek) paging,
the one approach that works in both:

- Order by a stable cursor column whose type supports a `gt` filter offline
  (an autonumber or integer sequence, or `createdon`), NOT the GUID primary key
  (offline allows only `eq`/`in` on Guid, no greater-than).
- Each page is one bounded query: `$orderby` on the cursor, `$filter` with `gt`
  the last-seen cursor value, `$top` as the page size. The View holds the cursor,
  since offline gives back no opaque token.
- Show the `createdon`-tie edge case honestly: without a GUID tiebreaker offline,
  records sharing a timestamp can straddle a page boundary, which is why a numeric
  sequence column is the safer cursor.

### The real deliverable: an injectable pager, not a fork

`SmartViewGrid` today bakes in three paging paths, and all three are the
online-only mechanisms:

- `goNext` follows an `@odata.nextLink` (`retrieveMultipleByUrl`), deprecated
  offline.
- `loadRichPage` uses FetchXML `page`/`count` (`fetchPage`), online-only.
- the simple path leans on `maxPageSize` producing a `nextLink`, the
  offline-deprecated cookie.

So offline, the paging part of the grid is non-functional. The tempting fix is a
forked offline grid, but that is the wrong tool: paging is about a third of the
file, and the other two thirds (column resolution from the view layout,
metadata-driven headers, lookup/dynamic/aliased cell rendering, quick find,
server sort, activity-type form routing) are host-agnostic. A fork copies all of
that to swap the paging third, and the two copies drift the first time someone
touches column logic. That duplication is exactly what the single-source design
exists to avoid.

The grid already has the right seam half-built: in controlled mode
(`overrideFetchXml` set) it raises `onPageChange` and the host re-supplies the
page's rows. Generalize that instead of forking. Extract the three baked-in paths
behind one interface the grid depends on:

```
interface IGridPager {
  firstPage(query, pageSize): Promise<PageResult>;
  nextPage(): Promise<PageResult>;
  goToPage?(n): Promise<PageResult>;   // optional capability
  readonly canJumpToPage: boolean;
  readonly hasReliableTotal: boolean;
}
```

Two implementations: an ONLINE pager (today's cookie/`fetchPage` logic lifted
verbatim) and an OFFLINE keyset pager (`$orderby` cursor + `$filter gt` +
`$top`). Select by `vmContext.client.isOffline()`. The grid keeps every line of
its column/cell/sort/quick-find logic and just calls the pager. One component,
swappable paging, the opposite of a fork.

The capability flags are not decoration. The offline pager CANNOT honor
`pagination="rich"`: jump-to-page and a reliable total are server-cookie and
`returntotalrecordcount` features, both online-only. So offline degrades to
forward/back seek paging (the existing "simple" shape), no page numbers, likely
no "X of N". The grid hides the rich `Pagination` controls when `canJumpToPage`
is false, rather than rendering buttons that cannot work. Encoding "offline =
seek-only" as a typed capability beats discovering it as a broken button.

### Both hosts, on purpose

The point is that the same ViewModel paging logic ships unchanged across delivery
shapes:

1. A **PCF** sample binding the kit's grid to a keyset-paged ViewModel, reading
   through `context.webAPI` (and `Xrm.WebApi.offline` where offline).
2. A **webresource** grid app under `clientui/apps`, same ViewModel, launched the
   usual way.

Both reuse the presentational grid and a shared paging ViewModel, so the demo
doubles as proof the three-layer split holds when the data source paging rules
get awkward.

### Note

More than a demo: the real work is the `SmartViewGrid` pager refactor above, with
the two sample apps as its proof. It folds in none of the other roadmap items, but
leans on the native-first metadata rework (now shipped) insofar as the offline
data reads go through native `Xrm.WebApi`, so the ground under it is in place.

## Direction: a real tooltip (the hint half shipped)

### The gap

An info affordance usually means a small info icon beside the label whose text
appears in a tooltip on hover or focus, shown only on demand. The kit has no
such shared tooltip control today; the `hint` prop (always-visible Fluent
`Field` helper text) got conflated with it.

### Status

The first half SHIPPED with the native-first metadata rework (2026-07-03,
decision log): `hint` is opt-in, rendering only when the prop is passed, and
the attribute's Dataverse `Description` no longer leaks in as an always-on
default. The `fieldContractNote`, the smart-field story, and
control-configuration.md document the opt-in posture. The Description stays
readable through `attributeDescription`, which is exactly the seam the second
half consumes.

### Still open: the tooltip control

A presentational info control (an info icon by the label whose text shows in a
Fluent `Tooltip` on hover or focus, dismissible and keyboard accessible) for
on-demand help, distinct from the always-visible `hint`. The smart tier may
optionally source its content from the attribute `Description`, behind an
explicit opt-in. The KitTooltip PCF sample already demonstrates the pattern
(it reads the Description through the standard metadata surface); the open
work is promoting a shared presentational control out of it.

## Direction: inline record preview for any record reference

### The gap

When the UI shows a reference to a record (a lookup value, a grid lookup cell, a
persona), reading any detail about that record means navigating to it. The native
lookup already solves a slice of this: expanding a row in the lookup flyout shows
the next lookup-view columns inline (verified: Email, Business Phone, Company
Name, City), and for contact specifically, hovering the name shows the contact
card. The expand is general (any table with a lookup view); the hover card is an
entity-specific flavor (it does not appear on the parent-account lookup).

### The idea

Build record preview as a general, reusable capability for ANY record type, not a
contact special-case:

1. An expandable detail that lists a record's key columns inline, sourced from the
   table's lookup or quick-find view layout (the kit already reads view layouts
   for `SmartViewGrid`, so the column resolution is in hand).
2. An optional hover/peek card over a record name, the same content in a popover,
   modeled on the native contact card but driven off the view layout so it works
   for any table.

Reusable wherever the kit renders a record reference: the lookup flyout (now
shipped as `SmartNativeLookup`'s chevron-expand), grid lookup cells, and persona
lists.

### Why later

`SmartNativeLookup` ships the in-flyout expand as the first concrete use.
Generalizing it into a shared preview surface (and the hover card) is the broader
follow-up, picked up naturally alongside the native-first metadata direction,
since the column values are offline-capable Web API reads.

## Direction: the presentational tier as an npm package (build-beside consumption)

### The gap

The code-app adapter spike (parked below) established the shape of that host:
the CRM-aware tiers hit a capability ceiling (no FetchXML, base-type-only
metadata), but the presentational tier needs no adapter at all, it is
CRM-agnostic by design and already runs in any React app. What is missing is a
consumable form: today the only way to use the presentational controls outside
this repo is cloning or template-copying the whole kit, which is wrong-shaped
for a code-app team that just wants native-looking D365 components in a
standalone React app.

### The idea

Publish the presentational tier as a versioned npm package: the presentational
controls, the theme module, and the reactivity primitives their props accept
(Observable, ObservableArray, the OrObservable types). Nothing CRM-aware goes
in: no context adapters, no metadata, no cds-client. Peer dependencies on
React and Fluent v9; ESM plus type declarations. The kit itself stays
source-first (the spec's no-registry stance was about the kit's own
consumption model; packaging the CRM-agnostic tier for OTHER apps revises
that deliberately, to be recorded when picked up).

### Why later

The release-engineering half it leaned on now exists (versioned artifacts
build from the repo and CI publishes the managed zip, shipped with v1.2.0);
what remains is the npm side, a publish step and the package boundary, which
wants deciding calmly (what of the reactivity surface is public API, how the
theme tokens ship). Picked up after v1.2.0; a decision entry records the
boundary when it lands.

## Smaller follow-ups (carried out of the 2026-07 hardening round)

Bounded items, not directions. Each was deliberately deferred from a resolved
piece of that round (the posture is recorded in decisions.md, D-051) and lives
here so it is not lost with the round's working notes.

- **Move the counterparty "+N more" hovercard off `Popover`.** EVALUATED AND
  CLOSED (2026-07-02): it stays on `Popover`, because every party in the
  surface is a clickable link (a tooltip surface is display-only and keyboard
  users could never reach links inside it). The tabster half of the original
  rationale is gone since the virtual-control migration (no bundled tabster
  anywhere); the surface now renders in place (`inline`) so it stays inside the
  themed provider on an embedded host.
- **Centralize the PCF Fluent/tabster pin.** DONE (2026-07-02) and then
  SUPERSEDED by the virtual-control migration: the pin file and checker became
  `pcfs/platform-floor.json` + `scripts/check-pcf-floor.mjs` (still first in
  `npm run verify`), which enforce the virtual posture instead: same manifest
  platform-library declarations everywhere, React and Fluent dev-only at the
  floor versions, tabster pins only where a compat package is genuinely
  bundled, and no React-18-only APIs in shared/.
- **Hold the Storybook snippet bar on the non-field stories.** DONE (2026-07-02):
  the audit found the smart and scenario tiers already at the bar; the gap was the
  twelve field-tier presentational stories, which had no component-level contract
  description. Each now states the values-in, events-out contract, what the host
  supplies, and its smart counterpart.
- **Measure real form-load impact of the kit PCFs.** PARTIALLY DONE (2026-07-02):
  the absolute number is captured and published in deployment.md, the sample
  Contact form with four kit PCFs plus the timeline opens warm in 1.03-1.17 s
  (median ~1.09 s, four full reloads, UCI page-load KPI via `&perf=true`). Still
  open: the A/B delta against a kit-free twin form. Learnings for that run: build
  the twin in the form designer, not the raw API (an API-created systemform
  defaults to `formpresentation` 0 and never joins the entity's form order, so
  UCI ignores it even with `&formid=` and an app publish), and expect the
  client-side form cache to need an IndexedDB/localStorage clear between
  publishes (see gotchas.md).

## Shipped (were roadmap items)

- **Release engineering: the managed kit solution builds from the repo.**
  SHIPPED (2026-07-04, feature/release-engineering, closing the block the
  decision log deferred to "the next time a release is cut"; its newest
  entry records the decisions). `deployment/solution` packs the five PCF
  controls (Release builds) and the three shell webresources into a managed
  zip via `npm run build` plus `dotnet build -c Release`, publisher and
  prefix rendered from `kit.config.json` and the solution version from
  `package.json` at build time; CI gained a Package stage that publishes the
  zip as the `managed-solution` artifact with no org credential; the version
  pass moved the kit and every control manifest to 1.2.0 (control versions
  track the kit release from here). Pending: the packaging stage's first
  real pipeline run (yaml is only proven by execution), and the
  clean-org import verification (install, exercise, uninstall cleanly)
  before the zip is published as a release artifact. The import verification
  is DONE (2026-07-04, on the third pass): the first two attempts were
  rejected instructively (the solution-name collision with the unmanaged
  SPKL deploy target, then the org-global custom-control identity that
  ignores publisher prefixes), and the third verified the machinery end to
  end on the dev org with a verification-only build differing from the
  release zip by the manifest namespace string alone: managed import,
  webresources carrying their deterministic ids, a control bound and
  committing values on a live form with no console errors, the shell
  booting the samples hub with a sample loading live data, and a first-try
  clean uninstall back to the org's exact baseline. The decision log's
  entry carries the full record; deployment.md states the three-check
  clean criterion and the verification-only-build technique. Still
  pending: the Package stage's first real pipeline run.

- **Native-first, standard-shaped, offline-capable metadata.** SHIPPED
  (2026-07-03, feature/native-first-metadata; the decision log's newest entry
  records the full posture). Mid-build the owner corrected the direction: the
  kit's metadata surface now MIRRORS the standard client API instead of
  adapting native metadata into a bespoke model. `context.utils.
  getEntityMetadata(entityName, attributes)` resolves the platform
  EntityMetadata shape (native pass-through on modern and PCF with an OData
  fallback; the same shape synthesized from OData on pre-v9),
  `getAttributeMetadata` is retired, the bespoke `IAttributeMetadata` MODEL
  is retired (the name survives, deliberately reused to type the standard
  store item), and one helpers file (`attributeMetadataReads`) owns the
  under-documented attributeDescriptor decoding. Views, currency, and the org pricing precision ride the host
  Web API (offline-capable on modern and PCF); activity types and entity
  icons stay on cds-client (EntityDefinitions-only queries). Fold-ins landed:
  EntitySetName teaches the pluralizer cache from every native read (the
  proposed async cds resolver stays unbuilt, superseded), PrecisionSource 2
  money rounds by the real org pricing precision, FLS capability flags scope
  the webresource read-only default, the hint went opt-in (see the tooltip
  direction), and the post-resolution writes are batched (one loading paint,
  one content paint, Profiler-pinned in tests).
  Live-verified on the dev org (2026-07-04): the store's encodings match the
  reads helpers on every probed kind (strings, numeric RequiredLevel and
  Behavior, array OptionSets, Targets, FLS booleans, revenue PrecisionSource
  2); the master-detail sample resolves labels, options, formats, currency
  symbol, and polymorphic lookup targets with the kit's only raw XHRs being
  the usersettings formatting read and the entity-icon EntityDefinitions
  read; no hint text on Description-only fields; no console errors. The five
  PCFs were rebuilt (bumped manifests) and imported; on the sample Contact
  form with `&perf=true`, no kit control is flagged for excessive rendering
  while the native lookup twin flags at 3 and native section containers at 2,
  so the kit sits inside the platform's own 2-3 band (it was 5 before the
  batching). Remaining checks: offline behavior itself (not verifiable from a
  desktop session), FLS behavior against real column-security profiles (org
  security deliberately not reconfigured), the V8 synthesis path (no v8
  environment), and the pre-existing "control initialized more than once
  during form load" platform note on the lookup PCF (still present, still
  init-count only, still worth one targeted DevTools look). On the cds
  synthesis path the two-requests-per-attribute shape remains by choice; it
  is now the pre-v9-primary/fallback-only path, so the D-055 fan-out concern
  is dissolved where it mattered (the native store is client-cached, and
  SmartViewGrid batches a whole entity's columns into one call).

- **Platform-provided libraries for the PCF tier (virtual controls).** SHIPPED
  (2026-07-02, the decision log's migration entry): all five kit PCFs migrated
  to `control-type="virtual"` and were verified end to end on the live dev org
  (render, value commit, save, host-driven update, no console errors). The
  platform serves React 17 and its current Fluent at runtime; bundles fell from
  350-750 KB to 7-82 KB (the date picker stays at 380 KB, the compat-picker
  exception). The tabster pin, the re-pin runbook, and the per-form budget are
  retired; the reactivity core gained the repaint batching shim (one code path
  for the React 18 shell and the React 16/17 PCF host), and the pin checker was
  repurposed as the platform-floor checker (`pcfs/platform-floor.json` +
  `scripts/check-pcf-floor.mjs`, including the React-18-only API scan of
  shared/). Form load was re-measured with the virtual builds and both
  datapoints are published in deployment.md (roughly a second and a half warm
  either way; the win is the retired maintenance, not a load-time delta).

- **Multi-stage gated data input (the wizard capability).** Built as a reusable
  engine plus a sample app:
  - `shared/wizard/WizardViewModel.ts`: step sequence, per-step gating
    (`isStepValid`), back/next, an `isDirty` unsaved-progress flag, `isBusy`
    navigation lock, and a `commit` seam for atomic persistence.
  - `clientui/apps/sample-new-account-wizard`: a three-step, standard-entity
    "new account + primary contact" flow on any plain Dataverse org, with the
    in-memory-draft-then-commit strategy and a custom-API drop-in documented at
    the `commit()` seam.
  - Launch helper: `navigation.openClientUI(...)` opens a webresource app as a
    centered dialog or a side pane (see `clienthooks/ribbon/AccountRibbon.ts`).
  - The README "When to reach for it" table carries the multi-stage gated-input
    row.

- **Required-field demos react to input.** Every required-field Storybook story
  now wires the validation message to track emptiness as the user types, rather
  than showing it statically (the presentational field stories under
  `tests/storybook/controls/presentational`).

## Parked

Each entry names its own reason; these are ideas kept warm, not commitments.

- **The code-app context adapter (built, parked before release).** The v1.2.0
  wave built a complete CodeAppContext adapter over the code-apps SDK, spike
  doc first, then the adapter, a sample app, and a host guide, verify-green
  at the tip; it lives UNMERGED on the reference branch
  `spike/code-app-adapter` (five commits ending e9c4b0f, its own decision
  entry recorded on the branch). Parked because the host's capability ceiling
  caps exactly the tiers that differentiate the kit: the SDK executes no
  FetchXML (so SmartViewGrid and the native lookup's search cannot run) and
  its metadata read stops at base types (choice options need stringmap reads,
  lookup targets reconstruction), leaving CRUD, OData queries, and thin smart
  fields, too little to justify a fourth shipped host. One finding worth
  keeping: a code-app grid, if ever wanted, is an OData query mode for the
  grid, not an IGridPager implementation (the gap is the query language, not
  paging). Revisit triggers: the SDK gains FetchXML or a full metadata read,
  or a real consumer needs the smart field tier in a code app. The fresher
  forward path is the presentational npm package direction above; the parking
  decision is D-060.
- **Classic dialog XML -> generated wizard.** Classic dialog definitions are XML
  with a defined schema (pages, typed prompts, responses, conditions, query and
  set-value steps), close to a formal spec of a wizard. A transform from that XML
  into a generated ViewModel plus step Views could accelerate rebuilding legacy
  dialogs. It is an uncommon need (orgs on CRM v8 or earlier are out of support
  and few remain), and building or testing it needs a legacy v8 environment,
  which is not currently available. Noted as a nice-to-have if such an
  environment turns up.
