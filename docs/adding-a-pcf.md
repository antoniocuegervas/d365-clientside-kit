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

Both patterns: `createRoot(container)` in `init`, render in `updateView`,
`root.unmount()` in `destroy`.

## 3. Build

```powershell
npm install
npm run build      # pcf-scripts build → out/controls
```

CI builds every `pcfs/*` project whenever `shared/` changes, so a shared
change that breaks a PCF fails fast.
