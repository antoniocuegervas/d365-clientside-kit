# Adding a PCF

Each PCF is its own npm package under `pcfs/` (a pcf-scripts requirement),
importing `shared/` **as source** via relative paths, no publishing step.

## 1. Scaffold

```powershell
cd pcfs
pac pcf init --namespace D365Kit --name MyControl --template field --framework react --run-npm-install false
```

Then align the project with the kit toolchain (copy from `pcfs/KitOptionSet`):

- Kit PCFs are **virtual controls**: the platform hands them the host's own React
  and Fluent at runtime, so the manifest declares the shared `platform-library`
  versions and the bundle carries neither. The floor values live in
  `pcfs/platform-floor.json`, and `npm run verify` fails until a new PCF matches
  them (manifest declarations, React and Fluent in devDependencies only at the
  floor versions, `pcfReactPlatformLibraries` on in featureconfig.json).
- `package.json`: React, react-dom, and `@fluentui/react-components` go in
  devDependencies at the floor versions; pin `typescript` to the repo version;
  `@fluentui/react-icons` stays a real dependency if the control renders icons
  (it is not a platform library).
- `tsconfig.json` `compilerOptions`: `"jsx": "react"`, `"esModuleInterop": true`,
  `"skipLibCheck": true`, plus `baseUrl`/`paths` mapping `react`, `react-dom`,
  and `@fluentui/react-components` to the project's own node_modules, so shared
  source compiles against the floor types instead of the repo root's.

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

All three patterns: implement `ComponentFramework.ReactControl`, keep context
wiring in `init`, RETURN the element from `updateView` (the platform owns the
React root, so there is no createRoot and nothing to unmount in `destroy`).

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
