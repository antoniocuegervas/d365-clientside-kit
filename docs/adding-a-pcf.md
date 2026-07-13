# Adding a PCF

Each PCF is its own npm package under `pcfs/` (a pcf-scripts requirement),
importing `shared/` **as source** via relative paths, no publishing step.

## 0. Prerequisites

Beyond the repo's Node toolchain, the PCF path needs:

- The **Power Platform CLI** (`pac`). Install it from
  [Microsoft's install page](https://learn.microsoft.com/power-platform/developer/cli/introduction)
  (MSI, .NET tool, or the VS Code extension); `pac help` confirms it works.
- An **authenticated profile against your target environment** before any
  deploy command will run:

  ```powershell
  pac auth create --environment https://yourorg.crm.dynamics.com
  ```

  `pac auth list` shows profiles; `pac auth select` switches between them.
- The **.NET SDK** (any current LTS), only for the solution-wrapper path
  (`dotnet build` on the deploy wrapper). `pac pcf push` alone does not need it.

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

**Pattern 1, presentational via PCF root** (see
`pcfs/KitOptionSet/KitOptionSet/pattern1-reference`): the root owns
Observables, maps PCF parameters into them on every `updateView`, renders a
CRM-agnostic control, and pushes changes out via `notifyOutputChanged` +
`getOutputs`. Reach for it only when the parameter values carry no language:
option and boolean labels arrive from the bound parameter in whatever
language the host hands over, so a choice column belongs to Pattern 2, where
the labels resolve from metadata in the user's language. `pcfs/KitOptionSet`
started as this pattern and graduated for exactly that reason; its retired
Pattern 1 root is kept verbatim one folder beside the live Pattern 2 root
(`pcfs/KitOptionSet/KitOptionSet/pattern1-reference/index.ts`, compiled by
the project but imported by nothing, so it never ships in the bundle) and
the two patterns compare side by side.

**Pattern 2, smart + provider** (see `pcfs/KitTooltip` and `pcfs/KitOptionSet`):
the root creates one `PCFContext` in `init`, wraps the tree in
`ViewModelContextProvider`, and a `SmartComponent` child uses the same
`IViewModelContext` contract as webresources (metadata, Web API, navigation).
The option set shows the field-bound shape: the smart control resolves the
labels from metadata in the user's language, and the bound parameter's own
option list stays the allowed set (an option the host does not offer is never
presented).

**Pattern 3, smart via root** (see `pcfs/KitDatePicker`): the middle ground. The
root reads host facts from the PCF `context` (here date-vs-datetime and the locale
formatter) and drives a CRM-agnostic presentational control. Like Pattern 1 the
root owns the Observables, but it pulls metadata/format from `context` without a
provider or a `SmartComponent`. Default to the smart control (Pattern 2); reach
for Pattern 3 only when you want customization niche enough that the smart
control's default behavior gets in your way, or that goes beyond what a reasonable
extension prop would cover. Uncommon, but a real case.

The short decision table:

| You are binding… | Pattern | Copy from |
|---|---|---|
| A standard column where the kit smart control already does what you want | 2 (smart + provider), the default | `pcfs/KitTooltip`, `pcfs/KitOptionSet`, `pcfs/KitNativeLookup` |
| A column whose parameter values carry no language (plain text, numbers) and the parameter supplies everything | 1 (presentational via root) | `pcfs/KitOptionSet/KitOptionSet/pattern1-reference` |
| A standard column, but you need host facts the smart control's props do not cover | 3 (smart via root) | `pcfs/KitDatePicker` |
| A dataset (subgrid) | 2 with the dataset as input | `pcfs/KitCounterpartyGrid` |

All three patterns: implement `ComponentFramework.ReactControl`, keep context
wiring in `init`, RETURN the element from `updateView` (the platform owns the
React root, so there is no createRoot and nothing to unmount in `destroy`).
Wrap the tree in a `FluentProvider` built from `pcfProviderProps(context)`
(`shared/theme/d365Theme.ts`): besides the theme it carries the full-width
style every virtual root needs, because the platform mounts the control in a
flex container where a plain div shrinks to its content and the field renders
narrower than the native ones beside it.

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
without the trailing underscore, see the prefix section below) as a debug build. A control whose
debug bundle exceeds the 5 MB webresource ceiling cannot (`pac pcf push` has
no production switch); deploy those through a solution wrapper. The kit's own
five controls already have a committed wrapper, `deployment/solution` (it also
stages the shell webresources; see deployment.md), so for THEM use that. For
your own control set the wrapper is a one-time setup. Worked example, start to
finish, run from a NEW folder outside the PCF projects (for example
`pcfs/_myDeploy/`, the underscore keeps the floor checker and CI out of it;
scratch wrappers under `pcfs/_*` stay untracked):

```powershell
mkdir pcfs/_myDeploy; cd pcfs/_myDeploy
pac solution init --publisher-name YourPublisher --publisher-prefix new
pac solution add-reference --path ../KitNativeLookup
dotnet build -c Release -p:SolutionPackageType=Unmanaged
pac solution import --path bin/Release/_myDeploy.zip --force-overwrite --publish-changes
```

`--publisher-name` is the publisher's unique name in your org (Settings →
Solutions shows it), `--publisher-prefix` is the same prefix everything else
uses, WITHOUT the trailing underscore. One wrapper can `add-reference`
several controls; `dotnet build` compiles each referenced control in Release
and packs the zip.

That scaffolded wrapper pins an old 1.x SolutionPackager, fine for controls and
webresources. If your solution ever grows to carry another component type (an AI
Builder prompt, say), bump its `Microsoft.PowerApps.MSBuild.Solution` reference
to 2.x first, or the 1.x packer silently drops what it does not recognize (see
[deployment.md](deployment.md), the ALM chapter).

### Bind it in the form designer

After the import, the control still has to be placed on a form. In the maker
portal (make.powerapps.com):

1. Open the table → Forms → your form.
2. Select the column on the form (or add it first), then in the right pane
   choose **Components → + Component** and pick the control. It appears under
   the display name from its manifest; the underlying registered name is
   `<prefix>_<namespace>.<constructor>` (for example `new_D365Kit.KitNativeLookup`).
3. Fill the control's input properties in the same pane. For the kit controls
   the defaults are enough (KitNativeLookup reads the bound column's logical
   name from the platform; its `attribute` property is only a manual override).
4. Set which form factors show the control (web, tablet, phone), **Save**, and
   **Publish**.
5. Hard-refresh the app (Ctrl+Shift+R). If the form still shows the old state,
   the client cached the form definition: see the IndexedDB note in
   [gotchas.md](gotchas.md).

Either deploy path, **bump the manifest `<control version>` on every redeploy** or the
platform keeps serving the cached old bundle (the import succeeds and publishes,
but the form runs the previous build). The bar for a form control is "renders on a
deployed form", not "compiles": a PCF change that only compiled is not done,
because most of this list (cache, binding, platform libraries) only bites on
the real form. See [gotchas.md](gotchas.md).

Two import sharp edges worth knowing before they bite: the manifest
`display-name-key` and `description-key` attributes must not contain an
apostrophe (the import XSD rejects the solution with a `noAposStringType`
pattern error), and `pac solution import` can exit 0 on a FAILED import, so a
scripted deploy must check the output text for `Error:` rather than trusting
the exit code.

## Deployed name and the publisher prefix

A PCF's manifest `namespace` (here `D365Kit`) is its stable identity and never
changes. The publisher prefix is applied at push/import time, not in the manifest:
`pac pcf push --publisher-prefix new` registers the control as
`new_D365Kit.KitOptionSet`. So the repo shows `D365Kit` while an org shows
`<prefix>_D365Kit`, that is expected, not a mismatch.

One hard consequence, learned from a live import rejection: the
`namespace.constructor` pair is the control's org-wide identity ACROSS
publishers. Two publishers cannot both register `D365Kit.KitOptionSet`; the
platform refuses the second with "already created by another publisher". The
prefix decorates the registered name, it does not create a second identity,
so a fork whose controls must coexist in one org with another deployment of
the kit needs its own manifest namespace, not just its own publisher. Drive the prefix from the same
`kit.config.json` the webresources use (pass its `publisherPrefix` without the
trailing underscore to `--publisher-prefix`) so one value names everything. The
manifest itself stays untouched, which matters if you bring your own PCFs: nothing in
their manifests changes.

The whole naming chain from one value, worked:

```text
kit.config.json  publisherPrefix: "new_"
  → webresources        new_clientui.html / new_clientui.js   (deploy.ps1 renders the underscore form)
  → pac pcf push        --publisher-prefix new                (NO trailing underscore)
  → registered control  new_D365Kit.KitOptionSet              (prefix_namespace.constructor)
```
