---
name: d365kit-validation-and-qa
description: "Evidence and QA doctrine for the D365 Client-Side UI Kit repo: load before claiming anything works, is verified, or is done; before adding or changing unit tests, smoke tests, Storybook stories, or test mocks; when planning the verification for a change (which rung of the evidence ladder it needs, unit vs smoke vs Storybook vs full verify vs live-org proof); when running or interpreting npm run verify and its exit code; and when judging whether evidence is sufficient for a claim."
---

# What counts as proof in the D365 Client-Side UI Kit

The one rule everything below serves: **a claim's strength must match its
evidence.** "Compiles" is not "tested", "tested" is not "works", "works on a
mock" is not "works on a form", and "accepted untested" must be said out loud,
never silently upgraded. The decision log records a whole adversarial round of
claims that did not survive verification; read section 1 before writing the
words "works" or "verified" anywhere.

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| Running builds, npm install vs npm ci, toolchain, workspace setup | `d365kit-build-and-env` |
| Deploying, the live org session mechanics, Fiddler loop, org conventions (hide-don't-remove) | `d365kit-run-and-operate` |
| A test or the app is failing and you need to find out why | `d365kit-debugging-playbook` |
| DevTools, network tab, `&perf=true` overlay, probe tooling mechanics | `d365kit-diagnostics-and-tooling` |
| Wording claims (README, docs, release notes) honestly | `d365kit-docs-and-writing` |
| Layer boundaries, MVVM/Observables contract the tests protect | `d365kit-architecture-contract` |
| Past incidents and their post-mortems | `docs/internal/decisions.md` (the decision log) |
| Dataverse client API facts (what the platform actually does) | `dataverse-clientside-reference` |
| Measurement/analysis scripts and evidence-gathering tooling | `d365kit-proof-and-analysis-toolkit` |
| kit.config.json, versions, prefixes, release numbering | `d365kit-config-and-versioning` |

## 1. The evidence ladder

Weakest to strongest. Each rung licenses a specific claim vocabulary and no
more.

| Rung | Evidence | What it proves | Claim it licenses | Suffices when |
|---|---|---|---|---|
| 1 | `npm run lint` + `npm run typecheck` | Types line up; layer rules hold (the presentational tier's CRM-agnosticism is lint-enforced) | "compiles", "typechecks" | Never alone. An intermediate signal while editing, nothing more |
| 2 | Unit tests, Jest + jsdom on scripted fakes (`tests/unit/**`) | Logic behaves against the host contract as the mocks encode it | "unit-tested", "pinned" | Pure logic: Observables, utils, ViewModels, adapters, metadata reads. A defect fix needs a failing-first test here |
| 3 | Storybook on fixture data (`tests/storybook/**`; the gate step is `npm run build-storybook`) | Presentational controls render every state; the visual contract | "renders its states" | Presentational control changes, short of native-parity claims (those are side-by-side on a live form) |
| 4 | Smoke against PRODUCTION bundles (`npm run build` then `npm run smoke`) | The built artifact itself boots end to end: bundling, UMD globals, adapter selection, the legacy XHR data path | "the bundle boots" | Bundling, bootstrap, webpack, kit.config-driven naming changes |
| 5 | The full verify gate (`npm run verify`) | All of the above in order, plus the PCF platform-floor check | "verify green" | The minimum bar for ANY merge (section 2) |
| 6 | Live-org verification | Real host behavior: the platform, its caches, its metadata store, its focus management, its timing | "works", "verified", "live-verified" | Any claim about behavior on a form, in an app, or across an import. The strongest rung and the only one that supports "works" |

What rung 6 takes, no shortcuts (mechanics in `d365kit-run-and-operate`):

- Deployed CURRENT artifacts: webresources published, and every touched PCF
  with a bumped `<control version>` in its manifest, or the form serves the
  cached previous bundle and your "verification" exercises stale code.
- A real form or app, not the PCF test harness ("the done bar for a PCF is
  opened on a real model-driven form and observed rendering",
  docs/deployment.md).
- The feature exercised end to end, including a committed value confirmed via
  the Web API, not just pixels on screen.
- Console clean: zero errors.
- Only the expected network traffic (section 5.1).
- The result recorded (decision entry or roadmap shipped entry), including
  anything that did NOT get verified.

### Claims that did not survive verification (the standing lesson)

An adversarial review round is this project's standing proof that unverified
claims rot. The decision log enumerates it; the shape of the lesson:

Kit claims that died or were cut down to their evidence:

- A cross-host parity claim was too broad: rejected-promise shapes are
  host-coupled and normalizing them would break three hosts. The claim was
  RESCOPED to what the code actually delivers (parity for success shapes and
  flow control), with rejection shapes documented as host-specific.
- The ALM chapter described a release pipeline the repo could not execute.
  Rather than shipping it untested, the claim was cut to a deferral with a
  trigger, and later closed for real with a live import verification.

Reviewer claims that died when checked against the code were recorded too,
with the reasoning, so no future round re-raises them.

Both directions are one rule: **nobody's claim is evidence, including a
reviewer's and including yours.** Check it against the code, then act, then
record which way it fell.

## 2. The verify gate: the minimum bar for any merge

`npm run verify` runs, in order (package.json):

```
check:pcf-floor -> lint -> typecheck -> build -> test -> smoke -> build-storybook
```

Run `npm install` first in a fresh workspace (the install-vs-ci story is
`d365kit-build-and-env`'s). `build` precedes `smoke` inside the gate on
purpose: smoke loads production bundles from `dist/`.

### The exit-code trap (this section is the trap's single home)

Run it BARE. Never pipe it:

```powershell
npm run verify
$LASTEXITCODE   # 0 is the only pass
```

Piping (`npm run verify | tail -40` in bash, or through anything that
truncates) makes the shell report the LAST command's exit code, the pipe's,
not npm's; a red gate then reads as green. Run bare, check the shell's own
exit variable (`$LASTEXITCODE` in PowerShell, `$?`/`echo $?` in bash
immediately after), and read the tail of the output to see which step spoke
last.

When you also want the tail without risking the trap, the PowerShell-safe
capture pattern is:

```powershell
cmd /c "npm run verify > %TEMP%\d365kit-verify.log 2>&1"
"exit=$LASTEXITCODE"
Get-Content $env:TEMP\d365kit-verify.log -Tail 40
```

`cmd /c` propagates npm's exit code to `$LASTEXITCODE` and keeps PowerShell
from wrapping stderr lines into ErrorRecords. Read the tail only to see WHICH
step failed; read `$LASTEXITCODE` to know WHETHER it failed.

### Baseline at v1.3.0

| Step | Result |
|---|---|
| check:pcf-floor | OK: 5 virtual PCFs, declared Fluent 9.46.2, API floor 9.61.0 (`pcfs/platform-floor.json`), shared/ clear of React-18-only APIs |
| lint, typecheck | pass |
| build | both bundles compiled (clientui shell + clienthooks UMD) |
| test (unit) | 42 suites, 571 tests, all pass |
| smoke | 2 suites, 12 tests, all pass |
| build-storybook | green |

A future run with FEWER suites/tests than this baseline, while still green,
means tests were deleted or skipped; treat that as a finding, not a pass.

### What verify does NOT prove

- **It does not compile the five PCFs.** Deliberate: five npm installs plus
  five production builds would push the gate past the cheap-question bar. The
  floor checker guards manifests, dependencies, and the shared import graph
  statically. Known residual: the root typechecks shared code against a newer
  Fluent than the 9.61 PCF floor, so a shared change using a newer Fluent API
  can pass verify locally and only die in the PCF build. If you touch a PCF or
  shared code a PCF consumes, build the affected PCFs yourself.
- **It never touches an org.** Rung 6 is manual by design (the repo carries no
  org secret).
- **CI reality gap (standing):** the committed `azure-pipelines.yml` describes
  a two-stage CI but is connected to no service; only the GitHub Actions
  Storybook-to-Pages workflow actually executes. Executable-from-repo, not
  CI-executed; keep saying it that way.

## 3. Test authoring rules (docs/testing.md)

| Layer | Tool | Where |
|---|---|---|
| Observables, utils, cds-client, context adapters | Jest (jsdom) | `tests/unit/**`, mirroring source paths |
| Presentational controls | Storybook, fixture data ONLY | `tests/storybook/**` |
| Smart controls | Jest + scripted fake context | `tests/unit/shared/controls/smart/` |
| Shell + hooks bundles | jsdom smoke against PRODUCTION bundles | `tests/smoke/**` |
| End-to-end CRM | Manual checklist after sandbox deploy | docs/testing.md bottom section |

Hard rules:

1. **Test paths mirror production paths under `tests/unit/`.**
   `shared/reactivity/Observable.ts` is tested by
   `tests/unit/shared/reactivity/Observable.test.ts`. No exceptions in the
   tree today.
2. **No co-located `*.test.tsx` or `*.stories.tsx` beside sources.** A glob
   for `{shared,clientui,clienthooks}/**/*.{test,stories}.*` returns nothing.
   Keep it that way; jest roots at `tests/` only (jest.config.mjs).
3. **Storybook stories use fixture data only; zero CRM mocks in stories is a
   hard rule.** If a story needs CRM data, it arrives as a plain value,
   exactly as a ViewModel would supply it (`tests/storybook/fixtures.ts` is
   the fixture module). The ONE sanctioned exception is the Smart Controls
   group: those stories render against `createFakeViewModelContext` through
   the shared rig `tests/storybook/smart/smartStoryHarness.tsx`, the SAME
   fake the unit tests use, so there is no second mock to maintain.
   Presentational stories stay zero-mock, always.
4. **Hooks get smoke/DI coverage** (registry shape plus handler behavior), not
   exhaustive business-logic suites; they are templates
   (`tests/smoke/clienthooks.smoke.test.ts`).
5. **Smoke tests load PRODUCTION bundles from `dist/`.** `npm run build`
   first; the suite throws a "run 'npm run build' before 'npm run smoke'"
   error if the bundle is missing. The bundle name is read from
   `kit.config.json`'s `publisherPrefix` at test time, so smoke exercises
   whatever prefix your local config names.
6. **Per-control RTL unit tests for presentational controls are deliberately
   deferred**: Storybook plus the contract/smoke suites carry them. Add an RTL
   unit test only where a control has genuine logic (NumberField parsing is
   the recorded example;
   `tests/unit/shared/controls/presentational/NumberField.test.tsx` exists for
   exactly that reason). Backfilling the rest is recorded as low-value churn;
   do not "improve coverage" there.

Commands (PowerShell-safe):

```powershell
npm run test                                        # unit only (excludes tests/smoke)
npx jest tests/unit/shared/reactivity/Observable.test.ts   # one file
npm run build; npm run smoke                        # smoke needs a current dist/
npm run storybook                                   # dev server on :6006
npm run build-storybook                             # the gate step
```

## 4. The mock inventory: reuse, do not reinvent

Four pieces under `tests/mocks/`. Every one exists because a past test needed
it; a new test almost certainly needs one of these, not a new mock.

| Mock | Key exports | What it is |
|---|---|---|
| `tests/mocks/XrmMock.ts` | `createModernXrmMock(options)`, `createV8XrmMock(options)` | Recording Xrm mocks for the modern (v9.2+/UCI) and legacy (CRM 8.x) host shapes. Both return `{ xrm, calls }` where `calls` is a plain recording array. Deliberately no jest dependency, so the same mocks drive unit tests AND the jsdom bundle smoke tests. Options script Web API responses, `online.execute` status/body (400+ REJECTS with the platform's `{ errorCode, message }` shape, not a response), a form record, lookup dialog results, user/org settings, and a native metadata store (`entityMetadata`); leaving `entityMetadata` absent exposes NO `getEntityMetadata`, which forces the OData synthesis fallback, exactly like a host without the store |
| `makeEntityMetadataMock(spec)` (in XrmMock.ts) | one builder | Standard-shaped EntityMetadata, the thing `getEntityMetadata` resolves: PascalCase entity members (`LogicalName`, `EntitySetName`, `PrimaryIdAttribute`, ...) and an ItemCollection-like `Attributes` (`get`/`getAll`/`forEach`/`getLength`) whose items carry the PascalCase payload under `attributeDescriptor`, the store shape verified on a live v9 org. Shared by the Xrm mock and the fake context so every test scripts the shape a real host serves |
| `tests/mocks/FakeXhr.ts` | `FakeXhrServer` | Scriptable XMLHttpRequest server: `install()`/`uninstall()` swap `globalThis.XMLHttpRequest`; `respondWith(responder)` (first responder returning a response wins) or `respondAlways(response)`; records every request (`method`, `url`, `headers`, `body`, `withCredentials`); a response can set `timedOut: true` to fire `ontimeout`; responses land async via `queueMicrotask` so promise plumbing is genuinely exercised |
| `tests/mocks/fakeViewModelContext.ts` | `createFakeViewModelContext(options)` | In-memory `IViewModelContext`, no Xrm, no XHR; returns `{ context, calls }`. Script attribute metadata keyed `"entity.attribute"` with the PascalCase attributeDescriptor payload (`Type: "picklist"`, `MaxLength`, `OptionSet`, `Targets`, ...), entity-level overrides, views (by savedQueryId or `"default:entity"`), FIFO `queryResults` per entity (or `{ failWith }` to reject), `pageResults`, `executeResults`, `changeSetIds`, `lookupResults`, `formatting`, `currencies`, `pricingDecimalPrecision`, `entityIcons`, an optional `formRecord` (built through the REAL `buildFormContext`), `delayMs` for loading states, and `queryGate` to hold responses open and resolve them in a chosen order, the shape every stale-response race test needs |

When to reach for which:

- Testing a **smart control or ViewModel**: `createFakeViewModelContext`.
  Always. This is the highest-level fake and the one Storybook's smart harness
  shares.
- Testing a **context adapter, bootstrap, or anything that consumes
  `window.Xrm`**: `createModernXrmMock` / `createV8XrmMock`.
- Testing **cds-client, MetadataService, or CdsEntityMetadataProvider** (raw
  OData over XHR): `FakeXhrServer`.
- Scripting **what the native metadata store returns** anywhere:
  `makeEntityMetadataMock`, never a hand-rolled object (the ItemCollection
  shape is easy to get wrong and the encodings are pinned).
- **Smoke tests** combine them: XrmMock supplies the host, FakeXhrServer
  serves the legacy data path against the real production bundle.

If a test needs a behavior none of these script, extend the options of the
existing mock (they grew exactly this way) rather than forking a new one.

## 5. Live-verification protocols

All three are distilled from recorded runs; the mechanics (deploy commands,
URL anatomy, cache rituals) live in `d365kit-run-and-operate`. Use your own
dev org.

### 5.1 Feature live-verify

1. [ ] Deploy current artifacts: webresources published; every touched PCF
       manifest version bumped, rebuilt, reimported (an unbumped manifest
       serves the cached old bundle and invalidates the whole session).
2. [ ] Open the sample apps on the live org and exercise the feature end to
       end on standard entities.
3. [ ] Confirm resolution ON SCREEN: labels, option sets, date/number formats,
       currency symbol, polymorphic lookup targets.
4. [ ] Network tab: only the EXPECTED raw XHRs. The recorded baseline pins the
       kit's raw XHRs to two (the usersettings formatting read and the
       entity-icon EntityDefinitions read); anything else is a finding.
5. [ ] Console clean: zero errors.
6. [ ] Append `&perf=true` and read the render flags: kit controls must sit
       inside the platform's own 2-3 render band.
7. [ ] Record: decision entry or roadmap shipped entry, INCLUDING what remains
       unverified.

### 5.2 Import verification

1. [ ] Build the zip FROM THE COMMIT: `npm run build` then
       `dotnet build deployment/solution -c Release`.
2. [ ] The three-check clean-org criterion, all read-only pre-checks, in this
       order:
   - no custom control shares the kit controls' namespace (`D365Kit.*`) under
     ANY publisher (control identity is the unprefixed
     `namespace.constructor`, org-global; the platform rejected exactly this
     live: "already created by another publisher"),
   - no components carry the zip's publisher prefix (webresources ARE
     prefix-scoped),
   - no solution already uses the zip's unique name, managed or unmanaged
     (names are org-global; the spkl dev deploy target defaults to the same
     `D365UIKit` name).
3. [ ] If the only org fails check 1 because it already runs the kit: build a
       VERIFICATION-ONLY zip, identical except a throwaway manifest namespace
       in the five controls. That zip must never ship; revert the manifests
       after and commit nothing throwaway.
4. [ ] Import (pac; read the output TEXT for "Error", pac can exit 0 on a
       failed import). Confirm the three webresources land with their
       deterministic name-derived ids verbatim.
5. [ ] EXERCISE, do not just import: bind one control to a real column on a
       real form, see it render and resolve options, commit a value, confirm
       the value via the Web API, console clean; boot the shell's samples hub
       inside the app and load live rows in a sample.
6. [ ] Remove the binding before uninstall (the recorded exception to
       hide-don't-remove: a lingering binding is a dependency and blocks the
       uninstall, and the uninstall IS the test).
7. [ ] Uninstall must succeed FIRST TRY; re-run every pre-check query and
       confirm the org is back to its exact baseline.
8. [ ] Record residue honestly, however small.

### 5.3 Race/boot verification (the strongest template for timing bugs)

1. [ ] **Pin the repro in a unit test FIRST, and it must fail on the pre-fix
       code.** The kit's boot-race pin is
       `tests/unit/clientui/bootstrap.test.tsx`: "adopts the injected form
       page when the injection lands AFTER context creation (the boot race)".
       A race fix without a failing-first pin is an unverified claim.
2. [ ] Cover the full order matrix in units, not just the bug: injection
       before first poll, injection after creation, never injected, plus the
       walked own-form fallback, and the source semantics on both adapters
       (`tests/unit/shared/context/contextAdapters.test.ts`). The fake
       context's `queryGate` option exists for exactly this class of test.
3. [ ] Live, expect the losing order NOT to occur naturally (current UCI still
       serves a functional deprecated Xrm.Page through the walk, which masks
       this race today). Do not call that verification: **stage the losing
       order deterministically** on the deployed FIXED bundle and observe the
       adoption happen.
4. [ ] Verify the unaffected path unregressed: the sitemap-hosted shell boots
       over the walk with no added delay.
5. [ ] Record host quirks learned in passing.

## 6. The accepted-untested register

These are claimed as designed-and-untested, in those words, everywhere they
are mentioned:

| Item | Why untested | Recorded in |
|---|---|---|
| The V8 synthesis path (pre-v9 metadata synthesis, the V8 adapter generally beyond its smoke boot) | No 8.x environment available; the v8 smoke proves the shell boots and the legacy FetchXML data path runs against the mock, not a real 8.x org | README; the roadmap |
| Offline behavior itself | Not verifiable from a desktop session; the metadata rework made the reads offline-CAPABLE (native store, host IWebApi), which is a design property, not an observed one | the roadmap |
| FLS against real column-security profiles | Org security deliberately not reconfigured; the capability flags are unit-tested against scripted descriptors only | the roadmap |
| The CI Package stage (and azure-pipelines.yml as a whole) | Never executed by a real pipeline. Executable-from-repo (the zip built and content-checked locally), not CI-executed | the decision log |

Rules:

- New work must NOT silently convert accepted-untested into claimed-working.
  Touching the V8 adapter and passing its unit tests does not make V8
  "supported"; it stays accepted-untested until an 8.x org run is recorded.
- If your change makes one of these testable, the live protocol in section 5
  applies, and the register entry (here, plus the roadmap/README mentions)
  gets updated in the same change.
- The model for leaving the register: an injection path shipped "accepted
  untested" at one release and was closed by a recorded live verification two
  days later. That is how an item leaves: a recorded live pass, not a
  re-wording.

## 7. The certified inventory: live-verified surfaces

What the kit has proven on a live org, with each claim's evidence pointer (all
rows are recorded history in the decision log and the roadmap's shipped
entries):

| Certified item | Evidence home |
|---|---|
| All five PCFs deployed as virtual controls, re-verified end to end after the virtual migration (render, value commit, save, host-driven update, no console errors) | the decision log; the roadmap's shipped entries |
| The samples hub boots inside a model-driven app; the company-search sample loads live rows, error-free | the decision log (the import exercise) |
| The counterparty grid live on the Account Activities subgrid as a dataset PCF, and as the webresource app `sample-counterparty-grid` | the decision log |
| The native-parity lookup live on a form, both shapes: `SmartNativeLookup` webresource and the field-bound PCF committing to the bound column | the decision log |
| The native-first metadata contract live: labels, options, formats, currency symbol, polymorphic targets resolved with exactly two kit raw XHRs; kit PCFs inside the native 2-3 render band under `&perf=true` | the decision log; the roadmap |
| The managed-solution machinery, import through uninstall: verification-namespace zip imported clean, webresources with deterministic ids verbatim, a bound control committing a Web-API-confirmed value, first-try uninstall back to exact baseline | the decision log; docs/deployment.md (the criterion and technique, public) |
| The injected-host adoption: KitShell.connect registered on a real form's OnLoad, the losing boot order staged deterministically on the deployed fixed bundle, adoption observed, sitemap path unregressed | the decision log |
| The kit's mobile posture and language/format behavior at both desktop and phone width (filled fields, the lookup's full-screen search, localized labels and formats) | the decision log's recent entries |

Use the inventory two ways: a change touching a certified surface inherits its
recorded baseline (regressing it is a finding even if verify stays green), and
a claim that a certified item broke needs at least the evidence class that
certified it (a live item is not "broken" on a unit-mock discrepancy; suspect
the mock first, then check the live behavior).

## 8. The adversarial-review method

The project's QA approach: several independent model reviewers, roles crossed
with models, findings verified against the code before anything is acted on.
How it works:

1. **Multiple independent reviewers, roles crossed with models**: adversarial
   architecture (a FastTrack/MVP lens), adversarial code (a senior
   inherited-maintainer lens), junior-dev friction. Run independently so
   consensus is informative (tag each finding with how many reviews saw it:
   more reviews means stronger consensus, not necessarily higher severity).
2. **Deduplicate into ONE ranked backlog** (ids, P0 blocker through P4
   docs/governance), each finding carrying a verification tag: **Verified**
   (checked against current code, file and line), **Plausible** (consistent,
   not traced), **Documented** (already a recorded decision; the reviewer is
   pressing for action). Nothing is acted on at Plausible.
3. **Triage into decisions, not just fixes.** Defects get fixed on a
   remediation branch. Items that are choices get decision-log entries so
   they are never re-litigated from the same finding. False positives get
   corrected in the plan itself.
4. **Fixes land in named commits**, verifiable in history.
5. **Claims are re-verified after remediation**, including live checks where
   the finding was live-behavioral.

To run a round at this standard: keep reviewer independence (no shared context
between reviewers), verify every finding against the code before ranking it,
and close the round with a decision entry recording the non-fixes alongside
the fixes.

## 9. How to add a test, per layer

Placement rule first: mirror the production path under `tests/unit/`, or the
control name under `tests/storybook/`. Then copy the named pattern file; do
not invent a new style.

### 9.1 Observable / util unit test

Pattern to copy: `tests/unit/shared/reactivity/Observable.test.ts` (utils
twin: `tests/unit/shared/utils/LibraryUtils.test.ts`; ViewModel twin:
`tests/unit/clientui/sample-counterparty-grid/CounterpartyGridViewModel.test.ts`).

```ts
// tests/unit/shared/reactivity/Observable.test.ts (real excerpt)
import { Observable } from "../../../../shared/reactivity/Observable";

it("notifies subscribers with new and old value", () => {
  const obs = new Observable<string>("a");
  const seen: Array<[string, string]> = [];
  obs.subscribe((next, prev) => seen.push([next, prev]));
  obs.value = "b";
  expect(seen).toEqual([["b", "a"]]);
});
```

### 9.2 Smart control test on the fake context

Pattern to copy: `tests/unit/shared/controls/smart/smartControls.test.tsx`.
Script the PascalCase attributeDescriptor payload; render through
`ViewModelContextProvider`; the host-owned value is an `Observable`.

```tsx
// under tests/unit/shared/controls/smart/
import { render, screen } from "@testing-library/react";
import { ViewModelContextProvider } from "../../../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { SmartTextField } from "../../../../../shared/controls/smart/SmartTextField";
import { createFakeViewModelContext } from "../../../../mocks/fakeViewModelContext";

it("resolves label/required/maxLength from metadata", async () => {
  const { context } = createFakeViewModelContext({
    attributes: {
      "account.name": { DisplayName: "Account Name", Type: "string", RequiredLevel: 2, MaxLength: 160 },
    },
  });
  const value = new Observable<string | null>(null);
  render(
    <ViewModelContextProvider context={context}>
      <SmartTextField entity="account" attribute="name" value={value} />
    </ViewModelContextProvider>
  );
  expect(await screen.findByText("Account Name")).toBeTruthy();
});
```

The same file holds the render-batching contract
(`describe("form-load render batching")`): a `React.Profiler` counts commits
and pins the heaviest field and the polymorphic lookup at `<= 2` (one loading
paint, one content paint). Any smart-control change that adds an async
resolution must keep those tests green; more commits is the regression the
batching rework spent a wave removing.

### 9.3 Presentational Storybook story on fixtures

Pattern to copy: `tests/storybook/controls/presentational/TextField.stories.tsx`.
One file per control under `Presentational Controls/`, one exported story per
state (Empty, Filled, Required, Disabled, ReadOnly, ...). Shared plain values
come from `tests/storybook/fixtures.ts`. The story plays the ViewModel's role:
it owns the Observable and the onChange.

```tsx
// tests/storybook/controls/presentational/, fixture data only, zero CRM mocks
import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { TextField } from "../../../../shared/controls/presentational/TextField";

const meta: Meta<typeof TextField> = { title: "Presentational Controls/TextField", component: TextField };
export default meta;
type Story = StoryObj<typeof TextField>;

const make = (initial: string | null) => {
  const value = new Observable<string | null>(initial);
  return { value, onChange: (v: string | null) => (value.value = v) };
};

export const Filled: Story = { render: () => <TextField label="Account Name" {...make("Contoso Ltd")} /> };
```

Smart-control stories (the sanctioned exception) copy
`tests/storybook/smart/SmartTextField.stories.tsx` instead and pull their
seeded context from `tests/storybook/smart/smartStoryHarness.tsx`; curate the
"Show code" snippet so it reads like real ViewModel/View code.

### 9.4 Smoke assertion

Pattern to copy: `tests/smoke/clientui.smoke.test.ts` (hooks twin:
`tests/smoke/clienthooks.smoke.test.ts`). Prefer adding an `it` to the
existing suite over a new suite; the suite already handles bundle loading,
prefix resolution from `kit.config.json`, and the missing-dist guard.

```ts
// inside tests/smoke/clientui.smoke.test.ts's describe block
it("boots the samples hub against a MODERN host", async () => {
  (window as { Xrm?: unknown }).Xrm = createModernXrmMock().xrm;
  const clientUI = loadBundle(); // require()s dist/clientui/<prefix>clientui.js
  await clientUI.bootstrap({ search: "?app=samples", xrmTimeoutMs: 2000 });
  await waitForContent(container, (html) => html.includes("Sample Apps"));
});
```

Legacy data-path assertions script a `FakeXhrServer` and prove the production
bundle's whole chain, adapter routing to DOM rows (the FetchXML
merged-activities smoke in the same file is the model).

Run `npm run build` before `npm run smoke`, always.

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0 (the section 2 baseline counts were re-run green that day). Sources:
`package.json` (scripts), `jest.config.mjs`, `docs/testing.md`,
`docs/deployment.md` (import criterion and technique), the decision log, the
roadmap's shipped entries, and the four `tests/mocks` and pattern test files
quoted above. Live-org rows are recorded history, not re-executed at porting
time.

Re-verification one-liners (PowerShell):

```powershell
npm run verify; $LASTEXITCODE                                          # the gate and its exit code
npm run check:pcf-floor                                                # floor numbers vs pcfs/platform-floor.json
Get-ChildItem shared,clientui,clienthooks -Recurse -Include *.test.*,*.stories.*   # must return nothing
Select-String -Path package.json -Pattern '"verify"'                   # gate order unchanged
```

Maintenance triggers: any item leaving or entering the accepted-untested
register (section 6, and mirror the roadmap), a new live-verified surface
(section 7), a change to the verify script order or the mocks' exports. When
this skill and the repo disagree, the repo wins; fix the skill.
