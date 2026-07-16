---
name: d365kit-config-and-versioning
description: "Catalogs every configuration axis of the D365 client-side kit repo and its versioning policy: kit.config.json and the publisher prefix, pcfs/platform-floor.json and the floor checker, package.json version/engines/scripts, the five ControlManifest versions and the redeploy bump rule, the clientui app registry as the bundle-size lever, tsconfig/jest/eslint/webpack/npmrc/storybook configs, CI files and their reality, deployment templates and render rules, and the ?data= launch parameter (load when changing any configuration file, bumping any version, adding an app or control to a manifest, or wondering which file controls a behavior)."
---

# Configuration and versioning catalog

This is the drift-sensitive skill: every fact below was read from the working
tree at a point in time (last re-stamped 2026-07-15, v1.3.0). Before you rely
on any row, run its re-verification command from the Provenance block at the
bottom. If the output disagrees with this file, the repo wins; update this
file.

## The catalog at a glance

One row per axis.

| # | File(s) | What it controls | Committed state | Who changes it |
|---|---------|------------------|-----------------|----------------|
| 1 | `kit.config.json` | Publisher prefix naming every built artifact, deployed webresource, and packed solution component; optional solution/publisher identity | `{"publisherPrefix": "new_"}` (single key, the example value) | You, locally, to your own prefix (axis 1); contributions keep the committed example at `new_` |
| 2 | `pcfs/platform-floor.json` + `scripts/check-pcf-floor.mjs` | The virtual-control posture of all five PCFs: declared platform libraries, Fluent API floor, tabster pins | Declared React 16.14.0 / Fluent 9.46.2; reactDevVersion 16.14.0; fluentApiFloor 9.61.0; pins react-tabster 9.26.1 + tabster 8.5.5 | Engineer, with a decision-log entry and README update when raising the API floor |
| 3 | `pcfs/Kit*/featureconfig.json` | PCF build flags: react-dom externalization, custom webpack | All five: `pcfReactPlatformLibraries: "on"`; the controls with a webpack.config.js also set `pcfAllowCustomWebpack: "on"` | The floor checker requires the flag plus tabster pins plus webpack aliases whenever compat packages are bundled, and rejects tabster overrides without compat deps |
| 4 | `pcfs/Kit*/package.json` (+ per-control `webpack.config.js`) | Per-PCF dependency floors, tabster override pins, compat aliases; exact versions only | React/react-dom 16.14.0 and Fluent 9.61.0 in devDependencies; KitDatePicker alone carries compat deps + tabster overrides; project `"version"` stays the inert pac scaffold `1.0.0` in all five | Engineer, floor-checked; the checker rejects ranges, misplaced deps, and stray overrides |
| 5 | `package.json` (root) | Repo version (stamps the solution version), engines, the scripts table, the shell dependency set | version `1.3.0`; node `>=24 <25`, npm `>=11 <12` | Version: release time only (the versioning policy below). Scripts: decision-log entry if the gate changes |
| 6 | `pcfs/Kit*/Kit*/ControlManifest.Input.xml` (5 files) | Platform-facing control identity and version; the platform-library declarations | All five `version="1.3.0"`, namespace `D365Kit`, control-type `virtual`, platform-library React 16.14.0 + Fluent 9.46.2 | Any engineer deploying MUST bump; aligned to the kit release at release time |
| 7 | `clientui/apps/index.ts` | The app registry: one import line per app, THE bundle-size lever | 10 imports: template, samples-hub, 8 samples in 3 tiers | Any engineer adding an app; fork owners trim |
| 8 | `.nvmrc` | Node line for humans and the Pages workflow | `24` | With the engines field in lockstep |
| 9 | `tsconfig.json` | Single strict TS config for shared/clientui/clienthooks/tests/.storybook | ES2022, module ESNext, moduleResolution Bundler, jsx react-jsx, strict, noEmit; pcfs/ excluded; no paths aliases | Engineer, with a decision-log entry |
| 10 | `jest.config.mjs` | Test runner: jsdom, tests/ root, CJS module override for ts-jest | Overrides module CommonJS + moduleResolution Node only; strictness inherited from tsconfig | Engineer |
| 11 | `eslint.config.mjs` | Lint scope and the presentational purity rule (the enforcement mechanism, not code review) | Ignores pcfs/, deployment/, dist, coverage, storybook-static, solution/src; restricted imports + `Xrm` global banned under `shared/*/presentational/**` | Engineer; the purity rule scope only with a decision-log entry |
| 12 | `webpack.config.mjs` (+ `clientui/html/clientui.html`) | The two shipped bundles and their names (prefix-derived), the cache-busted HTML entry | Entries `clientui/index.ts` and `clienthooks/index.ts`; outputs `dist/clientui/<prefix>clientui.js` + `.html`, `dist/clienthooks/<prefix>clienthooks.js` (UMD global `CrmClientSide`); mode from CLI | Engineer, with a decision-log entry (the single-bundle shape is protected) |
| 13 | `.npmrc` | `save-exact=true`; deliberately NOT engine-strict | One directive | Rarely |
| 14 | `.storybook/main.ts` + `preview.tsx` | Storybook: react-vite framework, stories globs under tests/storybook, addon-docs, kit-theme decorator, sidebar order | No staticDirs configured | Engineer |
| 15 | `azure-pipelines.yml` | The documented 2-stage CI: Verify (ubuntu) then Package (windows, managed-solution artifact) | Triggers master, release/*, feature/*; PR master, release/* | File exists; connected to NO service (see axis 12 details) |
| 16 | `.github/workflows/storybook.yml` | The only live CI: Storybook build + GitHub Pages deploy on push to master | Uses `.nvmrc`; `npm install` not `npm ci` (Windows lockfile omits Linux natives) | Repo owner |
| 17 | `deployment/spkl.template.json` + `deployment/deploy.ps1` | Webresource deploy mapping; rendered to gitignored `deployment/spkl.json` with your prefix at deploy time | 3 webresources with `{{prefix}}`/`{{solution}}` placeholders; solutionName default `D365UIKit`; connection via `SPKL_CONNECTION` env or gitignored `connection.local.json` | Engineer adding a webresource (touch BOTH template and render-src.mjs, they mirror) |
| 18 | `deployment/solution/` (Solution.template.xml, render-src.mjs, D365UIKit.cdsproj, src/Other/Customizations.xml) | The managed solution build: publisher/prefix/version stamping, name-derived webresource ids, the 5 PCF references | See axis 13 details; Customizations.xml MUST keep its empty `<WebResources />` node | Release work; Customizations.xml frozen |
| 19 | `?app=` / `?data=` launch parameters (`shared/utils/LibraryUtils.ts`) | Runtime configuration: app selection and payload for the shell | `parseWebResourceParams`: `?app=` wins, else `data.app`; data may be JSON or plain string, possibly double-encoded | Code change under normal change control |
| 20 | `.gitignore` | What stays local: build outputs, rendered configs, secrets | dist/, coverage/, storybook-static/, rendered spkl.json and solution src halves, connection.local.json | Repo owner |

## Axis details

### 1. kit.config.json, the prefix axis

The file has ONE committed key: `{"publisherPrefix": "new_"}`. Every consumer
reads the same file, so artifact names, deployed webresource names, and packed
solution components can never drift from each other:

| Consumer | What it takes |
|----------|---------------|
| `webpack.config.mjs` | `publisherPrefix` names the built bundles and the HTML entry |
| `deployment/deploy.ps1` | `publisherPrefix` + optional `solutionName` (default `D365UIKit`) to render `spkl.json` |
| `deployment/solution/render-src.mjs` | `publisherPrefix` (validated against `^[A-Za-z][A-Za-z0-9]*_$`) + optional `solutionName` (default `D365UIKit`), `publisherName` (default: prefix without underscore), `optionValuePrefix` (default 10000, must be 10000..99999) |

The optional keys are NOT in the committed file; the defaults apply.

For your own use:

- Set your real publisher prefix locally; your builds then produce
  `<yourprefix>*` artifacts and the solution build stamps your publisher.
- In a private fork, committing your prefix is fine and normal.
- In a public fork where you want your working prefix out of the history,
  keep the committed value at the `new_` example and hide your local edit
  with git's skip-worktree bit: edit the prefix, then
  `git update-index --skip-worktree kit.config.json`. The diff disappears
  from `git status`; `git ls-files -v` shows `S kit.config.json`. Undo with
  `--no-skip-worktree`. If a git operation (branch switch, stash, rebase)
  refuses to proceed because of the hidden change, clear the bit, stash,
  redo it.
- Contributions to THIS repo keep the committed example at `new_`; do not
  include a real prefix in a PR.

### 2. platform-floor.json and the floor checker (first step of verify)

`pcfs/platform-floor.json` structure:

| Key | Value | Meaning |
|-----|-------|---------|
| `declaredPlatformLibraries` | React `16.14.0`, Fluent `9.46.2` | What every manifest must declare: the version the org must ACCEPT at import. Declare low, receive current (the runtime serves its own copies) |
| `reactDevVersion` | `16.14.0` | Required `react`/`react-dom` devDependency in every PCF |
| `fluentApiFloor` | `9.61.0` | Oldest Fluent the kit's code works against; every PCF compiles with exactly this version, so the compile IS the enforcement, no hand-kept API list |
| `fluentApiFloorReason` | SearchBox (the grid's search bar) first ships in 9.61.0 | Why the floor sits there |
| `compatTabsterPins` | `@fluentui/react-tabster` `9.26.1`, `tabster` `8.5.5` | Required overrides for any PCF that bundles a `@fluentui/*-compat` package |
| `comment`, `compatComment` | prose | The rationale, kept in the file itself |

`scripts/check-pcf-floor.mjs` enforces, per PCF (every `pcfs/` directory not
starting with `_` or `.` that contains a package.json):

1. `ControlManifest.Input.xml` exists at `pcfs/<Name>/<Name>/` and has `control-type="virtual"`.
2. The manifest declares EXACTLY the shared platform-library versions (React 16.14.0, Fluent 9.46.2).
3. No apostrophe in `display-name-key` or `description-key` (the import XSD's noAposStringType rejects it; local builds pass).
4. `featureconfig.json` sets `pcfReactPlatformLibraries` to `"on"` (react-dom only externalizes behind this flag).
5. `react`, `react-dom`, `@fluentui/react-components` must NOT be in `dependencies`.
6. devDependencies: `react` and `react-dom` exactly `16.14.0`; `@fluentui/react-components` exactly `9.61.0`.
7. If any `@fluentui/*-compat` dependency exists: `overrides` must carry both tabster pins, `webpack.config.js` must mention (alias) each compat package, and `featureconfig.json` must enable `pcfAllowCustomWebpack`. If NO compat dependency exists: no tabster overrides allowed at all.
8. Import-graph walk from the control's `index.ts` following relative imports (which is what reaches `shared/`), skipping type-only imports: any `@fluentui/*-compat` import must be declared in that PCF's dependencies (an undeclared one resolves from the repo root and bundles an unpinned tabster while everything stays green).
9. Every dependency and devDependency version exact (`^\d+\.\d+\.\d+$`), no ranges.

And repo-wide: every `.ts`/`.tsx` under `shared/` is scanned for
React-18-only APIs (`react-dom/client`, `createRoot`, `hydrateRoot`,
`useSyncExternalStore`, `useTransition`, `useDeferredValue`,
`startTransition`, `useId`, `flushSync`, `useInsertionEffect`); any hit fails.
The shell bundles React 18, the PCF host serves React 16/17, shared code runs
on both.

It enforces nothing else: it does not build, does not lint, does not touch
any org.

### 3. package.json: version, engines, scripts

- `version`: the release milestone marker (see the versioning policy below)
  AND the machine input that stamps the solution version via `render-src.mjs`.
- `engines`: node `>=24 <25`, npm `>=11 <12`. Advisory only: `.npmrc`
  deliberately does not set engine-strict.

Scripts, one line each:

| Script | Does |
|--------|------|
| `typecheck` | `tsc --noEmit`, the single type gate (builds are transpile-only) |
| `lint` | `eslint .` (flat config, pcfs/ excluded) |
| `build` | `webpack --mode production`, the deployable artifact shape |
| `build:dev` | `webpack --mode development` |
| `test` | `jest --testPathIgnorePatterns tests/smoke` (unit tests) |
| `coverage` | same as test plus `--coverage` (instrumented across all first-party sources) |
| `smoke` | `jest tests/smoke` (host-mock smoke against built bundles) |
| `storybook` | `storybook dev -p 6006` |
| `build-storybook` | `storybook build` (what the Pages workflow publishes) |
| `check:pcf-floor` | `node scripts/check-pcf-floor.mjs` |
| `verify` | `check:pcf-floor`, then lint, typecheck, build, test, smoke, build-storybook, chained with `&&` |

Run `npm install` first in a fresh workspace (the install-vs-ci story is
`d365kit-build-and-env`'s). Never pipe `npm run verify` through anything that
swallows its exit code; run it bare and check the shell's exit variable.

### 4. The five control manifests and the redeploy bump rule

Each is `<control namespace="D365Kit" ... control-type="virtual">`:

| Control | Notes |
|---------|-------|
| KitCounterpartyGrid | dataset control, WebAPI feature |
| KitDatePicker | Pattern 3 reference; bundles the date/time compat packages |
| KitNativeLookup | lookup type-group (Simple, Customer, Owner), optional attribute/viewName/showIcons inputs |
| KitOptionSet | Pattern 2 reference (smart via ViewModelContextProvider; labels from metadata) |
| KitTooltip | Pattern 2 reference |

Policy: control versions track the kit release (all five sit at the release
number at a release cut; between releases they take intermediate dev bumps as
they redeploy). The PCF project `package.json` `"version"` fields are inert
pac scaffolding and stay `1.0.0`; the manifest `<control version>` is the only
platform-facing number.

The operational rule (docs/gotchas.md, learned live): **every redeploy needs a
`<control version>` bump or the platform serves the stale cached bundle.**
Reimport with the same version succeeds and publishes, and the form keeps
running the old build, so a fix looks like it did not deploy. This is a hard
requirement in every environment, not a cache lag. The shell webresource
needs no rename: its HTML entry cache-busts the script URL with the
compilation hash.

Control identity is the UNPREFIXED `namespace.constructor`, org-global across
publishers (learned from a rejected import): a coexisting fork needs its own
manifest namespace, not just its own publisher.

### 5. The app registry: clientui/apps/index.ts

One import line per app; importing the module registers the app. An app the
manifest does not import is tree-shaken out of the bundle entirely, so the
import line is what makes an app exist. Current 10 imports, grouped:

- Shell + onboarding: `template`, `samples-hub`
- Everyday tier: `sample-company-search`, `sample-master-detail`
- Composition tier: `sample-opportunity-search`, `sample-territory-cascade`, `sample-new-account-wizard`
- Exotic-data tier: `sample-merged-grid`, `sample-activities-grid`, `sample-counterparty-grid`

This is THE bundle-size lever (deliberate: no code-splitting, one stable
artifact name). Recorded measurements: the full ten-app shell around 889 KB
production-minified, trimmed to template + samples hub about 425 KB, so the
sample apps cost roughly 474 KB. Add an app: one folder under
`clientui/apps/` plus one import line (docs/adding-a-webresource-app.md).
Trim a fork: delete import lines.

### 6. Engines and toolchain pins

| Pin | Where | Note |
|-----|-------|------|
| Node / npm | `.nvmrc` `24`; engines node `>=24 <25`, npm `>=11 <12` | advisory bound, `.npmrc` records why not strict |
| TypeScript | root devDependencies | newest inside pcf-scripts' `^4 \|\| ^5` peer range; TS 6 waits on pcf-scripts |
| React (shell) | `18.3.1` exact, dependencies | PCF ecosystem and Fluent v9 proven on 18; exact pin prevents drift |
| Jest / ts-jest / Storybook / webpack stack | root devDependencies | known-good pairings; dev-only, nothing ships to CRM |
| Fluent (shell) | `@fluentui/react-components` current at the root | the shell bundles its own Fluent; PCFs do not |
| PCF floors | `pcfs/platform-floor.json` | axis 2 |
| Xrm types | `@types/xrm` | the standard client API surface |

Three different Fluent numbers coexist on purpose; do not "align" them:
the root version is what the shell bundles, `9.61.0` is the PCF compile floor
(API floor), `9.46.2` is the manifest declaration (import-acceptance floor).

### 7. tsconfig.json and jest.config.mjs

tsconfig (single config, repo-wide): target `ES2022`, lib ES2022 + DOM +
DOM.Iterable, module `ESNext`, moduleResolution `Bundler`, jsx `react-jsx`,
`strict: true` plus noImplicitOverride, noFallthroughCasesInSwitch,
forceConsistentCasingInFileNames, esModuleInterop, skipLibCheck, noEmit,
resolveJsonModule; types xrm, jest, node, react, react-dom. Include: shared,
clientui, clienthooks, tests, .storybook. Exclude: node_modules, dist,
pcfs (they carry their own tsconfig), storybook-static. No paths aliases.

jest.config.mjs: jsdom environment, roots `tests/`, testMatch `*.test.ts(x)`,
passWithNoTests, coverage collected from shared/clientui/clienthooks minus
`.d.ts` and `generated/`. The ts-jest transform overrides ONLY the module
plumbing (module `CommonJS`, moduleResolution `Node`, jsx, esModuleInterop):
Jest runs CJS while the repo tsconfig targets bundlers; strictness stays
inherited from tsconfig.json. No transformIgnorePatterns needed (Fluent ships
dual CJS/ESM).

### 8. eslint.config.mjs

- Ignores: `node_modules/**`, `**/dist/**`, `**/solution/src/**`,
  `coverage/**`, `storybook-static/**`, `pcfs/**` (pac-generated projects
  carry their own lint), `deployment/**`.
- Base: typescript-eslint recommended, plus no-unused-vars as error with `^_`
  ignore patterns.
- The presentational purity rule, scoped to
  `shared/controls/presentational/**` and `shared/components/presentational/**`:
  `no-restricted-imports` bans `**/context/**`, `**/metadata/**`, `**/data/**`,
  `**/queries/**`, `**/LibraryUtils*`, `**/controls/smart/**`, and
  `no-restricted-globals` bans `Xrm`. This rule IS the architecture's
  enforcement mechanism (values in, events out), not code review.

### 9. webpack.config.mjs

Reads `kit.config.json` for the prefix (single source of truth shared with
the deploy). Two configs exported:

| Bundle | Entry | Output | Extras |
|--------|-------|--------|--------|
| clientui | `clientui/index.ts` | `dist/clientui/<prefix>clientui.js` | HtmlWebpackPlugin renders `clientui/html/clientui.html` to `<prefix>clientui.html` with `inject: false` and a `cacheBust` token equal to the compilation hash, so one stable webresource name still forces refetch on change |
| clienthooks | `clienthooks/index.ts` | `dist/clienthooks/<prefix>clienthooks.js` | UMD library, global `CrmClientSide` |

Shared settings: ts-loader transpileOnly (typecheck is a separate gate),
devtool source-map (generated locally, never deployed), performance hints
off. Mode comes from the CLI: `build` is production, `build:dev` is
development (production is the only deployable shape).

### 10. .npmrc

One directive: `save-exact=true`, so a later `npm install <pkg>` cannot
reintroduce a caret range and drift the tested tree. Deliberately NOT
engine-strict: the engines bound stays a warning for casual clones.

### 11. .storybook/

`main.ts`: framework `@storybook/react-vite`; stories
`../tests/storybook/**/*.mdx` and `../tests/storybook/**/*.stories.tsx`;
addons: `@storybook/addon-docs` only. No staticDirs configured.

`preview.tsx`: global `autodocs` tag; every story wrapped in `FluentProvider`
with the kit `d365Theme` on the neutral background (Storybook IS the visual
contract surface); docs source open; sidebar order Overview, Smart Controls,
Presentational Controls, Sample Patterns.

### 12. CI files and their reality

`azure-pipelines.yml`: trigger branches `master`, `release/*`, `feature/*`;
PR branches `master`, `release/*`. Stage Verify (ubuntu-latest, Node 24.x,
the verify steps in the same order as the local gate, plus conditional
production PCF builds when `shared/`, `pcfs/`, `package.json`, or the
lockfile changed, or on manual runs; publishes `dist` as the `webresources`
artifact). Stage Package (windows-latest, `npm run build`,
`dotnet build deployment/solution -c Release`, publishes the managed zip as
the `managed-solution` artifact).

**Reality note:** that pipeline is connected to no service; the only live CI
is `.github/workflows/storybook.yml` (push to master + manual dispatch,
builds Storybook, deploys to GitHub Pages, `npm install` not `npm ci` because
the Windows-generated lockfile omits the Linux-only native subtree). The
decision log carries the standing gap. Do not describe the two-stage
pipeline as running.

### 13. Deployment templates and render rules

`deployment/spkl.template.json` (committed) maps the three shell
webresources (`{{prefix}}clientui.html`, `{{prefix}}clientui.js`,
`{{prefix}}clienthooks.js`) from `../dist/` into solution `{{solution}}`.
`deploy.ps1` renders it to `deployment/spkl.json` (gitignored, spkl requires
that exact name) by replacing `{{prefix}}` and `{{solution}}` from
kit.config.json, resolves the connection from `SPKL_CONNECTION` or gitignored
`deployment/connection.local.json`, builds, and runs spkl.exe.

`deployment/solution/render-src.mjs` (run by the cdsproj's RenderSolutionSrc
target before packaging, or standalone) renders:

- `src/Other/Solution.xml` from `Solution.template.xml`, stamping
  `{{solution}}` (default `D365UIKit`), `{{version}}` (from root package.json,
  2 to 4 dotted parts), `{{publisher}}` (default: bare prefix),
  `{{prefix}}` (bare, no underscore), `{{optionvalueprefix}}` (default 10000),
  and the webresource RootComponents (type 61; the build appends type 66 for
  the PCF controls itself).
- `src/WebResources/` staged from `dist/` with a `.data.xml` beside each file.
  Webresource ids are UUID v5 (SHA-1) over the webresource NAME under a fixed
  namespace: rebuilds keep component identity (managed updates upgrade instead
  of conflict), and a renamed prefix is a genuinely different component.

The script's webresource list MIRRORS spkl.template.json by hand: **adding a
webresource means editing both files.** Both rendered outputs are gitignored.

`D365UIKit.cdsproj`: references the five `.pcfproj` files, builds them in
Release, `SolutionPackageType` defaults to `Managed` (override with
`-p:SolutionPackageType=Unmanaged` for a dev import). It pins
`Microsoft.PowerApps.MSBuild.Solution` (the SolutionPackager) to `2.8.1`, a
2.x packer matching the pac CLI. Keep it on 2.x: the old 1.x line
(`pac solution init` scaffolds `1.*`) silently DROPS component types it does
not recognize when packing from unpacked source, with only a "root components
are not defined in customizations" warning and no error (an AI Builder prompt
was the case that exposed it; the decision log records it). This is a
DIFFERENT package from `Microsoft.PowerApps.MSBuild.Pcf`, which the five
`.pcfproj` files pin at `1.*` (that is the PCF builder, not the packer, and
it stays 1.x). Do not "align" the two.

`src/Other/Customizations.xml` is COMMITTED and must keep its empty
`<WebResources />` node: SolutionPackager only reassembles the webresource
metadata into customizations.xml when that node exists; without it the zip
silently packs no webresource metadata. Do not "simplify" it away.

### 14. Runtime configuration: the ?app= and ?data= parameters

`LibraryUtils.parseWebResourceParams` (`shared/utils/LibraryUtils.ts`) is the
ONE parser. App selection priority: `?app=<key>`, else the `?data=` payload's
`app` property; `data` may be JSON or a plain string, possibly
double-encoded. The payload reaches apps as `host.params.data`, raw query
pairs as `host.params.query` (`clientui/AppContract.ts`).
`LibraryUtils.buildClientUIDataParam(app, payload)` is the counterpart for
`openClientUI` callers. Quick-test URL shape and the `RecordReady` rules
(form-embedded apps that need the record id; it waits indefinitely by
design): docs/adding-a-webresource-app.md sections 4 and 5.

### 15. The platform-library floor as a compatibility statement

The consumer-facing sentence (README): the target org must serve platform
Fluent **9.61 or newer**. Current commercial waves do; sovereign clouds (GCC,
GCC High, DoD, China per docs/deployment.md) trail the commercial wave
(recorded from live verification; re-verify against current Microsoft docs).
The exposure is the gap between the two floors: an org between 9.46.2 (import
acceptance) and 9.61.0 (API floor) accepts the import and only shows the
problem at runtime. The one control reaching an above-declaration export
today is the counterparty grid (SearchBox): its root probes for the export at
render and states the wave requirement in place of the control instead of
throwing. If the API floor rises to an export another control uses, give that
control's root the same probe (docs/deployment.md, "Virtual controls and the
platform-library floor").

## Adding a configuration axis (checklist)

When you introduce a new knob, give it the full treatment the existing axes
have:

1. **Committed default** in the file itself, exact values, no ranges (the
   `.npmrc` save-exact culture applies to config too).
2. **Local-override story**, if the local value must differ from the committed
   one: the skip-worktree pattern (kit.config.json) for a tracked file, or a
   gitignored `*.local.*` file (connection.local.json) for secrets. Never a
   tracked file carrying secrets.
3. **A render or check step wired into verify** if it can drift silently:
   either a checker like `scripts/check-pcf-floor.mjs` (first verify step) or
   render-from-template at build time (spkl.template.json,
   Solution.template.xml) so the generated file cannot be hand-edited into
   drift.
4. **A docs home**: docs/deployment.md for ALM-facing knobs, docs/gotchas.md
   for traps, the adding-a-* guides for authoring surface.
5. **A decision-log entry** in docs/internal/decisions.md if
   behavior-affecting (take the next free number).
6. **A row in THIS skill's catalog and a one-liner in its Provenance block.**
   This skill is only as good as its last re-verification.

## The versioning policy (distilled)

- **The repo version is a release milestone marker, not a semver API
  contract**, until the kit publishes a package. The kit is consumed
  source-first through template copies, no tooling resolves its version
  automatically, so a major bump protects nobody and reads as churn. "A
  package ships" means the first published npm package (the roadmap's
  presentational-tier direction); that package versions its own line under
  real semver from its first release, and this policy hands over to it there.
- **Breaking changes obligate disclosure, not a major number:** a prominent
  breaking-changes section in the release notes plus a decision-log entry.
- **How versions flow at release:** bump root `package.json`; the solution
  version follows automatically (`render-src.mjs` stamps `Solution.xml` and
  each webresource's IntroducedVersion at every solution build). The five
  `ControlManifest.Input.xml` `<control version>` values are aligned to the
  kit release BY HAND. The one machine-read version, the solution version,
  only needs to increase for updates to apply.
- **The redeploy bump rule** (independent of releases): any PCF redeploy, in
  any environment, needs a manifest `<control version>` bump or the platform
  serves the stale bundle (docs/gotchas.md). The shell webresource never needs
  a rename; the cache-busted HTML entry handles it.
- Promotion guidance for forks lives in docs/deployment.md ("Owning the ALM
  in a fork"): version on every promotion, controls solution separate from
  app customizations, unmanaged in dev, managed everywhere else.

## When NOT to use this skill

| You actually want to | Load instead |
|----------------------|--------------|
| Install the toolchain (npm install vs npm ci), run verify, fix build or environment breakage | `d365kit-build-and-env` |
| Deploy to an org, launch apps, exercise controls on a live form | `d365kit-run-and-operate` |
| Understand or defend the three-layer MVVM architecture and its fixed choices | `d365kit-architecture-contract` |
| Debug a blank control, a boot race, a caching ghost | `d365kit-debugging-playbook` |
| Know why an old approach (bundled Fluent, code-app adapter) was abandoned | `docs/internal/decisions.md` (the decision log) |
| Look up standard Dataverse client API shapes the kit mirrors | `dataverse-clientside-reference` |
| Profile, trace, or instrument (Profiler pins, network capture) | `d365kit-diagnostics-and-tooling` |
| Design tests or judge evidence | `d365kit-validation-and-qa` |
| Write or restructure docs, release notes | `d365kit-docs-and-writing` |

Version NUMBERS and which file carries them belong here; the release
PROCESS around them (building the zip, importing, tagging) belongs to
`d365kit-run-and-operate` and the repo owner.

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 at
v1.3.0. Sources: the files themselves (every value above was read, not
recalled), the decision log, docs/deployment.md, docs/gotchas.md,
docs/adding-a-webresource-app.md, README.md.

Re-verification one-liners, one per axis (run from the repo root, Windows
PowerShell; all read-only):

```powershell
# P1  kit.config.json committed value (expect exactly {"publisherPrefix": "new_"})
git show HEAD:kit.config.json
# P2  platform floor values (declared 16.14.0/9.46.2, API floor 9.61.0, tabster 9.26.1/8.5.5)
Get-Content pcfs\platform-floor.json
# P3  run the floor checker itself (expect: 5 virtual PCFs ... shared/ clear of React-18-only APIs)
node scripts\check-pcf-floor.mjs
# P4  repo version and engines
(Get-Content package.json -Raw | ConvertFrom-Json) | Select-Object version, engines | Format-List
# P5  the scripts table
(Get-Content package.json -Raw | ConvertFrom-Json).scripts
# P6  the five control manifest versions (expect the release version on all five, namespace D365Kit)
Select-String -Path pcfs\Kit*\Kit*\ControlManifest.Input.xml -Pattern '<control '
# P7  PCF project package.json versions stay the inert 1.0.0 scaffold
Select-String -Path pcfs\Kit*\package.json -Pattern '"version"'
# P8  featureconfig flags
Select-String -Path pcfs\Kit*\featureconfig.json -Pattern 'pcf'
# P9  app registry import lines (expect 10)
Select-String -Path clientui\apps\index.ts -Pattern '^import'
# P10 node line (expect 24)
Get-Content .nvmrc
# P11 toolchain pins
(Get-Content package.json -Raw | ConvertFrom-Json).devDependencies
# P12 tsconfig strictness/target/jsx
Get-Content tsconfig.json
# P13 jest CJS module override
Get-Content jest.config.mjs
# P14 eslint ignores and the presentational purity rule
Get-Content eslint.config.mjs
# P15 webpack entries, outputs, HTML plugin, UMD name
Select-String -Path webpack.config.mjs -Pattern 'entry|filename|library|HtmlWebpackPlugin'
# P16 npmrc (save-exact=true, no engine-strict)
Get-Content .npmrc
# P17 storybook config
Get-Content .storybook\main.ts
# P18 pipeline triggers and stages
Select-String -Path azure-pipelines.yml -Pattern 'include:|stage:|vmImage'
# P19 the live workflow (push to master, Pages deploy)
Get-Content .github\workflows\storybook.yml -TotalCount 10
# P20 spkl webresource mapping template
Get-Content deployment\spkl.template.json
# P21 render rules and optional kit.config keys
Select-String -Path deployment\solution\render-src.mjs -Pattern 'solutionName|publisherName|optionValuePrefix|ID_NAMESPACE'
# P22 solution template placeholders
Select-String -Path deployment\solution\Solution.template.xml -Pattern '\{\{'
# P23 the mandatory empty WebResources node
Select-String -Path deployment\solution\src\Other\Customizations.xml -Pattern 'WebResources'
# P24 cdsproj package type default, the SolutionPackager 2.x pin, and the five PCF references
Select-String -Path deployment\solution\D365UIKit.cdsproj -Pattern 'SolutionPackageType|MSBuild.Solution|ProjectReference'
# P25 deploy.ps1 config reads
Select-String -Path deployment\deploy.ps1 -Pattern 'publisherPrefix|solutionName|SPKL_CONNECTION'
# P26 the one launch-parameter parser and its builder
Select-String -Path shared\utils\LibraryUtils.ts -Pattern 'parseWebResourceParams|buildClientUIDataParam'
# P27 the consumer-facing floor statement (Fluent 9.61 or newer)
Select-String -Path README.md -Pattern '9.61'
# P28 the versioning policy text
Select-String -Path docs\deployment.md -Pattern 'What the version number means' -Context 1
# P29 the redeploy bump rule
Select-String -Path docs\gotchas.md -Pattern 'manifest version bump' -Context 0,4
# P30 the surviving tabster pins (date picker only)
Select-String -Path pcfs\KitDatePicker\package.json -Pattern 'tabster'
```

Maintenance rule: any commit that touches a file named in the table above
should also touch this skill (or explicitly conclude no row changed). After a
release, re-run the block and re-stamp the date at the top.
