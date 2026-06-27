# Sample PCFs

`KitCounterpartyGrid` is the production sample: a cross-type activity dataset
control bound to the Account form's Activities subgrid, the kit's flagship PCF
(synthesized Counterparty and Role columns no native activitypointer-bound view
can express).

The other three are minimal reference controls, one per authoring pattern in
[../docs/adding-a-pcf.md](../docs/adding-a-pcf.md). They are intentionally small,
each exists to show one wiring pattern end to end:

- **`KitOptionSet`**, Pattern 1 (presentational via root): the root owns the
  Observables, maps PCF parameters into them, and renders a CRM-agnostic control.
  No kit context.
- **`KitTooltip`**, Pattern 2 (smart + provider): the root wraps the context in
  `ViewModelContextProvider` and a `SmartComponent` child resolves attribute
  metadata through the same `IViewModelContext` contract webresources use.
- **`KitDatePicker`**, Pattern 3 (smart via root): the root resolves locale and
  format facts from the PCF context, then drives a presentational control, without
  a provider.

Each PCF is its own npm package (a pcf-scripts requirement) and imports `shared/`
as source. See the doc for the scaffold and build steps.

## Before you ship: PCF gotchas

The full list is in [../docs/gotchas.md](../docs/gotchas.md); these three bite PCF
authors specifically, read them before deploying a control:

- [Bundled Fluent v9 vs the host's shared tabster](../docs/gotchas.md#a-pcf-that-bundles-fluent-v9-pins-to-the-hosts-shared-tabster):
  pin the tabster chain, or a version newer than the host's blanks the control.
- [Web API routing differs on PCF](../docs/gotchas.md#web-api-which-call-routes-where):
  `execute`/`executeMultiple` are emulated over the cds-client (no native execute
  on the PCF host), and CRUD-through-execute is rejected, use the dedicated
  create/update/delete methods.
- [No form context on PCF](../docs/gotchas.md#formcontext-is-the-full-mirror-formaccess-is-a-small-shortcut):
  `context.formContext` and `formAccess` are undefined; a field PCF reads the
  hosting table from `contextInfo` instead.
