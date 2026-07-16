---
name: d365kit-build-and-env
description: "Recreates the D365 kit working environment from scratch and explains every toolchain pin: load when setting up a fresh machine, installs fail or EPERM, node or npm versions mismatch the engines pin, npm ci versus npm install is unclear, the verify gate errors on toolchain grounds, or when building PCFs or the solution zip for the first time."
---

# Build and environment: bare machine to green verify

This skill recreates the working environment for the D365 Client-Side UI Kit.
It covers the toolchain pins and their reasons, the verify gate step by step,
PCF and .NET builds, and the known traps.

## Jargon, defined once

| Term | Meaning here |
|---|---|
| Verify gate | `npm run verify`, the repo's one local quality gate: seven chained steps (below) |
| Webresource | A JS/HTML file hosted inside Dynamics 365; the kit ships a shell (`clientui/`) and a hooks bundle (`clienthooks/`) |
| PCF | PowerApps Component Framework control; each `pcfs/Kit*` folder is its own npm project built by `pcf-scripts` |
| Virtual control | A PCF that receives React and Fluent from the platform at runtime instead of bundling them; every kit PCF is one |
| Solution zip | The importable Dataverse artifact; `deployment/solution` packs the five PCFs plus the shell webresources into a managed zip |
| Publisher prefix | The `new_`-style string prepended to component names; single source: `kit.config.json` at the repo root |
| SPKL | spkl.exe, the webresource deploy tool used by `deployment/deploy.ps1` (org-touching; see `d365kit-run-and-operate`) |
| pac | Microsoft Power Platform CLI (org-touching; see `d365kit-run-and-operate`) |

## From nothing to green (the runbook)

### Step 1: Node 24 and npm 11

The pins:

- `.nvmrc` contains exactly `24`.
- `package.json` `engines`: `"node": ">=24 <25"`, `"npm": ">=11 <12"`.
- The npm 11 line ships with Node 24, so installing Node 24 normally
  satisfies both pins.

On Windows, any of these gets you there:

```powershell
# Option A: nvm-windows
nvm install 24
nvm use 24

# Option B: fnm (reads .nvmrc when run inside the repo)
fnm install 24
fnm use 24

# Option C: the plain Node 24 installer from nodejs.org
```

Check with:

```powershell
node -v    # expect v24.x
npm -v     # expect 11.x
```

A note on the pin's enforcement: `.npmrc` sets `save-exact=true` (a later
`npm install <pkg>` saves an exact version, never a caret, so the tested tree
cannot drift) and deliberately does NOT set `engine-strict`. A wrong Node
therefore WARNS instead of failing. Do not push through the warning; fix the
version, the toolchain is only tested on the pinned line.

### Step 2: install dependencies with npm install, not npm ci

```powershell
npm install
```

The story behind `install` versus `ci`, because it looks backwards for a repo
with a committed lockfile: `package-lock.json` is generated on Windows and
omits the Linux-only native binding subtree (and its `@emnapi/runtime` peer).
Strict `npm ci` rejects that gap on Linux runners. The getting-started docs
standardized on `npm install`, and the comment in
`.github/workflows/storybook.yml` records the reason next to the only CI that
actually runs. Locally, `npm install` reconciles against the lockfile, and the
README's getting-started block states there is "nothing to commit afterwards".
If `git status` shows a `package-lock.json` diff after a plain install,
something IS wrong: stop and diagnose before committing anything.

On Windows, the lockfile's own platform, `npm ci` also works and is
byte-deterministic; `npm install` is the cross-platform guidance. When in
doubt, `npm install`.

Windows precondition: if a Storybook dev server is running, STOP it before
installing. See the EPERM trap below.

### Step 3: run the gate

```powershell
npm run verify
```

Run it bare, no pipes (trap explained below). First run takes several
minutes; the Storybook build at the end is the slow step. Green means the
machine is fully set up for kit work. Day-1 alternative before the full gate:
`npm run storybook` and browse the controls on fixture data, no org needed.

## The verify gate, step by step

`package.json` defines:

```
"verify": "npm run check:pcf-floor && npm run lint && npm run typecheck && npm run build && npm run test && npm run smoke && npm run build-storybook"
```

The `&&` chain stops at the first failure, so the failing step is the last
one that printed output before npm's error trailer.

| # | Step | Actual command | What it proves | Typical failure smell |
|---|---|---|---|---|
| 1 | `check:pcf-floor` | `node scripts/check-pcf-floor.mjs` | Every PCF keeps the virtual-control setup (details below) | `PCF platform-floor check FAILED:` plus a bullet per violation naming the PCF and the drifted value |
| 2 | `lint` | `eslint .` | House rules plus the presentational purity rule | `no-restricted-imports` errors under `shared/controls/presentational` or `shared/components/presentational`: a CRM import leaked into the CRM-agnostic tier |
| 3 | `typecheck` | `tsc --noEmit` | Types repo-wide; the ONLY type gate, because webpack builds are transpile-only | TS errors in files that step 4 would happily bundle |
| 4 | `build` | `webpack --mode production` | Both deliverable bundles compile and emit | Module-not-found; or a `kit.config.json` read failure (webpack reads it for the prefix) |
| 5 | `test` | `jest --testPathIgnorePatterns tests/smoke` | Unit behavior in jsdom, `tests/` roots | Red tests; missing jest types usually mean a broken install (see traps) |
| 6 | `smoke` | `jest tests/smoke` | The PRODUCTION bundles from `dist/` boot in jsdom on modern AND legacy Xrm mocks | `Bundle not found at ... run 'npm run build' before 'npm run smoke'` when `dist/` is missing or stale |
| 7 | `build-storybook` | `storybook build` | Every story compiles against fixture data | Vite build errors in `tests/storybook/**` |

Step details worth knowing cold:

- **check:pcf-floor** (`scripts/check-pcf-floor.mjs`) validates every
  `pcfs/*` project against `pcfs/platform-floor.json` (virtual posture,
  declared platform-library versions, dev-only React and Fluent at the
  floors, compat/tabster pinning, exact versions) and scans `shared/` for
  React-18-only APIs. The check-by-check enumeration is homed in
  `d365kit-config-and-versioning` (axis 2). Folders named `pcfs/_*` are
  skipped by design (local deploy wrappers, see `d365kit-run-and-operate`).
- **lint** uses ESLint 9 flat config (`eslint.config.mjs`). `pcfs/**` and
  `deployment/**` are excluded (`pac pcf init` projects carry their own
  generated lint wiring; do not fight it). The presentational purity rule
  is enforcement, not convention: `no-restricted-imports` bans
  `**/context/**`, `**/metadata/**`, `**/data/**`, `**/queries/**`,
  `**/LibraryUtils*`, and `**/controls/smart/**` from the presentational
  folders, and `no-restricted-globals` bans `Xrm` there.
- **typecheck** exists as its own step because the webpack build uses
  `ts-loader` with `transpileOnly: true`: builds stay fast, type errors
  surface in exactly one place. A change can BUILD and still fail the gate
  here; that is by design.
- **build** (`webpack.config.mjs`) emits two bundles. Entry
  `clientui/index.ts` becomes `dist/clientui/<prefix>clientui.js` plus
  `<prefix>clientui.html` (HtmlWebpackPlugin stamps the script URL with a
  compilation-hash cache-buster; the file NAME stays stable on purpose so a
  debug-proxy replace rule keeps matching). Entry `clienthooks/index.ts`
  becomes `dist/clienthooks/<prefix>clienthooks.js` as a UMD library named
  `CrmClientSide`. `<prefix>` is `publisherPrefix` from `kit.config.json`.
- **smoke** depends on step 4's output: it `require()`s the production bundle
  from `dist/` (the test resolves the file name through `kit.config.json`,
  so it follows your local prefix automatically). Running `npm run smoke` on
  a clean checkout without a build fails with an explicit message telling you
  to build first.

### The exit-code trap

Run verify bare and check the shell's own exit variable (`$LASTEXITCODE` in
PowerShell, `$?` in bash); piping it masks a red gate. The full trap and the
PowerShell-safe capture pattern are homed in `d365kit-validation-and-qa`
(section 2).

## Toolchain pins and why (do not "helpfully" upgrade)

All versions from `package.json`. The decision log records the choice behind
each; the short reasons:

| Pin | Value | Why |
|---|---|---|
| TypeScript | 5.9.3, not 6.x | `pcf-scripts` declares `typescript: "^4.0.0 \|\| ^5.0.0"` as a peer; the kit mandates ONE TS version repo-wide, so the root is constrained to the newest version inside the PCF range. Revisit when pcf-scripts accepts TS 6 |
| React | 18.3.1 exact | PCF ecosystem and Fluent v9 are proven on 18; the exact pin prevents drift between the shell bundle and anything else that resolves React |
| Jest + ts-jest | 29.7.0 + 29.4.11 | Known-good pairing; the test layer is infrastructure, not product |
| Storybook | with `@storybook/react-vite` | Storybook is dev-only, nothing it builds ships to CRM, so the Vite builder does not violate the "webpack produces the artifacts" contract |
| ts-loader | `transpileOnly: true` | Fast bundle builds; `tsc --noEmit` is the single type gate |
| Root ESLint scope | `pcfs/` excluded | PCF projects carry their own generated lint setup |
| Fluent | `@fluentui/react-components` current at the root; 9.61.0 API floor inside PCFs | The root shell bundles current Fluent; PCFs compile against the floor so they cannot use APIs an older org's platform Fluent does not serve |
| PCF React | 16.14.0 in PCF devDependencies | Matches the platform-provided React the manifests declare; devDependency only, never bundled |

Jest's CJS bridge (`jest.config.mjs`): the repo tsconfig targets bundlers
(`module: ESNext`, `moduleResolution: Bundler`), but Jest runs CommonJS, so
the ts-jest transform overrides ONLY the module plumbing (`module:
"CommonJS"`, `moduleResolution: "Node"`, `jsx: "react-jsx"`,
`esModuleInterop: true`) and keeps strictness from `tsconfig.json`. The
config also records that Fluent v9 and its griffel dependencies ship dual
CJS/ESM, so no `transformIgnorePatterns` surgery is needed; do not add any.

## PCF projects: five separate npm worlds

Each `pcfs/Kit*` (KitCounterpartyGrid, KitDatePicker, KitNativeLookup,
KitOptionSet, KitTooltip) is its own npm project on `pcf-scripts` with its
own committed `package-lock.json`, importing `shared/` as source. The root
install does NOT install them. First build of one:

```powershell
cd pcfs\KitOptionSet
npm install        # first time only in each PCF folder
npm run build      # pcf-scripts build, output in out/controls
```

Production discipline: a deployable bundle is a PRODUCTION build.

```powershell
npm run build -- --buildMode production
```

Debug bundles are nearly ten times larger and must never ship (also:
never `pac pcf push` for shipping, it pushes a debug bundle,
docs/deployment.md). The normal shipping path builds all five in Release
through the solution zip below, which makes production mode automatic.

What the committed CI yaml is WRITTEN to do (`azure-pipelines.yml`): the
Verify stage conditionally builds every PCF when `shared/`, `pcfs/`,
`package.json`, or `package-lock.json` changed (always on manual runs), and
inside each project it runs `npm ci` then
`npm run build -- --buildMode production` (`npm ci` is fine THERE because
each PCF's own lockfile installs consistently in that context). Reality
check: that pipeline is executable from the repo but connected to no service;
the only CI that actually runs is `.github/workflows/storybook.yml`
(Storybook build to GitHub Pages, on push to master). This is a recorded,
known gap (the decision log carries it).

## The .NET side: the solution zip

The importable managed solution builds from the repo alone, no org, no
secrets:

```powershell
npm run build                                  # webresource artifacts into dist/ first
dotnet build deployment/solution -c Release    # managed zip in deployment\solution\bin\Release\D365UIKit.zip
```

Mechanics:

- Needs a .NET SDK (a current LTS works; the docs pin no minimum). The build
  restores `Microsoft.PowerApps.MSBuild.Solution` via NuGet.
- A `RenderSolutionSrc` target runs `node render-src.mjs` before packaging:
  it stamps publisher and prefix from `kit.config.json` and the version from
  the root `package.json` into `src/Other/Solution.xml`, and stages the three
  shell webresources from `dist/` with deterministic name-derived (UUID v5)
  ids, so rebuilds keep component identity and an update upgrades a prior
  import. It fails with a clear message when `dist/` is missing: always
  `npm run build` first.
- `SolutionPackageType` defaults to `Managed`; pass
  `-p:SolutionPackageType=Unmanaged` for a dev-import variant.
- Do NOT "clean up" the empty `<WebResources />` node in the committed
  `deployment/solution/src/Other/Customizations.xml`. Without it,
  SolutionPackager silently packs no webresource metadata and the import
  creates nothing (found empirically; the decision log records it).
- `deployment/packages/` is gitignored and is a DIFFERENT restore: it holds
  spkl.exe and Microsoft.CrmSdk.CoreTools for the SPKL webresource deploy
  path (`deploy.ps1` documents `nuget install spkl -OutputDirectory
  deployment/packages`). The dotnet solution build does not use it.

Anything org-touching (`pac`, `spkl`, `deploy.ps1`) belongs to
`d365kit-run-and-operate`; be deliberate about which org you target.

## Environment inventory

| Tool | Required for | Check command |
|---|---|---|
| git | everything | `git --version` |
| Node 24 | all npm work | `node -v` |
| npm 11 | installs and scripts | `npm -v` |
| .NET SDK | solution zip only | `dotnet --list-sdks` |
| pac CLI | org import/push only | `Get-Command pac` |
| Fiddler Classic | webresource autoresponder loop (optional) | GUI app; see docs/deployment.md, "The Fiddler inner loop" |
| Dataverse org | live verification only | see `d365kit-run-and-operate` |

What an org-less machine CAN do: the entire verify gate, Storybook (local
and the static build), every PCF build including production mode, and even
the managed solution zip (it builds from the repo alone). What needs an org:
importing the zip, SPKL webresource deploys, `pac pcf push`, the Fiddler
inner loop (it replaces a bundle on a LIVE form), and any live-form
verification.

## Local file conventions

- `kit.config.json` ships committed with the `new_` example prefix. Set your
  own prefix locally; the full prefix discipline (including how to keep a
  private prefix out of a public fork's history) is in
  `d365kit-config-and-versioning` (axis 1).
- `pcfs/_*` folders are the naming convention for local, untracked deploy
  wrappers and scratch projects: the floor checker and the size report skip
  them by that prefix. Keep your own scratch wrappers under it.

## Known traps, each with recovery

| Trap | Symptom | Recovery |
|---|---|---|
| EPERM mid-install (Windows) | `npm install` dies with EPERM on `esbuild.exe`; a running Storybook dev server holds the file | STOP Storybook BEFORE reinstalling node_modules; then rerun `npm install`. A half-deleted tree fails later in confusing ways: missing jest types, or a wrong-version global eslint answering `npx eslint`. The fix for those is the same rerun, not chasing the downstream error |
| Stale Storybook cache | Storybook fails to start after a reinstall | `Remove-Item -Recurse -Force node_modules\.cache\storybook` then start again |
| Port 6006 taken | `npm run storybook` prompts interactively or fails to bind | `npm run storybook -- --port 6008 --ci` |
| Piped verify | Gate "passes" but a step actually failed | Run `npm run verify` bare; check `$LASTEXITCODE`; the failing step is the last one that printed |
| Smoke before build | `Bundle not found at ...dist...` | `npm run build` first; smoke loads the production bundles from `dist/` by design |
| npm warnings panic | Deprecation warnings and audit findings during install | Expected: they come from dev-time tooling only (jest and storybook transitives at the root, the pcf-scripts toolchain inside each `pcfs/*` project). Nothing from them ships in any bundle, and the state is reviewed each release (README, Getting started). Do not "fix" them ad hoc |
| npm ci on Linux | `npm ci` rejects the lockfile on a Linux runner | Use `npm install`; the lockfile is Windows-generated and omits the Linux-only native binding subtree (comment in `.github/workflows/storybook.yml`) |
| Wrong Node, install proceeds | Only a warning at install time (engine-strict is deliberately off, `.npmrc`) | Switch to Node 24 / npm 11 and reinstall; do not trust a tree installed on another major |

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| Deploying, importing the zip, SPKL, pac, Fiddler loop execution, live-org verification | `d365kit-run-and-operate` |
| `kit.config.json` semantics, publisher/prefix policy, version bumping | `d365kit-config-and-versioning` |
| A verify step fails for CODE reasons (red test, lint hit, type error) rather than toolchain reasons | `d365kit-debugging-playbook` |
| Understanding the three layers, MVVM, Observables, why no hooks | `d365kit-architecture-contract` |
| The QA methodology, what the gate does and does not prove | `d365kit-validation-and-qa` |
| Diagnostic scripts and measurement tooling | `d365kit-diagnostics-and-tooling` |
| Platform client-API facts (Xrm, PCF context, Web API) | `dataverse-clientside-reference` |
| Writing or editing docs | `d365kit-docs-and-writing` |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: `package.json`, `.nvmrc`, `.npmrc`, `webpack.config.mjs`,
`jest.config.mjs`, `eslint.config.mjs`, `tsconfig.json`,
`scripts/check-pcf-floor.mjs`, `pcfs/platform-floor.json`,
`azure-pipelines.yml`, `.github/workflows/storybook.yml`,
`deployment/solution/D365UIKit.cdsproj`, `deployment/solution/render-src.mjs`,
`deployment/deploy.ps1`, `README.md`, `CONTRIBUTING.md`, `docs/testing.md`,
`docs/deployment.md`, `docs/adding-a-pcf.md`, and the decision log.

Re-verification one-liners for everything that can drift:

```powershell
node -v; npm -v                                                        # installed toolchain
Get-Content .nvmrc                                                     # Node pin
(Get-Content package.json | ConvertFrom-Json).engines                  # engines pin
(Get-Content package.json | ConvertFrom-Json).scripts.verify           # gate order
(Get-Content package.json | ConvertFrom-Json).devDependencies          # TS/Jest/Storybook/eslint pins
Get-Content pcfs\platform-floor.json                                   # PCF floors and tabster pins
Select-String "pcf-scripts" pcfs\KitOptionSet\package.json             # PCF toolchain version
Get-ChildItem .github\workflows                                        # which CI actually exists
Select-String "npm ci" .github\workflows\storybook.yml                 # the lockfile story, in place
Select-String "buildMode production" azure-pipelines.yml               # PCF production discipline in CI yaml
Select-String "WebResources" deployment\solution\src\Other\Customizations.xml   # the load-bearing placeholder node
dotnet --list-sdks                                                     # .NET SDKs present
```
