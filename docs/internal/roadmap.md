# Roadmap and open ideas

The original forward-looking items here have shipped (recorded under "Shipped").
Four directions are open: an offline-capable metadata rework (native-first),
in-app release communication, an offline paging demo, and a real tooltip with the
hint made opt-in. One idea stays parked for lack of a v8 environment.

## Direction: native-first, offline-capable metadata (scheduled)

### The gap

`MetadataService` reads ALL metadata through `CdsClient`, which is raw same-origin
XMLHttpRequest to the Web API. That path is online-only and caches in-memory per
session, so the entire smart tier (label, option, view, currency, icon
resolution) cannot run offline and loses its cache on reload. Offline is a goal
for the kit, so this is a real flaw, not a style preference.

### What we verified (live v9 org, 2026-06-20)

The native `Xrm.Utility.getEntityMetadata(entityName, attributes)` (and the PCF
`context.utils.getEntityMetadata`) is offline-capable AND returns the complete
attribute metadata at runtime, a strict superset of what the cds-client path
hand-fetches. The Xrm typings understate it: the rich data sits in PascalCase
under each attribute's `attributeDescriptor`, reached via `.Attributes.getAll()`.
Confirmed present on the live org (account):

- Everything the kit needs: `Description`, `RequiredLevel`, `MaxLength`,
  `MinValue`/`MaxValue`, `Precision`, `PrecisionSource`, `Format`/`Behavior`
  (DateOnly), lookup `Targets`, `OptionSet`.
- Extras the cds-client path never had: `IsSecured` +
  `CanBeSecuredForCreate/Read/Update` (field-level security) and
  `IsValidForCreate/Read/Update` (read-only detection).

So the original raw-EntityDefinitions choice bought nothing over native and cost
offline support.

### The decision

Native-first with a cds-client fallback. Route entity and attribute metadata
through native `getEntityMetadata` on the modern and PCF hosts; keep the
cds-client `EntityDefinitions` path only for the legacy V8 host (pre-v9, no native
API, never an offline scenario). Views and currency are data, not metadata, so
their offline-capable path is native `Xrm.WebApi`, not cds-client.

### Pieces to build (when picked up)

1. A host-provided native metadata source injected into `MetadataService`
   (`Xrm.Utility` on modern, `context.utils` on PCF), with the cds-client path as
   the V8 fallback. The smart controls already know their attribute, which fits
   the `attributes` parameter `getEntityMetadata` wants.
2. ONE isolated mapper from the native `attributeDescriptor` shape to the kit's
   `IAttributeMetadata`. The shape is undocumented PascalCase and not contractual
   (the platform's own controls rely on it, so it is stable in practice), so
   isolating the mapping contains the risk.
3. Route views (`savedqueries`) and currency (`transactioncurrency`) through
   native `Xrm.WebApi` so they are offline-capable too.
4. Persisting metadata across reloads can ride the platform cache rather than a
   custom IndexedDB store, since native metadata is already offline-cached.

### Items this folds in or enables

- Item 17 (money `PrecisionSource`): already shipped over cds-client; the
  consumer logic in `SmartNumberField` is reusable, the rework just changes the
  source. The live org shows `revenue` is `PrecisionSource = 2` (org pricing
  precision), which still needs the org `pricingdecimalprecision` value to render
  exactly, a separate org-settings read.
- Item 20 (smart `hint` from attribute `Description`): native supplies
  `Description`; the presentational wiring is architecture-agnostic.
- Item 25 (FLS awareness): upgrades from "gotcha only" to real, since native
  exposes `IsSecured` and the `CanBeSecuredFor*` flags.
- Item 18 (entity set name): `EntitySetName` comes back offline-capable from
  native metadata and feeds the same `LibraryUtils` cache. This SUPERSEDES the
  proposed async cds-client entity-set resolver, which should NOT be built. The
  shipped cache-aware pluralizer stays as the sync fast path and fallback.

## Direction: in-app "what's new" for a release

### The gap

When a team ships a release (new forms, fields, custom UI from this kit), end
users rarely learn what changed. The usual channels each miss in a different way:
email and Teams are push, out of context, and easy to ignore; a SharePoint or
wiki page lives outside the app the change is in. Model-driven **in-app
notifications** (the `appnotification` table) are real, but they are per-event,
transient toasts in the notification center, not a curated, versioned "here is
what changed since you were last here" digest that a product owner controls per
release, with read-state and a browsable history.

### Why this kit fits

- It is custom UI over the Web API, so a "What's new" panel renders in Fluent v9
  and reads as native, not a foreign page.
- It already owns the launch surface: `openClientUI` opens an app as a centered
  dialog or a side pane from a command-bar button, the two shapes this wants.
- The note list is exactly the host-owned collection `ObservableArray` was built
  for: a View binds it, the ViewModel loads and gates it.
- Per-user "seen" gating is ordinary ViewModel logic over the Web API: compare
  the latest published release against what this user last acknowledged.

### Framing (keep this honest)

This renders product-owner-authored content; it is not a CMS. The PO authors
release notes on a **standard model-driven form** over a Dataverse table, the
same boundary the wizard keeps: the kit renders and gates, the platform authors.
Out of scope: a rich WYSIWYG authoring UI, scheduling or campaign targeting, A/B
audiences. It is complementary to in-app notifications, not a replacement: use
notifications for transient, per-event pings; use this for the release-scoped,
revisitable changelog.

### Pieces to build (when picked up)

1. A **release-notes data model**: a Dataverse table (version or semver,
   published date, title, summary, body, a New/Improved/Fixed category, and an
   optional audience by security role or team). Authored through a normal form,
   so no custom authoring UI is in scope.
2. A **presentational "What's new" surface**: a dialog or side-pane list of
   entries (newest first), category badges, and a per-entry expand. CRM-agnostic,
   so it renders in Storybook from fixtures with zero mocks.
3. A **seen/acknowledged strategy**: store each user's last-seen release so the
   surface shows only what is new and marks it read on dismiss. Cross-device
   means Dataverse-backed (a per-user acknowledgement row, or a user setting),
   not browser storage. This is the main open design question.
4. A **launch pattern**: auto-open once per user when the latest published
   release is newer than their last-seen, plus a manual "What's new" entry point
   on the command bar. Both reuse `openClientUI` (dialog or side pane).
5. A **smart variant (optional)**: resolve the category option-set labels and the
   published-date format from metadata, so a metadata-aware entry looks native
   for free, consistent with the rest of the smart tier.

### Possible avenue, not planned

Sourcing notes from outside Dataverse (a CI release pipeline writing entries on
deploy, or a markdown file in the solution) would let engineering, not only the
PO, append "what changed." Noted as a nice-to-have; the Dataverse-authored path
is the honest default because it needs no extra infrastructure.

### README follow-up

When this is picked up, consider a "When to reach for it" row for in-app release
communication, where in-app notifications are too transient and email is out of
context.

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
leans on the native-first metadata direction insofar as the offline data reads go
through native `Xrm.WebApi`, so it is naturally picked up after, or alongside,
that work.

## Direction: a real tooltip, and the hint made opt-in

### The gap

The `hint` prop (item 20) renders as always-visible helper text under the label
(Fluent `Field` hint). That is not what an info affordance usually means: the
common pattern is a small info icon beside the label whose text appears in a
tooltip on hover or focus, shown only on demand. The kit has no such tooltip
control today, and `hint` got conflated with it.

### The correction (two parts)

1. Stop defaulting `hint` from metadata. Today `SmartFieldBase.resolveHint` falls
   back to the attribute's Dataverse `Description`, so any field with a Description
   shows always-on helper text whether the author wanted it or not. Make `hint`
   opt-in: render it only when a `hint` prop is passed, and drop the
   metadata-`Description` default. This revises the item-20 decision (and the note
   under the native-first metadata direction that lists item 20 as folding in
   `Description`).
2. Add a proper tooltip affordance. A presentational info control (an info icon by
   the label whose text shows in a Fluent `Tooltip` on hover or focus, dismissible
   and keyboard accessible) for on-demand help, distinct from the always-visible
   `hint`. The smart tier may optionally source its content from the attribute
   `Description` (the original intent), now behind an explicit opt-in rather than
   an always-on default.

### Why later

Both are behavior changes to a shipped prop plus a new control. Batch them with
the docs pass that is already revisiting the smart-field stories, and update the
shared `fieldContractNote`, which currently tells readers the hint defaults to the
attribute Description.

## Shipped (were roadmap items)

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

## Parked (needs an environment we do not have)

- **Classic dialog XML -> generated wizard.** Classic dialog definitions are XML
  with a defined schema (pages, typed prompts, responses, conditions, query and
  set-value steps), close to a formal spec of a wizard. A transform from that XML
  into a generated ViewModel plus step Views could accelerate rebuilding legacy
  dialogs. It is an uncommon need (orgs on CRM v8 or earlier are out of support
  and few remain), and building or testing it needs a legacy v8 environment,
  which is not currently available. Noted as a nice-to-have if such an
  environment turns up.
