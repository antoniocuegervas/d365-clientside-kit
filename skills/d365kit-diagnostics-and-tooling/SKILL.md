---
name: d365kit-diagnostics-and-tooling
description: "Measurement runbook for the D365 Client-Side UI Kit: load when someone asks whether something is faster, smaller, re-rendering too much, or regressed, when a perf, size, or render claim needs a number instead of an adjective, or when picking the right meter (UCI perf overlay KPI, render-count flags, React Profiler pinned tests, bundle-size report, test-suite counts, PCF floor checker, Solution Checker, live-org Web API spot checks)."
---

# Measure, do not eyeball

Every performance, size, or rendering claim in this repo is backed by a number
and the command that produced it (the decision log's recorded measurements are
the model: "889 KB full, 425 KB trimmed, production build, minified"). This
skill is the catalog of meters, how to run each one, and how to read what it
says.

Live-org steps use your own Dataverse org (`https://yourorg.crm.dynamics.com`
below); be deliberate about which org you point tools at, especially shared
ones.

## The measurement inventory

| What you measure | Meter | Command / where | What good looks like |
|---|---|---|---|
| Form load, end to end | UCI page-load KPI (`&perf=true` overlay) | Append `&perf=true` to the form URL, warm reload four times, take the median | The recorded baseline: a sample Contact form with four kit PCFs plus timeline opened warm in roughly one to one and a half seconds (docs/deployment.md) |
| Excessive rendering, live form | `&perf=true` render-count flags | Same overlay, per-control flags | No kit control flagged; native twins flag at 2-3 (the platform's own band); a flagged kit control is a regression toward the pre-batching behavior |
| Render commits, repeatable and offline | React Profiler pinned tests | `npx jest tests/unit/shared/controls/smart/smartControls.test.tsx -t "form-load render batching"` | At most 2 Profiler commits: one loading paint, one content paint |
| Bundle sizes | `skills/d365kit-diagnostics-and-tooling/scripts/bundle-size-report.mjs` | `node skills/d365kit-diagnostics-and-tooling/scripts/bundle-size-report.mjs` | Virtual PCFs 7-82 KB recorded band, date picker ~380 KB, shell ~890 KB full / ~425 KB trimmed, zero SUSPECT flags |
| Regression breadth | Unit + smoke suites | `npm run test` then `npm run smoke` (smoke needs `dist/`) | 42 suites / 571 unit tests and 2 suites / 12 smoke tests at v1.3.0; the counts only go up |
| Untested-code visibility | Coverage | `npm run coverage` | Every first-party file appears in the table, including files no test imports (that is the point) |
| Virtual-control posture | Floor checker | `node scripts/check-pcf-floor.mjs` | One OK line naming all five controls on declared Fluent 9.46.2 / API floor 9.61.0, exit 0 |
| Static solution health | Solution Checker | Maker portal or `pac solution check` against a built zip | Zero actionable findings on the virtual controls; `web-avoid-window-top` on a bundled-Fluent PCF is a recorded false positive |
| Hooks behavior on a live form | Console injection | Runbook below | Notifications render, the dialog opens, the grid row locks |
| Values actually committed | Web API spot check | Console query below | The value a kit control wrote comes back from the platform |

## 1. Form load: the UCI page-load KPI

How to open the overlay: navigate to the form, then append `&perf=true` to the
URL and reload, for example
`https://yourorg.crm.dynamics.com/main.aspx?appid=<app>&pagetype=entityrecord&etn=contact&id=<guid>&perf=true`.
The Unified Interface renders its performance overlay on the page; the
page-load KPI is the "page loaded in X s" figure the repo's numbers cite.

The measurement protocol the recorded numbers used, copy it exactly so your
number is comparable:

1. Load the form once to warm caches (that load does not count).
2. Full reload four times with the overlay present, note the KPI each time.
3. Report the range and the median, plus the date, the form, and what the form
   carries.

The recorded baseline: a sample Contact main form carrying four kit PCFs plus
the timeline opened warm in 1.03-1.17 s (median about 1.09 s) with the old
standard builds, and 1.24-1.86 s (median about 1.4 s) with the virtual builds
on a later day. deployment.md itself refuses to call that pair an A/B
(different days, org load, cache states, single org, small samples): read it
as "roughly a second and a half warm either way". Re-verify by measuring, not
by quoting.

Two recorded traps for anyone building an A/B twin form:

- **Build the twin in the form designer, not the raw API.** An API-created
  systemform defaults to `formpresentation` 0 and never joins the entity's
  form order, so UCI ignores it even with `&formid=` and an app publish
  (docs/internal/roadmap.md).
- **Clear the client-side form cache between publishes.** The form definition
  lives in the app's IndexedDB/localStorage, not the HTTP cache; a plain or
  hard reload does not refresh it. DevTools, Application, Clear site data,
  then expect the first load to be slow (~a minute of cold metadata rebuild)
  before measuring warm loads (docs/gotchas.md).

## 2. Excessive rendering

Two meters, one live and one repeatable. Use both directions: the overlay
finds the problem, the pinned tests keep it fixed.

**Live: the `&perf=true` render-count flags.** The same overlay flags controls
that render too often during form load. The platform's own band: native
controls flag at 2-3 (a native lookup twin at 3, native section containers at
2, recorded live). Since the paint batching landed, no kit control is flagged;
before it the lookup PCF flagged at 5 (one render per resolved piece:
metadata, formatting, currency, icons, switcher labels). Interpretation: a kit
control flagged again means an async resolution landed in its own state write
instead of batching before the single commit; look at `SmartFieldBase` and its
`loadExtras` seam before anything else.

**Repeatable: the React Profiler pinned tests.** File:
`tests/unit/shared/controls/smart/smartControls.test.tsx`, describe block
`form-load render batching`. A `React.Profiler` wrapper counts commits; the
contract is at most 2 (`expect(commits()).toBeLessThanOrEqual(2)`): one
loading paint, one content paint. Two tests pin the two worst cases:

- `SmartNumberField paints twice: loading, then everything at once` (the
  heaviest field: metadata + locale formatting + record currency + org pricing
  precision, four async resolutions, one content commit).
- `SmartNativeLookup paints twice with switcher labels and the selected icon
  in place` (the known-chatty control: polymorphic lookup resolving the
  attribute, two target display names, and the selected value's icon).

Run just them:

```powershell
npx jest tests/unit/shared/controls/smart/smartControls.test.tsx -t "form-load render batching"
```

Interpretation: 3 commits is a regression even if every functional test stays
green. When adding a smart control, add a commit-count test in this describe
block; the counter helper (`countCommits`) is right there to copy.

## 3. Bundle sizes

Where each artifact lands:

| Artifact | Path | Produced by |
|---|---|---|
| Shell bundle | `dist/clientui/<prefix>clientui.js` | `npm run build` |
| Hooks bundle | `dist/clienthooks/<prefix>clienthooks.js` | `npm run build` |
| PCF bundles | `pcfs/<Name>/out/controls/<Name>/bundle.js` | the PCF build, or `dotnet build deployment/solution -c Release` |
| Managed solution zip | `deployment/solution/bin/Release/D365UIKit.zip` | `dotnet build deployment/solution -c Release` |

Recorded expectations:

- **Virtual PCFs 7-82 KB**, the date picker about **380 KB** (it alone bundles
  the date/time compat packages the platform library does not carry). Recorded
  production sizes (docs/deployment.md, Form budget): option set 7, tooltip
  54, native lookup 78, counterparty grid 82, date picker 380. Later releases
  run a few KB higher as features land; the report's 1.25x band tracks it.
- **Shell: 889 KB full ten-app build, 425 KB trimmed** to template plus
  samples hub (recorded, production, minified). The size lever is the app
  manifest `clientui/apps/index.ts`: delete an app's registration line and its
  code leaves the bundle.
- Pre-migration standard builds weighed 350-750 KB per control (each bundling
  its own React and Fluent); any virtual control drifting back toward those
  numbers has broken the virtual posture.

Quick checks in PowerShell:

```powershell
Get-ChildItem dist -Recurse -Filter *.js | Select-Object FullName, @{n="KB";e={[math]::Round($_.Length/1KB,1)}}
Get-ChildItem pcfs\*\out\controls\*\bundle.js | Select-Object FullName, @{n="KB";e={[math]::Round($_.Length/1KB,1)}}
Get-Item deployment\solution\bin\Release\D365UIKit.zip | Select-Object Name, LastWriteTime, @{n="KB";e={[math]::Round($_.Length/1KB,1)}}
```

### scripts/bundle-size-report.mjs (ships with this skill)

One command does all of the above plus the flagging:

```powershell
node skills\d365kit-diagnostics-and-tooling\scripts\bundle-size-report.mjs
```

Strictly read-only. It walks the three locations, skips `pcfs/_*` local
wrappers (the same rule as the floor checker), reads each PCF's package.json
to know whether it legitimately bundles compat packages, and prints one line
per artifact with a flag: `[OK]` within 1.25x of the recorded number,
`[GROWN]` above it (explain the growth in the PR), `[SUSPECT]` past the
bundling threshold (a non-compat PCF at 150 KB+ or any PCF at 500 KB+ has
almost certainly bundled React/Fluent; the hooks bundle at 150 KB+ means React
leaked in), `[INFO]` where no band is recorded, `[MISSING]` with the build
command when a folder is absent. Exit code 1 only when a SUSPECT fired, so it
can gate. Mind the `built <date>` column: a stale artifact measures the past,
rebuild before judging a change.

## 4. The test suite as a meter

- `npm run test`: jest over `tests/`, smoke excluded
  (`--testPathIgnorePatterns tests/smoke`). Baseline at v1.3.0:
  **42 suites / 571 tests, all passing**. Use the counts as regression
  breadth: your change should move them up or leave them equal; a suite count
  DROP means a test file stopped being collected (renamed, moved out of
  `tests/`, or match-pattern broken), investigate before celebrating a fast
  run.
- `npm run smoke`: jest over `tests/smoke` only, **2 suites / 12 tests**. It
  loads the PRODUCTION bundle from `dist/` into jsdom, so **run `npm run
  build` first**: `tests/smoke/clientui.smoke.test.ts` throws
  `Bundle not found at ..., run 'npm run build' before 'npm run smoke'.` It
  reads the prefix from kit.config.json, so it finds your locally-named
  bundle automatically.
- `npm run coverage`: unit tests with coverage. Per the jest.config.mjs
  comment, `collectCoverageFrom` instruments EVERY first-party source file
  (`shared/`, `clientui/`, `clienthooks/`, minus `*.d.ts` and `generated/`),
  so files no test touches still show up at 0%. Interpretation: the table is a
  map of untested files, not just percentages of tested ones. Do not chase a
  global percentage; check that the file you changed has meaningful lines
  covered.

## 5. Running the verify gate safely (exit codes and timings)

`npm run verify` chains floor check, lint, typecheck, build, unit, smoke, and
the Storybook build (package.json). The whole gate is minutes, not seconds;
the Storybook build dominates.

Run verify bare and check the shell's exit variable; piping it masks a red
gate. The full trap and the PowerShell-safe `cmd /c` capture pattern are homed
in `d365kit-validation-and-qa` (section 2).

## 6. The floor checker, how to run and read it

```powershell
node scripts\check-pcf-floor.mjs
```

Read-only, seconds, the first step of `npm run verify`. Expected output:

```text
PCF platform-floor check OK: 5 virtual PCFs on declared Fluent 9.46.2 / API floor 9.61.0 (KitCounterpartyGrid, KitDatePicker, KitNativeLookup, KitOptionSet, KitTooltip), shared/ clear of React-18-only APIs.
```

What it checks (virtual posture, declared platform-library versions, dev-only
React and Fluent at the floors, compat/tabster pinning, the import-graph walk,
exact versions, and the `shared/` React-18-only scan) is enumerated check by
check in `d365kit-config-and-versioning` (axis 2), the list's single home;
this section owns how to RUN it and how to READ its output.

Reading failures: each line is `<ControlName>: <what and why>`, the script
exits 1, and the footer points to `pcfs/platform-floor.json` and
docs/deployment.md. Fix the named control; do not edit the floor file to make
a failure disappear (raising `fluentApiFloor` is a deliberate, README-stated
decision, per deployment.md).

## 7. Solution Checker: what it is and the recorded false positive

Solution Checker is the platform's static analysis over a solution zip (run
from the maker portal, or `pac solution check`; it needs a tenant session).
It is the meter for "does the platform object to this artifact", not for
performance.

The recorded false positive (docs/gotchas.md): on a PCF that BUNDLES Fluent
v9, the checker reports `web-avoid-window-top` (High) several times against
`bundle.js`. The rule pattern-matches `.top` in minified code and is flagging
Fluent's positioning engine reading `DOMRect.top` / `style.top`, not
`window.top`; the kit's own code never uses `window.top`. Advisory, safe to
dismiss, relevant only for AppSource certification.

Historical context: since the virtual migration the kit's PCFs no longer
bundle Fluent, so this finding should not appear on kit builds anymore. It
stays relevant for any consumer `control-type="standard"` PCF that bundles
Fluent, per deployment.md's historical section.

## 8. Console-injection diagnostics for clienthooks

Recorded technique: the hooks bundle can be exercised on a live form WITHOUT
registering anything, by injecting it from the DevTools console. Use a dev
org you are allowed to poke.

1. Open an Account record's main form, F12, Console, top frame.
2. Paste the entire built bundle `dist/clienthooks/<prefix>clienthooks.js`
   (one minified line, ~45 KB) into the console. It is a UMD bundle
   (webpack.config.mjs: `library: { name: "CrmClientSide", type: "umd" }`),
   so it attaches `window.CrmClientSide`.
3. Build a fake execution context. `ClientHook.formContextOf` accepts either
   an execution context exposing `getFormContext` or a raw form context, and
   current UCI still serves the deprecated `Xrm.Page` (recorded; re-verify),
   so:

   ```js
   const ctx = { getFormContext: () => Xrm.Page };
   ```

4. Form hooks: `CrmClientSide.Account.Form.onLoad(ctx)` should hide
   creditonhold/creditlimit on a create form (visible otherwise), lock
   accountnumber, and mark telephone1 recommended.
   `CrmClientSide.Account.Form.onSave(ctx)` should show a field notification
   on an empty telephone1 and the actionable RECOMMENDATION notification on an
   empty websiteurl (its action seeds `https://`).
5. Ribbon hook: the shell webresource name defaults to the committed `new_`
   prefix, so point it at your org's real name first, then fire it:

   ```js
   CrmClientSide.Account.Ribbon.webResourceName = "<prefix>clientui.html";
   CrmClientSide.Account.Ribbon.openCompanySearch(Xrm.Page);
   ```

   Expect the company-search app in a centered `openClientUI` dialog
   (`openCompanySearchPane(Xrm.Page)` for the side pane).
6. `CrmClientSide.LockedGrid.onRecordSelect` locks every column of a selected
   editable-grid row; it needs a real grid event context, so registering it
   on a real grid's OnRecordSelect is the reliable way to drive it.

Interpretation: this technique tests the BUNDLE and the handlers, not the
registrations. A clean console run plus broken form behavior means the form's
event registration (library name, function name, "pass execution context") is
what is wrong.

## 9. Web API spot checks from the console

Confirm kit-committed values through the Web API rather than trusting the UI.
From the DevTools console of any session inside the model-driven app:

```js
Xrm.WebApi.retrieveRecord("contact", "<record-id>", "?$select=preferredappointmentdaycode")
  .then(r => console.log(r.preferredappointmentdaycode));
```

Or the raw shape, when you want to see exactly what the platform serves:

```js
const base = Xrm.Utility.getGlobalContext().getClientUrl();
fetch(base + "/api/data/v9.2/contacts(<record-id>)?$select=preferredappointmentdaycode",
  { headers: { Accept: "application/json" } }).then(r => r.json()).then(console.log);
```

Pattern: commit a value through the kit control, read it back this way, and
only then call the write verified. Add `?$select=` fields you actually
asserted; do not fetch whole records into a console log.

## Interpretation discipline

- **Numbers beat adjectives.** "Faster" is a claim; "median 1.09 s over four
  warm reloads via the `&perf=true` KPI on the sample Contact form, dated" is
  a measurement. If a sentence in a PR or decision entry has a comparative and
  no number, it is not done.
- **Before/after pairs on the same surface.** Same form, same org, same cache
  state, same day where possible. deployment.md's own two form-load sessions
  refuse to call themselves an A/B for exactly this reason; copy that honesty
  instead of manufacturing a delta.
- **Record the number AND the command** that produced it in the decision
  entry or PR description. A number nobody can reproduce is an anecdote.
- **One meter per question.** The overlay KPI answers "how fast does the form
  open", the Profiler tests answer "how many commits", the size report
  answers "how big". Do not average across meters or substitute one for
  another.
- Route the evidence bar (what counts as proven) to
  **d365kit-validation-and-qa**; route designing a NEW probe or experiment
  (something no meter here covers) to **d365kit-proof-and-analysis-toolkit**.

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| The gate is red, a build or install is broken | d365kit-build-and-env |
| Deploying, publishing, org sessions | d365kit-run-and-operate |
| Chasing a defect (blank control, boot failure, wrong value) | d365kit-debugging-playbook |
| What already failed before and why (tabster, cache, import identity) | `docs/internal/decisions.md` (the decision log) |
| Whether a change is architecturally allowed before you measure it | d365kit-architecture-contract |
| Client API shapes (Xrm, WebApi, PCF context) | dataverse-clientside-reference |
| Version bumps, prefixes, kit.config.json handling | d365kit-config-and-versioning |
| The evidence bar for PRs, what "verified" means | d365kit-validation-and-qa |
| Designing a new experiment or probe from scratch | d365kit-proof-and-analysis-toolkit |
| Writing measured numbers into docs or release notes | d365kit-docs-and-writing |

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0 (test counts re-verified that day; live-org datapoints are recorded
history from the 2026-07 sessions, documented in docs/deployment.md and the
decision log). Sources: docs/deployment.md (Form budget, live datapoints,
floor explanation), docs/gotchas.md (Solution Checker false positive;
form-cache clearing), docs/internal/roadmap.md (A/B twin traps), the decision
log, jest.config.mjs, package.json scripts, scripts/check-pcf-floor.mjs,
pcfs/platform-floor.json, tests/smoke/clientui.smoke.test.ts,
tests/unit/shared/controls/smart/smartControls.test.tsx, webpack.config.mjs.

Re-verification one-liners:

- `node scripts\check-pcf-floor.mjs` (expect the one-line OK naming 5 controls)
- `node skills\d365kit-diagnostics-and-tooling\scripts\bundle-size-report.mjs` (expect no SUSPECT flags)
- `cmd /c "npm run verify > %TEMP%\d365kit-verify.log 2>&1"` then `$LASTEXITCODE` (expect 0)
- `npx jest tests/unit/shared/controls/smart/smartControls.test.tsx -t "form-load render batching"` (expect 2 passing tests)
- Baselines to re-pin after a change: the unit and smoke counts, the size report's OK lines, and deployment.md's form-load protocol on your org.
