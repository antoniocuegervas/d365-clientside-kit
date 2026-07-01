# Glossary

Five terms the rest of the docs lean on. These are the kit's own vocabulary, not
Dataverse terms: for entity, attribute, saved query, and the rest, use the
platform's own docs.

## Presentational control

A UI control that knows nothing about CRM. It takes plain values and Observables
in and raises events out, and never imports context, metadata, entity names, or
Xrm. It renders the native-parity look and nothing more. Because it is
CRM-agnostic it runs in Storybook with no mocks, and the boundary is enforced by
lint, not just convention. Examples: `TextField`, `DataGrid`, `NativeLookupField`.

## Smart control

A metadata-aware control that wraps a presentational one. Give it an `entity` and
an `attribute` (plus a value Observable) and it resolves the label, option set,
format, requirement, and lookup targets from Dataverse metadata through
`IViewModelContext`, then renders the presentational child with those resolved
props. This is the form-designer ergonomics: one line of JSX per field. Examples:
`SmartTextField`, `SmartOptionSet`, `SmartNativeLookup`.

## ViewModel

The object that owns an app's data and rules. It holds the Observables and runs
the queries and save logic, and it is the CRM-aware layer a View binds to. One
ViewModel per app, paired with a View. It reads like the form scripts D365
developers already maintain: open the ViewModel and all the data and rules are in
one place.

## Observable

The kit's host-owned value with change notification. The host (a ViewModel, a
smart control, or a PCF root) creates it and writes to it; presentational controls
subscribe and re-render when it changes. Values are meant to be replaced, not
edited in place: assign a new value or use `update`, because editing the held
object goes unnoticed (an `ObservableArray` covers the list case). See
[gotchas.md](gotchas.md) for the in-place-edit trap.

## observe

The method a View (an `ObserverComponent`) calls to subscribe to the Observables
its render reads, so the view re-renders when any of them changes:
`this.observe(vm.accountName, vm.saveMessage)`. This is the one contract that fails
silently: if the render reads an Observable that was not passed to `observe`, the
view simply will not update when that value changes, with no error. List every
Observable the render reads.
