# Sample PCFs

Every control here is a **virtual control**: the platform supplies its own React
and Fluent v9 at runtime, so the bundles carry neither and there is no per-wave
Fluent re-pin to maintain. The manifests declare the platform libraries at the
supported ceiling and the org serves its current copies (`platform-floor.json`
is the single source for those numbers, and `npm run verify` enforces it). The
one exception is `KitDatePicker`: the date/time picker compat packages are not
part of the platform Fluent library, so that control alone bundles them with
the pinned tabster chain the floor checker demands.

Two are production-grade controls that deploy to and run on a real form:

- **`KitCounterpartyGrid`**, the flagship: a cross-type activity dataset control
  bound to the Account form's Activities subgrid (synthesized Counterparty and
  Role columns no native activitypointer-bound view can express).
- **`KitNativeLookup`**, a field-bound `Lookup.Simple` control that renders the
  kit's native-parity lookup (`SmartNativeLookup`) through `PCFContext` +
  `ViewModelContextProvider`, the same data path as the webresource. The host
  entity comes from `contextInfo`; the bound column logical name is a maker-supplied
  `attribute` property (a field PCF cannot read its own attribute name).

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

The full list is in [../docs/gotchas.md](../docs/gotchas.md); these bite PCF
authors specifically, read them before deploying a control:

- [Bundled Fluent v9 vs the host's shared tabster](../docs/gotchas.md#a-pcf-that-bundles-fluent-v9-pins-to-the-hosts-shared-tabster):
  only relevant if a control bundles Fluent or the compat packages (here, just
  `KitDatePicker`): pin the tabster chain, or a version newer than the host's
  blanks the control.
- [Bump the manifest version on every redeploy](../docs/gotchas.md#a-pcf-redeploy-needs-a-manifest-version-bump-or-the-platform-serves-the-old-bundle):
  reimporting with the same `<control version>` succeeds but the form keeps the
  cached old bundle.
- [A Fluent v9 popover needs inline rendering](../docs/gotchas.md#a-fluent-v9-popover-in-a-pcf-needs-inline-rendering-or-its-background-is-transparent):
  the default portal mounts outside the themed provider, so a token-based
  background renders transparent; render the surface inline.
- [Web API routing differs on PCF](../docs/gotchas.md#web-api-which-call-routes-where):
  `execute`/`executeMultiple` are emulated over the cds-client (no native execute
  on the PCF host), and CRUD-through-execute is rejected, use the dedicated
  create/update/delete methods.
- [No form context on PCF](../docs/gotchas.md#formcontext-is-the-full-mirror-formaccess-is-a-small-shortcut):
  `context.formContext` and `formAccess` are undefined; a field PCF reads the
  hosting table from `contextInfo` instead.
