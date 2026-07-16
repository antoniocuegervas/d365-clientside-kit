---
name: d365kit-docs-and-writing
description: "House style and docs-of-record guide for the D365 Client-Side UI Kit repo: load before writing or editing any prose, meaning docs/, the README, CONTRIBUTING, code comments, JSDoc, Storybook story text, commit messages, or decision-log, roadmap, and gotchas entries; carries the docs map (one home per fact), the no-em-dash and no-doc-ID rules, the plain native D365 register with its vocabulary table, ready-to-copy entry templates, the README claims checklist, the oversell guard, and the pre-commit prose sweep."
---

# Docs and writing for the D365 Client-Side UI Kit

This skill governs every word written in this repo: markdown docs, the README,
code comments and JSDoc, Storybook descriptions, commit messages, and the
internal records (decisions, roadmap, gotchas). The prose is part of the
product. When this skill and the repo's files disagree, the files win, then
fix this skill.

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| The evidence register: what is verified, live-verified, or accepted untested | `d365kit-validation-and-qa` |
| The architecture rules themselves (three layers, MVVM) for a code decision | `d365kit-architecture-contract` |
| A D365/Dataverse term you do not recognize while reading or writing | `dataverse-clientside-reference` |
| Whether an argument was already fought and settled before you re-argue it | `docs/internal/decisions.md` (the decision log) |
| Fixing a live defect rather than writing about one | `d365kit-debugging-playbook` |
| Building, deploying, or exercising against a live org | `d365kit-build-and-env`, `d365kit-run-and-operate` |
| Producing the measurements or proofs a claim needs | `d365kit-proof-and-analysis-toolkit` |
| Contribution scope and merge rules | `CONTRIBUTING.md` |

## The docs of record: one home per fact

Every fact has exactly one home. Other docs link to that home; they do not
restate it. Real examples of the pattern working: the column-security behavior
is detailed once in `docs/gotchas.md` and the README says "See
[docs/gotchas.md](docs/gotchas.md)"; the five kit terms are "defined once in
the [glossary](docs/glossary.md)" and both the README and architecture.md say
exactly that; deployment.md's "Hosting the shell" section is cross-referenced
by name from four files rather than copied. When you add a fact, first decide
its home from the map below, then link from everywhere else it matters.

### Public docs (audience-facing)

| Doc | Its one job, and what belongs there |
|---|---|
| `README.md` | The front door: what the kit is, the delivery model (develop as a webresource, ship as webresource or PCF), when to reach for it (and when not), getting started, provenance, Status. It sells, orients, and links in two to three minutes; public claims start here, details live in the owning doc below. |
| `CONTRIBUTING.md` | The two ways to engage (template copy vs fork), what is in and out of scope, and the authoring-style rules for contributors and their coding agents. |
| `AGENTS.md` | The agent guide: the load-bearing constraints and the pointers, for coding agents working in the repo. |
| `docs/adding-a-webresource-app.md` | Ship your first app: folder, registration, Storybook scenario, launch, RecordReady, rules of the road. |
| `docs/adding-a-pcf.md` | The PCF path: prerequisites, scaffold, the integration patterns, build, deploy, and the deployed-name and cross-publisher identity rules. |
| `docs/adding-a-client-hook.md` | Form/ribbon/grid handlers in the `CrmClientSide` UMD bundle; hooks are templates, app logic stays in ViewModels. |
| `docs/component-catalog.md` | Which control per field type and tier, and the choosing-a-tier rules. |
| `docs/control-configuration.md` | The smart-control config reference: value Observable types, real import paths, per-control props, what never to hand-configure. |
| `docs/glossary.md` | The five kit terms (presentational, smart, ViewModel, Observable, observe), defined once. |
| `docs/architecture.md` | The three-layer contract, the adapter diagram, boot flow, the one-bundle decision, host parity. |
| `docs/architectural-stance.md` | Why MVVM + Observables + class components, the rules, and the note to future reviewers. The anti-modernize doc. |
| `docs/how-it-compares.md` | The comparison home: canvas apps, custom pages, code apps, the UX-parity judgement call, and when the kit is the wrong tool. |
| `docs/prompt-friendly-development.md` | The agent workflow: which sample to few-shot per requirement shape, the patterns agents default to, the prompt templates, and the webresource-to-PCF hand-off. |
| `docs/testing.md` | The test layers, commands, shared mocks (reuse, don't reinvent), conventions, the manual sandbox checklist. |
| `docs/deployment.md` | The operational book: artifacts, SPKL, hosting the shell, the Fiddler inner loop, cache busting, PCF deploy and the platform-library floor, the ALM chapter, the versioning policy, CI. |
| `docs/gotchas.md` | Sharp edges not obvious from the type signatures, symptom-first. |
| `skills/` | Task guides for coding agents; `skills/README.md` explains installation and configuration. |

`docs/media/` holds the images the README references.

### Internal docs (tracked, background not required reading)

| Doc | Its job |
|---|---|
| `docs/internal/decisions.md` | The decision log. Its own header states the anatomy: "what was decided, why, and what would make us revisit it." Newest entries at the bottom. |
| `docs/internal/roadmap.md` | Open directions, smaller follow-ups, Shipped, Parked. Each parked idea carries its reason and revisit triggers. |
| `docs/internal/REBUILD-SPEC.md` | The founding spec: mission, contracts, exclusions. Background and historical reference; do not casually edit it to match later reality, later reality is recorded in decisions.md. |

## House style, rule by rule

### 1. No em dashes anywhere

Comments, JSDoc, markdown, commit messages, user-facing strings. Use a comma,
colon, parentheses, or a period. The repo is written to read as one authored
voice, and this is its strictest tell.

- Wrong: `The shell polls for Xrm` [em dash] `a visible timeout error appears if none is found.`
- Right: `The shell polls for Xrm, with a visible timeout error if none is found.`

Ranges use plain hyphens ("350-750 KB", "2-3 band").

### 2. No internal doc-ID citations in tracked source or commit messages

The IDs (`D-xxx` and the spec's section labels) are labels inside
`docs/internal` (decisions.md and the spec use them legitimately). A consumer
reading source or `git log` has no key to them, so a citation is noise to the
only audience that matters there. CONTRIBUTING.md states it for contributors.

- Wrong (comment): `// Surface renders inline per D-0NN.`
- Right: `// Renders in place: a document-level portal mounts where the theme's CSS variables do not reach.`
- Right (commit body): "The decision log records the alternatives (a grace
  window, a contract handshake)", pointing at the log without a number.

### 3. Plain native D365 register

Write like a hands-on D365 customizer talking to a colleague, not a
platform-tooling insider or a React conference talk.

The four tells to hunt:

1. **Imported metaphor**: a metaphor whose home is another domain
   (refactoring, frontend, writing craft, retail, signal theory).
2. **Nominalisation**: a concrete action turned into an abstract noun.
3. **Rhetorical balancing**: antithesis, rule of three, "not X but Y", tidy
   aphoristic closers.
4. **Meta-commentary**: prose narrating its own structure.

Decision rule: would a senior D365 dev say this out loud to a colleague? If
no, flag it. Do not swap a borrowed abstraction for another borrowed
abstraction; when unsure of the native term, ask.

The applied vocabulary (all before/after pairs are real edits):

| Found | Replace with | Example edit |
|---|---|---|
| `seam` / `programmable seam` | `extension point` / `programmable extension point` | "but need a programmable seam." became "but need a programmable extension point." (README) |
| `surface` as a UI location or deployed customization | the literal thing: `custom UI`, `webresource or PCF`, or drop it | "ship a handful of UI surfaces across an implementation" became "ship a handful of custom UI pieces" |
| `surface` as an API area | `API` / `area` | "mirrors the native Xrm surfaces" became "mirrors the native Xrm APIs" |
| `host` where the runtime is concrete | name it: `the model-driven app`, `modern UCI`, `webresource or PCF` | "the model-driven host's aggressive caching" became "the model-driven app's aggressive caching" |
| `off-brand` | `drift from the native look` | |
| `the kit's band` | `the kit's scope` | |
| meta-commentary labels (`Short version:`) | cut them, keep the sentence | |
| nominalisation | say the action | "That comprehension step is a feature." became "Having to read it to change it is the point, not a chore." |
| borrowed UI jargon (`chrome`, `affordance`, `glyph`) | the literal thing: the interface text, the labels, a back button, a symbol | applied repo-wide; see the commit history |

Kept on purpose, do NOT "fix" these:

- The README provenance line: balanced on purpose, carries a real point.
- `ergonomic` / `ergonomics`: accepted dev/Xrm usage ("form-designer
  ergonomics").
- `Presentational purity`: the lint actually enforces it, so the term carries
  weight.
- The architectural-stance closer ("Optimizing this codebase for
  React-conference aesthetics would optimize it away from its users."):
  deliberate punchy ending.
- `host` as the collective noun over all three runtimes where that
  abstraction is the point (the architecture diagram's "Dynamics hosts",
  "Host parity", "Hosts own state"), and the host-owned-state concept in
  control docs and stories.
- `native parity` / `native-parity`: the kit's own established vocabulary.
- `takeover` for the lookup's full-screen search: tied to the code's own
  naming.
- The verb `surface` ("surfaces a commit failure"): idiomatic.
- Code identifiers (`hostSurface.ts`, `formContextSurface`, `host.params.*`,
  `styles.surface`): not prose.
- `source of truth`: standard dev lingo, not a tell.

### 4. The legibility bar: orient before commands

When the repo takes over work the platform normally does invisibly, the doc
must first make the invisible work visible, in this order: what the artifact
is, who normally produces it, why this repo produces it instead, a
committed-vs-generated file map, and only then the commands. Self-check: a
reader new to the internals can say what each generated file is for and why
the platform is not needed.

The model to imitate is deployment.md's section "Inside the zip: what the org
normally writes, and why this repo writes it instead". It opens by naming the
reader's real position ("You can have customized Dataverse for years,
imported and exported solutions weekly, and never once looked inside one."),
gives the anatomy, the normal author, the forcing constraints, a file-by-file
table with a "Committed or rendered" column, and only after all that the
build commands. Any new machinery doc (a build step, a generator, a packaging
wrapper) gets this treatment before its command block.

### 5. Code comment voice

Comments state constraints the code cannot show. The best current example is
the `LazyFormBinding` JSDoc in `shared/context/hostSurface.ts`: "The form page
is a SOURCE, not a boot-time snapshot: the clienthooks injection arrives
through getContentWindow's promise on the form's own schedule, so it can land
after the context was already built from the frame walk." Nothing in the types
says that; the comment is the only place the timing constraint lives. That is
what comments are for.

- Public exports keep `/** */` JSDoc, written plainly in the maintainer's
  voice. No essays, no flourish.
- In-file sectioning is `//#region` / `//#endregion`, never `// --- banner ---`.
  Real example, `clientui/apps/sample-opportunity-search/OpportunitySearchViewModel.ts`:
  `//#region Filter fields (bound by smart blocks in the View)` ...
  `//#endregion`.
- FetchXML is authored as multi-line, indented, single-quoted template
  literals that read as XML and paste into a FetchXML tool. Interpolated
  values go through `LibraryUtils.escapeXml`, no exceptions. The same
  ViewModel shows the pattern: `const esc = LibraryUtils.escapeXml;` then
  conditions like
  `<condition attribute='name' operator='like' value='%${esc(this.topicContains.value)}%' />`.
- Smart field controls signpost what `SmartFieldBase` does for them, so a
  reader of one control learns the shared machinery. 2-space indent.
- Storybook component descriptions state the contract, not vibes: values in,
  events out, what the host supplies, and the smart counterpart. Model,
  `TextField.stories.tsx`: "The contract is values in, events out: `value` (an
  Observable or a plain string) plus `onChange`, with label, required,
  disabled, readOnly, errorMessage, and hint all supplied by the host."

### 6. Commit message style

Before writing one, read the room: `git log --oneline -30`. The current
register is lowercase, narrative, and claim-shaped: the subject states what is
now true of the system, usually with a colon or semicolon splitting the claim
from its consequence. Real subjects, verbatim:

- `the injected form page is a live source: a fast boot no longer loses the clienthooks injection`
- `the kit solution zip is a build, not a download: releases carry the sample solution only`
- `kit fields adopt the platform's new look: field controls default to the filled appearance, and the date and time field gains a responsive layout and a corrected time list`

Older history carries conventional prefixes (`docs:`, `feat:`, `fix:`); do
not resurrect them, follow the current register. Bodies are prose paragraphs,
not bullet dumps: what changed, why, and how it was verified, with a plain
pointer to the decision log where one applies (no entry numbers).

No em dashes, no doc-IDs, in subjects or bodies.

## Templates

### A decision entry (`docs/internal/decisions.md`)

Title format is `## D-0NN, <claim>`: a comma after the number, then a
lowercase claim-shaped title, often colon-split. Newest entries go at the
bottom; take the next free number. An entry is a record, not an essay: state
the decision, the reason, one line of verification, and the revisit trigger,
then stop. The earliest entries in the file are the model; aim under 150
words, and a wave entry that bundles several decisions lists them with 300
words as the ceiling. Do not model a new entry on the longest existing ones.
Numbering never changes: later developments append a dated sentence to the
same entry, and a reversal marks the OLD entry loudly at its top and keeps it
as history ("**REVERSED by ... do not build on this entry.**").

```markdown
## D-0NN, <claim-shaped title: what is now true, and its consequence>

<The decision and the reason, a few sentences: the constraint or finding
that forced the choice and what tipped it. Only what the next reader needs.>

<Verification, one line: "Verified live on the dev org (YYYY-MM-DD): ..."
or the honest label (accepted untested, best-effort).>

Revisit trigger: <the concrete condition that reopens this, not "someday">.
```

### A roadmap direction entry (`docs/internal/roadmap.md`)

```markdown
## Direction: <name>

### The gap
<What the platform or the kit cannot do today, stated concretely, with the
platform facts that make it a real gap.>

### The idea
<The deliverable and its shape: which tier it lands in, the interface or
refactor it needs, the files it touches. An interface sketch is welcome.>

### Why later
<What it waits on, and why now is not the time.>
```

Status vocabulary, from the file's own practice: when a direction ships it
MOVES under `## Shipped (were roadmap items)` with the date and a pointer to
the decision entry, plus what remains pending; a parked idea moves under
`## Parked` with its reason and explicit "Revisit triggers: ...". Bounded
items live under "Smaller follow-ups" with dated caps-status markers (DONE,
PARTIALLY DONE, EVALUATED AND CLOSED, SUPERSEDED). A retired direction says
where the work went instead.

### A gotchas entry (`docs/gotchas.md`)

Symptom-first heading, then mechanism, then the fix or convention. Real
heading models: "A PCF redeploy needs a manifest version bump, or the platform
serves the old bundle"; "`overflowY: \"auto\"` also turns on a left-right
scrollbar" (whose body literally opens "What you see:").

```markdown
## <Symptom or rule as a sentence: what you see, or what X needs, or what Y does>

<What you see: the observable behavior, so the entry is findable from the
symptom. Include the misleading part ("looks like it did not deploy").>

<The mechanism: why the platform or the kit behaves this way. Name the exact
members, files, and platform behaviors; say which parts are documented
platform contract and which are tested convention.>

<The fix or the convention, with a copy-paste snippet where one exists, and
the escape hatch if the convention ever regresses.>
```

### README claims edit checklist

Run this before changing any sentence in the README (and any public claim
elsewhere; the README summarizes, the owning doc details, update both or
neither):

1. Does the evidence support the claim today? (`d365kit-validation-and-qa`
   holds what is verified, live-verified, and accepted untested.)
2. Is unproven capability labeled inside the claim itself? Model: the v8 path
   "has not yet been exercised against a live 8.x org; treat it as
   best-effort until then" (README, the delivery-model section).
3. Does a decaying claim state its re-verification cadence? The
   maintained-claim pattern, README Status verbatim: "Native fidelity is a
   maintained claim, not a static property" and the part to revisit is "the
   webresource shell's bundled Fluent and theme tokens against live UCI,
   roughly twice a year."
4. If a promise is being retired, does the commit say so plainly? Model: "the
   kit solution zip is a build, not a download: releases carry the sample
   solution only".
5. House style holds: no em dashes, native register, links to the owning doc
   instead of restated detail.

## The oversell guard

Unproven stays labeled. The labels in live use, with their homes:

- **best-effort**: the v8/CRM 8.x path (README), entity icon URLs ("a tested
  convention carried from production, not a documented platform contract",
  gotchas.md).
- **a tested convention, not a documented API**: the `?savedQuery=` +
  `$filter` composition (gotchas.md names the fallback per surface).
- **accepted untested**: a release may ship a path with exactly that label;
  the label is what makes the gap findable and closable later, which is the
  point of labeling.
- **recorded / observed live**: verification statements carry dates and
  evidence.

Two lessons from the recorded claims audits. First, kit claims that
overreached were rescoped, not defended: an over-broad parity claim was cut
down to "parity is promised for success shapes and flow control, and the
rejection shapes are documented as host-coupled". Second, reviewer claims
that failed verification were recorded too, so the next round does not
re-raise them. Either direction, the check gets written down.

The CI posture is settled and recorded: the gate is local by choice,
`azure-pipelines.yml` is a reference definition for forks (connected to no
service, never run), and deployment.md's CI section states exactly that. Do
not amplify CI claims past it in any doc edit.

Rule of thumb: write the claim you can point at evidence for today, label the
rest, and prefer rescoping a claim to defending it.

## Pre-commit prose checklist

1. Em dashes: `git diff --cached | Select-String -Pattern ([char]0x2014)`
   returns nothing.
2. Doc-IDs: no `D-0xx` or spec-section labels in staged source, public docs,
   or the commit message (docs/internal may label with them).
3. Placeholders: committed examples use the `new_` prefix and
   `yourorg.crm.dynamics.com`; no real org host or secret in the staged text.
4. Register: read the diff as a hands-on D365 customizer; swap
   seam/surface/host per the vocabulary table, and check the kept-on-purpose
   list before "fixing" anything on it.
5. Each new fact sits in its one home doc; everywhere else links instead of
   restating.
6. Claims: unverified capability carries its label (best-effort, accepted
   untested); README claims match the evidence.
7. Machinery docs orient before commands: artifact, normal author, why the
   repo, committed-vs-generated map, then commands.
8. Comments state constraints the code cannot show; `//#region` sectioning;
   FetchXML literals escape through `LibraryUtils.escapeXml`.
9. Commit subject is lowercase and claim-shaped; body is prose with the
   verification.
10. A decision-worthy change has its decisions.md entry at the bottom, next
    free number.

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: the decision log, `docs/internal/roadmap.md`,
`CONTRIBUTING.md`, `README.md`, every guide under `docs/`,
`shared/context/hostSurface.ts`,
`clientui/apps/sample-opportunity-search/OpportunitySearchViewModel.ts`,
`tests/storybook/controls/presentational/TextField.stories.tsx`, and `git log`
(subjects and bodies).

Re-verify before trusting the volatile parts (PowerShell):

- Commit register: `git log --oneline -15`
- Em-dash state: `Get-ChildItem docs,shared,clientui,clienthooks,tests,scripts,README.md,CONTRIBUTING.md -Recurse -File | Select-String -Pattern ([char]0x2014)` (expect empty)
- Latest decision number and anatomy: `Select-String -Path docs/internal/decisions.md -Pattern '^## D-0' | Select-Object -Last 3`
- Roadmap section vocabulary: `Select-String -Path docs/internal/roadmap.md -Pattern '^## '`
