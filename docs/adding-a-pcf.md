# Adding a PCF

Each PCF is its own npm package under `pcfs/` (a pcf-scripts requirement),
importing `shared/` **as source** via relative paths, no publishing step.

## 1. Scaffold

```powershell
cd pcfs
pac pcf init --namespace D365Kit --name MyControl --template field --run-npm-install false
```

Then align the project with the kit toolchain (copy from `pcfs/KitOptionSet`):

- `package.json`: add `react@18.3.1`, `react-dom@18.3.1`,
  `@fluentui/react-components`, pin `typescript` to the repo version,
  add `@types/react`/`@types/react-dom`.
- `tsconfig.json` `compilerOptions`: `"jsx": "react-jsx"`,
  `"esModuleInterop": true`, `"skipLibCheck": true`.
- v1 PCFs **bundle their own React/Fluent**, do not use `--framework react`
  (platform libraries are a future optimization, see internal/decisions.md).

## 2. Pick the integration pattern

**Pattern 1, presentational via PCF root** (see `pcfs/KitOptionSet`): the
root owns Observables, maps PCF parameters into them on every `updateView`,
renders a CRM-agnostic control, and pushes changes out via
`notifyOutputChanged` + `getOutputs`.

**Pattern 2, smart + provider** (see `pcfs/KitTooltip`): the root creates one
`PCFContext` in `init`, wraps the tree in `ViewModelContextProvider`, and a
`SmartComponent` child uses the same `IViewModelContext` contract as
webresources (metadata, Web API, navigation).

**Pattern 3, smart via root** (see `pcfs/KitDatePicker`): the middle ground. The
root reads host facts from the PCF `context` (here date-vs-datetime and the locale
formatter) and drives a CRM-agnostic presentational control. Like Pattern 1 the
root owns the Observables, but it pulls metadata/format from `context` without a
provider or a `SmartComponent`. Default to the smart control (Pattern 2); reach
for Pattern 3 only when you want customization niche enough that the smart
control's default behavior gets in your way, or that goes beyond what a reasonable
extension prop would cover. Uncommon, but a real case.

All three patterns: `createRoot(container)` in `init`, render in `updateView`,
`root.unmount()` in `destroy`.

## 3. Build

```powershell
npm install
npm run build      # pcf-scripts build → out/controls
```

CI builds every `pcfs/*` project whenever `shared/` changes, so a shared
change that breaks a PCF fails fast.

## 4. Deploy

A small control pushes straight to a dev org with
`pac pcf push --publisher-prefix <prefix without trailing underscore, e.g. new>` (the `kit.config.json` `publisherPrefix`
without the trailing underscore, see the prefix section below) as a debug build. A control that bundles
heavy Fluent v9 (`Popover`, `Avatar`, the native lookup, the grid) cannot: its
debug bundle exceeds the 5 MB webresource ceiling and `pac pcf push` has no
production switch. Deploy those through a solution wrapper, `pac solution init`
plus `pac solution add-reference` once, then:

```powershell
dotnet build -c Release -p:SolutionPackageType=Unmanaged
pac solution import --force-overwrite --publish-changes
```

Either path, **bump the manifest `<control version>` on every redeploy** or the
platform keeps serving the cached old bundle (the import succeeds and publishes,
but the form runs the previous build). The bar for a form control is "renders on a
deployed form", not "compiles", see [gotchas.md](gotchas.md) and
internal/decisions.md.

## Deployed name and the publisher prefix

A PCF's manifest `namespace` (here `D365Kit`) is its stable identity and never
changes. The publisher prefix is applied at push/import time, not in the manifest:
`pac pcf push --publisher-prefix new` registers the control as
`new_D365Kit.KitOptionSet`. So the repo shows `D365Kit` while an org shows
`<prefix>_D365Kit`, that is expected, not a mismatch. Drive the prefix from the same
`kit.config.json` the webresources use (pass its `publisherPrefix` without the
trailing underscore to `--publisher-prefix`) so one value names everything. The
manifest itself stays untouched, which matters if you bring your own PCFs: nothing in
their manifests changes.
