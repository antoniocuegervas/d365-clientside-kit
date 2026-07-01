# Component Catalog

When the requirement is satisfied by standard configuration, **use native
D365**. Reach for the kit when you're in a webresource or PCF, or the
data shape doesn't fit one native control. See the when-to-use table in the
[README](../README.md).

## Field controls per type

| Field type | Presentational (CRM-agnostic) | Smart (entity + attribute) |
|---|---|---|
| Single-line text | `TextField` | `SmartTextField` |
| Multiline text | `MultilineTextField` | `SmartTextField` (kind auto-detects memo) |
| Option set | `OptionSetField` | `SmartOptionSet` |
| Multi-select option set | `MultiSelectOptionSetField` | `SmartMultiSelectOptionSet` |
| Lookup (single) | `LookupField` | `SmartLookup` |
| Lookup (single, native-style) | `NativeLookupField` | `SmartNativeLookup` |
| Lookup (multi) | `MultiLookupField` | (ViewModel supplies results) |
| Date / date-time | `DateTimeField` | `SmartDatePicker` |
| Whole / decimal / float | `NumberField` | `SmartNumberField` |
| Currency | `CurrencyField` | `SmartNumberField` (money kind) |
| Boolean (two options) | `BooleanField` | `SmartBooleanField` |
| Rich text | deferred (see internal/decisions.md) | n/a |

Two single-record lookups, by intent: `SmartLookup` is the simpler combobox
(often the better data-entry experience), `SmartNativeLookup` replicates the
native model-driven lookup's look and feel (the inline flyout with two-line rows
and chevron-expand) for when muscle-memory parity is the point. Both share the
same value contract and default their search to the entity's lookup view.
If you are unsure which to pick, start with `SmartLookup`; reach for
`SmartNativeLookup` only when matching the native lookup's exact look and feel
is itself the requirement.

## Beyond fields, controls that bypass native limitations

| Control | Tier | Native limitation it bypasses |
|---|---|---|
| `DataGrid` | Presentational | Displays ANY supplied rows, merged queries, computed joins, multi-entity lists |
| `SmartViewGrid` | Smart | A saved view inside a webresource, from one `viewId` (or the default view) |
| `SelectionTree` | Presentational | Hierarchical multi-select |
| `Stepper` | Presentational | Multi-step gated input; `WizardViewModel` owns the sequence, gating, in-memory draft, and commit |
| `PersonaList` | Presentational | Custom people layouts |
| `SearchBar` | Presentational | Search UX; host runs the query |
| `WaitingMessage` | Presentational | The kit's single loading presentation |
| `RecordReady` | Component (CRM-aware) | Form-embedded apps that need the saved record id |

## Choosing a tier

1. **Standard field, webresource or PCF** → Smart control. One line of JSX.
2. **Standard look, custom data** (merge, union, normalization) → ViewModel
   fetch + presentational control. The grid never knows.
3. **Custom interaction on a standard pattern** (extra filter step, dynamic
   option pruning) → Smart control's override props (`filter`,
   `filterOptions`, `onChange`), before writing a ViewModel pipeline.

Presentational controls accept `T | Observable<T>` for display inputs (the data
grid also takes an `ObservableArray` for its rows) and require host-owned
`Observable`s for values, both the options list and the selected value belong to
the host (exemplar contract).
