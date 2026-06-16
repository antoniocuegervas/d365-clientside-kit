# Control Configuration Reference — Metadata-Aware Controls

The form-designer mapping: each smart control needs `entity` + `attribute` +
a value `Observable`; everything else resolves from Dataverse metadata and
every resolved default can be overridden by a prop.

## Common to all Smart field controls (`ISmartFieldProps`)

| Param | Required | Resolves automatically when omitted |
|---|---|---|
| `entity` | ✔ | — |
| `attribute` | ✔ | — |
| `value` (Observable) | ✔ | — (host-owned; control writes changes into it and raises `onChange`) |
| `label` | | Attribute display name |
| `required` | | Attribute requirement level (Application/System required) |
| `disabled` / `readOnly` | | off |
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
user's decimal symbol / group separator from `context.getFormatting()` (G-06).
Extra:

| Prop | Purpose |
|---|---|
| `currencySymbol` | Force the money prefix — highest priority |
| `transactionCurrencyId` | Resolve the record's real currency symbol from `transactioncurrency` (G-06b); used when `currencySymbol` is omitted. Falls back to `$` |

### SmartDatePicker
Auto: date-only vs date-and-time from attribute format; localized calendar
strings (day/month names), first day of week, and short-date display format
from `context.getFormatting()` (G-06).

### SmartLookup
Auto: target entity (first metadata target), target's primary name/id
attributes; search-as-you-type with `contains` on the primary name.
Extra props:

| Prop | Purpose |
|---|---|
| `targetEntity` | Pick one target on Customer/Owner polymorphic lookups |
| `filter` | OData `$filter` clause ANDed into every inline search — the "one extra filter step" scenario; can change between renders (cascades) |
| `top` | Result count (default 10) |
| `searchDebounceMs` | Default 250; 0 for tests |
| `mode` | `"inline"` (default search box) or `"dialog"` (native CRM picker via lookupObjects, same value contract) — G-02 |
| `filterXml` | FetchXML `<filter>` for the dialog's view (dialog mode) |
| `viewId` / `viewName` | View-driven inline search — run a saved view as the source (G-03) |
| `showIcons` | Resolve + show the target entity's icon in results (G-10) |

**StandardLookupField** — standalone, dialog-only lookup (button → native picker,
no inline box, no attribute binding): `value`, `entityTypes`, `label`, `filters`
(per-entity FetchXML), `onChange`. Use for cross-entity pickers; prefer
`SmartLookup mode="dialog"` for attribute-bound lookups.

### SmartViewGrid
Auto: layout/columns from the savedquery's layoutxml, headers from attribute
display names, formatted cell values, type-aware lookup cells (clickable links
that openForm the target), row keys from the primary id. Data runs via
`?savedQuery={id}` (T-01) so quick find / filters / server sort layer on as
OData options.

| Prop | Purpose |
|---|---|
| `entity` (✔) | Table logical name |
| `viewId` | Saved view id; omitted = default grid view |
| `viewName` | Saved view by display name (resolved via getViewByName) |
| `quickFind` (Observable&lt;string&gt;) | Contains-search text, debounced; ANDed into the query |
| `quickFindFields` | Fields quick find searches (default: primary name) |
| `filters` (Observable) | Declarative eq/ne filters, re-queried server-side |
| `orderBy` (Observable) + `serverSort` | Server-side `$orderby`; header clicks update it |
| `pageSize` | Server-side paging (`$top` + nextLink) with a Pagination control |
| `overrideFetchXml` (Observable) | Host supplies the query; view supplies the layout |
| `refresh` (ObservableEvent) | Publish to re-run the query |
| `onRecordSelected(id, row)` / `selectedRecordId` | Single-select click + highlight |
| `onItemInvoked(id, row)` | Invoke (double-click/Enter); defaults to openForm |
| `multiSelect` + `selectedRecordIds` + `onSelectedRecords` | Multi-select checkboxes |
| `columnOverrides` | Dynamic/polymorphic columns (G-16): one column resolved from 2+ source fields, each with its own formatting; keyed by layout column or a synthetic `calc_*` key |
| `emptyMessage` | Empty-state text |

Note: link-entity (aliased / dotted) columns can't be filtered or sorted
through the savedQuery layer — those clauses are dropped (a platform boundary).

## What you should never hand-configure for standard fields

Option-value → label maps, decimal precision, currency placement, date
formats, lookup target resolution, label text, required asterisks. If you are
writing any of those for a standard attribute, use the smart control instead.
