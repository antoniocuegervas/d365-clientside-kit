# Control Configuration Reference, Metadata-Aware Controls

The form-designer mapping: each smart control needs `entity` + `attribute` +
a value `Observable`; everything else resolves from Dataverse metadata and
every resolved default can be overridden by a prop.

## Value types and imports (what to actually type)

The two things every wiring session needs first: what `T` is in each
control's value `Observable<T>`, and where the pieces import from. The
compiler catches a wrong guess, but here is the answer up front:

| Smart control | `value` Observable type |
|---|---|
| `SmartTextField` | `Observable<string \| null>` |
| `SmartOptionSet` / `SmartBooleanField` | `Observable<number \| null>` (booleans ride the option values 0/1) |
| `SmartMultiSelectOptionSet` | `Observable<number[]>` |
| `SmartNumberField` | `Observable<number \| null>` |
| `SmartDatePicker` | `Observable<Date \| null>` |
| `SmartLookup` / `SmartNativeLookup` | `Observable<IEntityReference \| null>` |

Real import paths from an app folder (`clientui/apps/<your-app>/`):

```ts
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartDatePicker } from "../../../shared/controls/smart/SmartDatePicker";
import { SmartNativeLookup } from "../../../shared/controls/smart/SmartNativeLookup";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
```

Every smart control lives under `shared/controls/smart/<Name>.tsx`;
`IEntityReference` comes from `shared/utils/EntityModel`.

## Common to all Smart field controls (`ISmartFieldProps`)

| Param | Required | Resolves automatically when omitted |
|---|---|---|
| `entity` | ✔ | - |
| `attribute` | ✔ | - |
| `value` (Observable) | ✔ | (host-owned; control writes changes into it and raises `onChange`) |
| `label` | | Attribute display name |
| `required` | | Attribute requirement level (Application/System required) |
| `disabled` / `readOnly` | | off (a column-secured attribute defaults to read-only when its update can be restricted) |
| `hint` | | none; opt-in helper text under the label. The attribute Description is deliberately NOT a default (on-demand description belongs to a tooltip surface) |
| `errorMessage` | | none |
| `onChange` | | none (value Observable still updated) |

## Per control

### SmartTextField
Auto: single-line vs multiline (memo), max length. Extra props: `rows` (memo only).

### SmartOptionSet
Auto: option values, labels, colors (global or local set). Extra:
`filterOptions(options) => options` for dynamic pruning.

### SmartMultiSelectOptionSet
Auto: options as above. `value` is `Observable<number[]>`.

### SmartBooleanField
Auto: Yes/No labels from the boolean option set metadata.

### SmartNumberField
Auto: precision (0 for whole numbers), min/max bounds, money detection, and the
user's decimal symbol / group separator from `context.getFormatting()`.
Extra:

| Prop | Purpose |
|---|---|
| `currencySymbol` | Force the money prefix, highest priority |
| `transactionCurrencyId` | Resolve the record's real currency symbol from `transactioncurrency`; used when `currencySymbol` is omitted. Falls back to `$` |

### SmartDatePicker
Auto: date-only vs date-and-time from attribute format; localized calendar
strings (day/month names), first day of week, and short-date display format
from `context.getFormatting()`.

### SmartLookup
Auto: target entity (first metadata target), target's primary name/id
attributes; the entity's lookup view (querytype 64) as the default search
source, so a plain lookup searches the same records the platform lookup shows;
search-as-you-type with a begins-with match on the primary name (the native
lookup's default).

Saving the picked value: a lookup does not save as a plain property. In your
ViewModel's create/update payload, write the navigation property's
`@odata.bind` form instead of the attribute name:

```ts
"primarycontactid@odata.bind": LibraryUtils.odataBind(this.primaryContact.value)
```

Polymorphic lookups (customerid, ownerid) change the property NAME per picked
target; see gotchas.md ("A polymorphic (Customer/Owner) lookup writes through
a target-suffixed navigation property") before wiring one. The master-detail
sample app's save handler shows the full pattern.

Extra props:

| Prop | Purpose |
|---|---|
| `targetEntity` | Pick one target on Customer/Owner polymorphic lookups |
| `filter` | OData `$filter` clause ANDed into every inline search, the "one extra filter step" scenario; can change between renders (cascades) |
| `top` | Result count (default 10) |
| `searchDebounceMs` | Default 250; 0 for tests |
| `mode` | `"inline"` (default search box) or `"dialog"` (native CRM picker via lookupObjects, same value contract) |
| `filterXml` | FetchXML `<filter>` for the dialog's view (dialog mode) |
| `viewId` / `viewName` | View-driven inline search, run a specific saved view as the source (overrides the default lookup view) |
| `showIcons` | Resolve + show the target entity's icon in results |

### SmartNativeLookup
The native-parity lookup: a resting chip with clickthrough, and an inline flyout
that opens on click, loads the entity's lookup view (querytype 64) first page,
filters as you type with the match bolded, and expands per-row detail (the lookup
view's columns, name over the first column, the rest behind a conditional
chevron). Same value contract as `SmartLookup` (the simpler combobox); reach for
it when native look and feel (muscle memory) is the point. Replaces the former
`StandardLookupField`. Auto-resolves the target, the lookup view + columns, and
the entity icon from metadata. Extra props (beyond the smart-field common set):

| Prop | Purpose |
|---|---|
| `targetEntity` | Pick the initial target on Customer/Owner polymorphic lookups; the flyout header offers a switcher between targets |
| `filter` | OData `$filter` clause ANDed into the search |
| `top` | Result count (default 10) |
| `searchDebounceMs` | Default 250; 0 for tests |
| `viewId` / `viewName` | Override the default lookup view that drives the flyout columns and search |
| `filterXml` | FetchXML `<filter>` applied to the Advanced (native picker) view |
| `showIcons` | Show the entity icon in the flyout rows and the resting chip (resolved from the value's entity, so it shows on load); on by default, set `false` to disable and skip the metadata read |
| `showAdvanced` | Footer "Advanced" escalation to the native picker (default on) |
| `showNew` | Footer "+ New" quick-create on the target (default off; the target must support quick create) |

### SmartViewGrid
Auto: layout/columns from the savedquery's `layoutjson` (preferred) or
`layoutxml`, headers + types resolved against each column's owning entity
(related entity for link-entity/aliased columns), formatted cell values,
type-aware lookup cells (clickable links that openForm the target), row keys
from the primary id. Data runs via `?savedQuery={id}` so quick find /
filters / server sort layer on as OData options. Activity views (`activitypointer`)
open the real activity type on row invoke.

| Prop | Purpose |
|---|---|
| `entity` (✔) | Table logical name |
| `viewId` | Saved view id; omitted = default grid view |
| `viewName` | Saved view by display name (resolved via getViewByName) |
| `quickFind` (Observable&lt;string&gt;) | Contains-search text, debounced; ANDed into the query |
| `quickFindFields` | Fields quick find searches (default: primary name) |
| `filters` (Observable) | Declarative eq/ne filters, re-queried server-side |
| `serverSort` + `orderBy` (Observable, optional) | Header clicks sort server-side by re-query (`$orderby`, back to page 1). Without `serverSort` the grid does not sort at all (no in-memory page sort). `orderBy` seeds and exposes the spec; the grid keeps its own when omitted |
| `pageSize` | Server-side paging with a Pagination control |
| `pagination` | `"simple"` (default, forward-cookie next/prev) or `"rich"` (jump-to-page combobox + first/last + "X–Y of N" via FetchXML `page`/`count`). Requires `pageSize` |
| `onPageChange(n)` | Raised on every page change; the controlled hook for `overrideFetchXml` + rich (host re-supplies the page) |
| `pageCount` / `totalRecordCount` (Observable) | Host-supplied totals for the `overrideFetchXml` + rich case (the grid computes them on the saved-view path) |
| `currentPage` (Observable) | Host-owned current page; the grid writes its page changes here |
| `overrideFetchXml` (Observable) | Host supplies the query; view supplies the layout |
| `refresh` (ObservableEvent) | Publish to re-run the query |
| `onRecordSelected(id, row)` / `selectedRecordId` | Single-select click + highlight |
| `onItemInvoked(id, row)` | Invoke (double-click/Enter); defaults to openForm |
| `multiSelect` + `selectedRecordIds` + `onSelectedRecords` | Multi-select checkboxes |
| `columnOverrides` | Dynamic/polymorphic columns: one column resolved from 2+ source fields, each with its own formatting; keyed by layout column or a synthetic `calc_*` key |
| `emptyMessage` | Empty-state text |

Note: link-entity (aliased / dotted) columns can't be filtered or sorted
through the savedQuery layer, those clauses are dropped (a platform boundary).

## What you should never hand-configure for standard fields

Option-value → label maps, decimal precision, currency placement, date
formats, lookup target resolution, label text, required asterisks. If you are
writing any of those for a standard attribute, use the smart control instead.
