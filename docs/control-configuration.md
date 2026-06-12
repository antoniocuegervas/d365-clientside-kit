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
Auto: precision (0 for whole numbers), min/max bounds, money detection.
Extra: `currencySymbol` (metadata does not carry the record's transaction
currency in v1 — defaults to `$`).

### SmartDatePicker
Auto: date-only vs date-and-time from attribute format; locale display format.

### SmartLookup
Auto: target entity (first metadata target), target's primary name/id
attributes; search-as-you-type with `contains` on the primary name.
Extra props:

| Prop | Purpose |
|---|---|
| `targetEntity` | Pick one target on Customer/Owner polymorphic lookups |
| `filter` | OData `$filter` clause ANDed into every search — the "one extra filter step" scenario; can change between renders (cascades) |
| `top` | Result count (default 10) |
| `searchDebounceMs` | Default 250; 0 for tests |

### SmartViewGrid
Auto: view FetchXML + columns from the savedquery's layoutxml, column headers
from attribute display names, formatted cell values, row keys from the
primary id.

| Prop | Purpose |
|---|---|
| `entity` (✔) | Table logical name |
| `viewId` | Saved view id; omitted = the entity's default grid view |
| `refresh` (ObservableEvent) | Publish to re-run the query — code-level refresh |
| `onRecordSelected(id, row)` | Row click |
| `selectedRecordId` (Observable) | Host-owned selection highlight |
| `emptyMessage` | Empty-state text |

## What you should never hand-configure for standard fields

Option-value → label maps, decimal precision, currency placement, date
formats, lookup target resolution, label text, required asterisks. If you are
writing any of those for a standard attribute, use the smart control instead.
