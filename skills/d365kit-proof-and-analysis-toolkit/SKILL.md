---
name: d365kit-proof-and-analysis-toolkit
description: "Proof toolkit for the D365 Client-Side UI Kit repo, the first-principles experiment recipes behind 'prove it, don't just believe it': load when a platform behavior is undocumented or doubted, when a known limitation may have silently changed and wants a re-probe, when a race or timing-dependent bug needs deterministic staging, when what the platform keys on must be established by experiment, when an under-documented data shape needs its encodings pinned, when a rendering or load-time claim needs Profiler counts or an A/B twin, when docs claims need auditing against the artifact, or when a repo-built artifact should be diffed against the platform's own output."
---

# The proof and analysis toolkit

This project runs on a single epistemic rule: a claim is worth exactly its
evidence. The platform under the kit (Dataverse, UCI, PCF hosting) is
under-documented, moves in waves, and behaves differently on a live form than
in any harness, so belief-based engineering fails here in slow, expensive
ways. This skill is the method library: eight recipes, each a repeatable
experiment design with a worked example from this repo's own history and a
pointer to its record in the decision log (`docs/internal/decisions.md`).
None of them is theory; every one has been run here at least once.

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| Triage of a live defect from its symptom (something is broken NOW) | `d365kit-debugging-playbook` |
| Whether this exact question was already answered and settled | the decision log (`docs/internal/decisions.md`) |
| The instruments themselves (`&perf=true`, DevTools, source maps, harness) without an experiment design | `d365kit-diagnostics-and-tooling` |
| Routine test authoring, the evidence bar for ordinary changes, live-verification protocol detail | `d365kit-validation-and-qa` |
| The hands for any org-touching step below: deploy, publish, exercise, uninstall | `d365kit-run-and-operate` |
| Dataverse/PCF/webresource domain concepts and vocabulary | `dataverse-clientside-reference` |
| The architecture rules an experiment must not violate | `d365kit-architecture-contract` |
| Environment setup before anything runs | `d365kit-build-and-env` |
| Config axes and version mechanics (kit.config.json, floors) | `d365kit-config-and-versioning` |
| Writing the results up in house style | `d365kit-docs-and-writing` |

## Choosing a recipe

| You are facing | Recipe |
|---|---|
| A "known platform limitation" you are about to build or maintain around | 1. The platform re-probe |
| Not knowing what the platform actually keys on (names, ids, namespaces) | 2. The identity experiment |
| A bug explained with "timing-dependent" or "sometimes" | 3. Deterministic race staging |
| Consuming a data shape the platform serves but does not document | 4. Encoding pinning |
| Attributing a cost to the kit when the platform contributes its own | 5. The A/B twin measurement |
| Any claim about render frequency or batching | 6. Paint-count proofs |
| Docs of unknown freshness, or a release about to restate claims | 7. The claims audit |
| The repo hand-writing an artifact the platform normally writes | 8. The ground-truth artifact diff |

---

## Recipe 1: the platform re-probe

**When to use.** Before building around, documenting, or pinning against a
"known platform limitation" (a version ceiling, a missing capability, a
rejected path) whose evidence is older than the current platform wave. Also
when an existing design carries recurring maintenance (a pin, a runbook, a
budget) that exists ONLY because of such a limitation: the maintenance cost is
the signal to re-test the premise.

**Preconditions.** The original limitation's record located (which decision
entry, what exactly was measured, when). Access to a dev org for the deploy.
The ability to build a minimal probe artifact.

**Steps.**
1. Find the original measurement. If no record exists, you are not re-probing,
   you are probing for the first time; do it anyway, then record it.
2. Design the smallest artifact that isolates ONE platform question. Strip
   everything else: the kit's virtual-controls probe did nothing but
   feature-detect Fluent exports and read versions at runtime.
3. Keep the probe out of the repo: an untracked scratch wrapper named
   `pcfs/_<name>` (the floor checker and the size report skip `pcfs/_*` by
   naming convention), never a tracked project. Note that a pac-generated
   wrapper embeds your publisher name in its rendered Solution.xml, so keep
   the folder untracked and out of any careless `git add .`.
4. Deploy and observe AT RUNTIME, not at build or import time. What the
   platform serves can differ from what the manifest declares (the recorded
   finding: declare low, receive current).
5. Record the answer with dates and version numbers. The wave moves; the
   answer is a dated fact, not a permanent truth.
6. If the limitation dissolved, size the consequences before celebrating: list
   everything (pins, runbooks, budgets, doc claims) that exists only because
   of the old answer.

**What counts as conclusive.** Runtime observation on the live org: feature
detection of the actually served module, version reads from the actual window.
Documentation, the CLI template, and the declared manifest version are all NOT
the delivery and prove nothing about it. Both a "still closed" and a "now
open" answer must carry the probe date.

**Worked example: the virtual-controls re-probe.** An earlier era had closed
the platform-library path: the platform pinned its Fluent v9 platform library
at 9.46.2, the kit used newer APIs, and a virtual control rendered to nothing.
The re-probe's own words in the decision log: "That conclusion was correct
when measured and is now stale." Re-tested 2026-07-02 on a live dev org with a
throwaway `control-type="virtual"` probe control: the org REJECTED an import
declaring Fluent 9.68.0 ("not supported by the platform") yet accepted 9.46.2,
and at runtime served React 17.0.2 plus a Fluent bundle containing every
probed post-9.46.2 export, matching the org's platformlibs script. One tabster
on the page (the host's own), so the entire bundled-tabster problem class was
structurally impossible under platform-provided Fluent. Probe bundle: 13 KB
versus the kit's then 350-750 KB standard bundles. The re-probe triggered the
migration of all five PCFs to virtual controls and retired the pin plus its
per-wave re-pin runbook.

**Cost.** Org needed: yes; roughly a day including deploy loops. Results
recorded: a decision entry (what was re-tested, what changed, what it opens,
what the migration would cost), plus edits wherever the old limitation was
stated as current.

---

## Recipe 2: the identity experiment

**When to use.** You need to know what the platform actually keys on
(prefixes, unique names, namespaces, component ids) and the documentation is
silent or ambiguous. Typically before an import, a rename, a fork, or any
claim about coexistence.

**Preconditions.** A written list of the candidate identity dimensions in
play. A rollback design for EVERY attempt, written before the first attempt.
Baseline queries captured before anything runs.

**Steps.**
1. Enumerate the identity dimensions (the kit's set: publisher prefix,
   solution unique name, control `namespace.constructor`, webresource
   name-derived ids).
2. Construct artifacts that differ in exactly ONE dimension per attempt. Two
   changed dimensions make the platform's answer unreadable.
3. Run cheap read-only pre-checks first and let them stop the run. A stopped
   run that sharpens the criterion is a successful experiment.
4. Let the platform's acceptance or rejection BE the measurement. Read
   rejection messages literally; they name the key.
5. Roll back and re-query to baseline after every attempt, pass or fail.
   "Rolled back" is a claim; the re-query is its proof.
6. Fold each learned key into the written criterion (docs of record), so the
   next person inherits checks, not folklore.

**What counts as conclusive.** The platform's own accept/reject on a real
operation, plus a post-rollback re-query matching the captured baseline. A
pre-check that passes is NOT proof the operation will: the kit's second import
attempt passed all pre-checks and was still rejected, which is precisely how
the third identity dimension was discovered.

**Worked example: the release import verification, three attempts, one
dimension per attempt, each attempt teaching a key.**
- Attempt 1 (prefix disjointness: the zip on the committed `new_` default
  against the org's differently-prefixed install) was STOPPED by its own third
  read-only pre-check: an unmanaged solution already held the zip's unique
  name (the live spkl deploy target). Key learned: solution unique names are
  org-global and prefix-independent. Nothing imported.
- Attempt 2 (that solution deleted; all pre-checks empty) was rejected by the
  platform itself: "Custom Control with name D365Kit.KitCounterpartyGrid
  already created by another publisher." Key learned: custom-control identity
  is the UNPREFIXED `namespace.constructor` pair, org-global ACROSS publishers
  (webresources are prefix-scoped, PCF controls are not), and a passing
  pre-check is not proof: the rejection message names the key. Rollback
  verified by re-query.
- Attempt 3 changed exactly ONE dimension (a throwaway manifest namespace in
  the five controls) and everything held: clean managed import, deterministic
  webresource ids verbatim, a bound control committing a Web-API-confirmed
  value, the shell booting live rows, first-try uninstall back to the captured
  baseline.

The learned keys are now the three-check clean-for-this-zip criterion in
`docs/deployment.md` and the cross-publisher identity rule in
`docs/adding-a-pcf.md` (all three attempts in the decision log's dated
addenda).

**Cost.** Every import and delete touches the org; hours per attempt including
pre-checks and rollback verification. Results recorded: dated addenda on the
driving decision entry, plus the doc-of-record criterion so the experiment
never needs re-running to be believed.

---

## Recipe 3: deterministic race staging

**When to use.** A bug or behavior is explained with "timing-dependent",
"sometimes", "only on warm boots", "cache-dependent". Also whenever a race FIX
is claimed: a fix for a race you cannot stage is a fix you cannot verify.

**Preconditions.** A mechanism hypothesis written as an order of events (who
writes, who reads, what is captured when). Identification of the MASK:
whatever makes the losing order rare in the wild.

**Steps.**
1. Narrate the mechanism as ordered events. If you cannot write the order
   down, you do not understand the race yet; stop and instrument.
2. Pin EVERY order in unit tests at the seam where the order is decided. The
   losing order's test must FAIL on the pre-fix code; that failing test IS the
   reproduction, and it outlives everyone's memory.
3. Identify the mask. In the kit's boot-race case the mask is that current UCI
   still serves a functional deprecated `Xrm.Page` through the ancestor-frame
   walk, so the injection "won" every natural boot and the race never showed.
4. Stage the losing order live: remove the mask in a controlled copy and force
   the late order by hand.
5. Observe the fixed behavior (adoption) deterministically, on demand, not
   statistically over reloads.
6. Keep both proofs: the unit tests as permanent regression pins in the gate,
   the live staging recorded in the decision entry.

**What counts as conclusive.** The losing order forced on demand, failing
pre-fix and passing post-fix, in unit tests AND (for platform-touching
contracts) staged once on the live host. "We could not reproduce it" is not a
conclusion; it usually means the mask is still on.

**Worked example: the injected-host boot race.** The mechanism narrated as
ordered events: the shell polls findXrm; the injected FORM PAGE was captured
exactly once at context creation; KitShell.connect injects asynchronously from
OnLoad; so a warm boot's first poll could beat the injection and the late form
page was never adopted. The proof kept both halves:
`tests/unit/clientui/bootstrap.test.tsx` pins every order (the "boot race"
test, injection AFTER context creation, FAILS on pre-fix code) and
`tests/unit/shared/context/contextAdapters.test.ts` pins the live-source
semantics per adapter; live, the losing order was STAGED on the deployed fixed
bundle (stripped Page plus deliberately late injection), adoption observed on
demand, sitemap boot unregressed. The decision log carries the full narrative.

**Cost.** The unit half is free and local, no org. The live staging needs the
org; about an hour once the mechanism is written down. Results recorded: the
decision entry's Verification section names the orders; the regression tests
are the permanent artifact, running in every `npm run verify`.

---

## Recipe 4: encoding pinning

**When to use.** The kit must consume a data shape the platform serves but
does not document (the metadata store's PascalCase `attributeDescriptor`
members are the canonical case). Before trusting any single observed encoding
of such a shape.

**Preconditions.** Live access to the real source, because only the live store
shows what is actually served. A designated single decoder file; if reads of
the undocumented members are scattered, centralize FIRST.

**Steps.**
1. Centralize every read of the undocumented members into one file whose
   header states the posture. The kit's is
   `shared/metadata/attributeMetadataReads.ts`. A platform wave that shifts an
   encoding must break one file with a dense test suite, not the smart tier.
2. Probe the live source per member KIND consumed, not just the members you
   happen to have seen; record which kinds were probed and the date.
3. Write tolerant decoders: accept every observed encoding (a label as a plain
   string or an OData-style label object; an enum as a number, a string, or a
   `{ Value }` wrapper; an option list as an array, a keyed object, or
   `{ Options }`), because "which encoding" is exactly the part with no
   contract, and the kit's own OData synthesis emits the OData flavors.
4. Pin every observed encoding in the decoder's test suite, literally.
5. Define the degrade for anything unrecognized (in the kit: kind "other",
   flags false, extras undefined) so a future new encoding fails soft and
   visibly instead of weirdly.

**What counts as conclusive.** Each consumed member kind observed on the live
store at a recorded date, with the decoder's tests pinning those literal
encodings. A shape that passes in the harness proves nothing about the store;
the harness only serves what you taught it.

**Worked example: the metadata encoding pinning.** The metadata contract
passes the platform's EntityMetadata through untouched (the standard-shape
rule); the rich attribute data sits under-documented in `attributeDescriptor`.
Every decode lives in `attributeMetadataReads.ts`, and the OData synthesis
path (pre-v9 primary, everyone else's fallback) adapts TOWARD the standard
shape so the same decoders serve both. The live probe record (in the decision
log, dated): the store's encodings match the reads helpers on every probed
kind: strings, numeric RequiredLevel and Behavior, array OptionSets, Targets,
FLS booleans, and revenue PrecisionSource 2. The pinned suite:
`tests/unit/shared/metadata/attributeMetadataReads.test.ts` covers required
level in numeric, OData-string, and `{ Value }`-wrapped encodings, column
security flags, kind resolution including bare and `{ Value }`-wrapped
AttributeTypeName, date-only detection, PrecisionSource, and option lists in
array, keyed, and Options-wrapped encodings.

**Cost.** The live probe is read-only org access (an hour or two in the
console per probe pass). The decoder and suite are ordinary local work inside
the gate. Results recorded: the decoder file's header (the posture), its test
suite (the pins), and the decision entry (the dated record of what was probed
and when).

---

## Recipe 5: the A/B twin measurement

**When to use.** Any "the kit adds X" claim: load time, renders, size,
network. The platform contributes its own cost to every number you can
capture, so an absolute number attributes nothing.

**Preconditions.** A twin that differs from the subject in exactly the kit
dimension. An identical, written measurement protocol. Acceptance that org
load, cache state, and day-of-week drift can swamp small deltas.

**Steps.**
1. Capture the absolute number first, with a defined protocol (which form,
   which KPI, how many reloads, warm or cold). It bounds the problem and is
   publishable on its own with honest caveats.
2. Build the twin differing ONLY in the kit's presence.
3. Recorded trap 1: build the twin form in the form designer, NOT via the raw
   API. An API-created systemform defaults to `formpresentation` 0 and never
   joins the entity's form order, so UCI ignores it even with `&formid=` and
   an app publish.
4. Recorded trap 2: clear the client-side form cache between publishes
   (IndexedDB and localStorage, the `docs/gotchas.md` guidance) or you measure
   the cache, not the form.
5. Interleave subject and twin measurements within one session. Different days
   are effectively different orgs for this purpose.
6. Publish the honest scope. `docs/deployment.md` prints two measurement
   sessions and says outright "the two sessions are not a controlled A/B";
   imitate that restraint.

**What counts as conclusive.** Subject and twin measured in the same session
under the same protocol, with a delta larger than the observed within-session
spread. Anything less ships as an absolute datapoint with caveats, which is
exactly what the repo currently does.

**Worked example (partially done; the open half is a ready-made task).** The
form-load impact item in `docs/internal/roadmap.md`. Done half: a sample
Contact main form carrying four kit PCFs plus the timeline opens warm in
roughly one to one and a half seconds (four warm full reloads; UCI page-load
KPI via the `&perf=true` overlay), published in `docs/deployment.md` with the
explicit not-a-controlled-A/B caveat. Open half: the kit-free twin-form delta
has never been run; the roadmap records both traps above specifically for
whoever runs it.

**Cost.** Org needed: yes; about half a day for a proper interleaved run.
Results recorded: `docs/deployment.md` datapoints with protocol and caveats;
the roadmap item closes when the delta lands; a decision entry only if the
result changes a posture.

---

## Recipe 6: paint-count proofs

**When to use.** Any claim about rendering frequency or batching: "renders
once", "no excessive rendering", "one paint per load", in a review, a doc, or
a perf fix. Rendering claims are proven with counted Profiler commits, not
eyeballs on a flame chart.

**Preconditions.** The component rentable in the unit stack against the fake
context. React Profiler (already in the test stack). A worst case chosen
deliberately.

**Steps.**
1. Define the contract as a NUMBER of commits, not an adjective. The kit's
   smart-field contract: one loading paint plus one content paint, so Profiler
   commits <= 2.
2. Wrap the subject in `React.Profiler` with an `onRender` counter and drive
   it through its real async resolutions via the fake context.
3. Pin the worst cases, not the easy ones: the heaviest field (most async
   resolutions racing toward one commit) and the known-chatty control.
4. Assert the ceiling. The test comment states why: anything more is a
   regression toward one-repaint-per-resolution.
5. Corroborate live with the platform's own instrument (the `&perf=true`
   excessive-rendering flags), but treat that as corroboration. The test is
   the proof, because it runs on every verify.

**What counts as conclusive.** A Profiler-counted commit ceiling asserted in a
test that runs in the gate, plus, for form-level claims, the live overlay
agreeing. DevTools inspection is diagnosis, not proof.

**Worked example: the render batching.** Before: the UCI perf monitor showed
the lookup PCF at five form-load renders versus the platform's own 2-3 (each
async resolution landed in its own write, each write painted). After
SmartFieldBase batches metadata, formatting, and subclass extras into one
commit, the contract is Profiler-pinned:
`tests/unit/shared/controls/smart/smartControls.test.tsx`, describe
"form-load render batching", with a `countCommits` harness; "SmartNumberField
paints twice: loading, then everything at once" (the heaviest case: metadata,
locale formatting, record currency, org pricing precision, four async
resolutions, one content commit) and "SmartNativeLookup paints twice with
switcher labels and the selected icon in place" (the known-chatty polymorphic
case). Live corroboration (recorded): with `&perf=true` on the sample Contact
form, no kit control is flagged for excessive rendering while the native
lookup twin flags at 3 and native section containers at 2, so the kit sits
inside the platform's own band.

**Cost.** Free and local for the tests; no org. The live corroboration needs
an org session. Results recorded: the contract lives in the test file itself
with its rationale comment; the posture change in the decision entry.

---

## Recipe 7: the claims audit

**When to use.** Before a release, after a big rework, or when inheriting docs
of unknown freshness. The method: enumerate what the docs claim, verify each
claim against the artifact, and record the casualties so nothing is claimed on
momentum.

**Preconditions.** The docs-of-record list (README, `docs/*`,
`docs/gotchas.md`, control docs). Time budgeted to EXERCISE claims, not just
re-read them.

**Steps.**
1. Enumerate claims as testable statements: parity claims, capability claims,
   "the repo can X" claims, CI claims, "the shell prefers Y" claims.
2. Sort each into: verified against the artifact; rescopable (true in a
   narrower form); executable-but-unexecuted (the prose is right, nothing runs
   it); wrong.
3. For each casualty choose one of three fates: fix the artifact, rescope the
   claim, or record the gap with an explicit trigger. Never leave the claim
   standing unmodified.
4. Record disproved REVIEWER claims too, with the reasoning, so the next round
   does not re-raise them.
5. Adversarial review pressure-tests claims well (independent reviewers, roles
   crossed with models); that machinery lives with `d365kit-validation-and-qa`.

**What counts as conclusive.** Every enumerated claim either demonstrated (the
artifact visibly did the thing) or edited. A claim that is "surely fine" is by
definition unaudited.

**Worked example: an adversarial round's casualties and their fates (the
decision log records the round in full).**
- The gotchas cross-host parity claim did not survive: rejected-promise shapes
  are host-specific, and normalizing them would be a breaking change across
  three hosts, out of proportion to the gap. The CLAIM was rescoped instead:
  parity is promised for success shapes and flow control, and the rejection
  shapes are documented as host-coupled.
- The ALM chapter's prose was "right but the repo cannot execute it": no
  committed solution project, no packaging stage, no import verification
  existed. Recorded as a deliberate gap with a trigger ("the next time a
  release is cut") rather than shipped untested, and closed on exactly that
  trigger by the release-engineering work.
- Reviewer claims checked and found wrong were recorded so they are not
  re-raised (each with the reasoning that killed it).

The standing open item of this class: the CI claim (the committed pipeline
yaml runs on no connected service; only the Storybook Pages workflow runs).

**Cost.** The audit itself is local and free; exercising org-touching claims
inherits those claims' costs. Done honestly it is days, not hours. Results
recorded: a decision entry of casualties and deliberate non-fixes, written so
nothing is re-litigated from the same findings later, plus the doc rescopes in
place.

---

## Recipe 8: the ground-truth artifact diff

**When to use.** The repo takes over writing something the platform normally
writes invisibly (solution zips, component metadata, manifests). "It builds"
says nothing about whether the platform will accept or honor it; the
platform's own output is the only spec that cannot be wrong.

**Preconditions.** One platform-produced specimen of the same artifact kind
(an org export).

**Steps.**
1. Have the platform produce the artifact its own way, once (export the
   solution from the org).
2. Build the repo's version of the same artifact.
3. Diff structurally: file inventory, XML nodes, component metadata entries,
   ids. Not "a zip exists".
4. Chase every difference to "understood and intended" or "fixed". The
   dangerous differences are the silently tolerated ones, where the packer or
   importer accepts your input and quietly does less than you think.
5. Commit the discovered invariants with prose that stops future
   "simplification".

**What counts as conclusive.** The repo-built artifact matches the
platform-built one in every part the platform reads, with each intentional
difference written down. Final confirmation is recipe 2's import exercise;
this recipe is what makes that import worth attempting.

**Worked example: the Customizations.xml discovery.** The committed
`deployment/solution/src/Other/Customizations.xml` must carry an empty
`<WebResources />` placeholder node: SolutionPackager only reassembles the
staged webresource metadata (the `.data.xml` files) into customizations.xml
when that node exists; without it the packer copies the staged files into the
zip verbatim, emits NO component metadata, and an import would create nothing,
silently. The decision log's own words: "Found empirically against the
org-exported solution as ground truth", worth recording "so nobody
'simplifies' it away". The release zip was likewise content-checked against
the org-exported solution before any import attempt. The node is marked
load-bearing in `docs/deployment.md`'s folder table with the same explanation.

**Cost.** The export is an org operation (minutes); the diff is local and
free. Results recorded: the decision entry for each discovered invariant, plus
a doc-of-record note AT the artifact so the invariant defends itself.

---

## The meta-rule every recipe inherits

Two clauses, no exceptions:

1. **A probe that changes org state follows org discipline in full.** Probes
   live on a dev org and a samples surface, never production; form fields are
   hidden, not removed (the one recorded exception: an import-verification
   binding is fully removed, because a lingering binding is a dependency and
   the uninstall IS the test); and the rollback is designed BEFORE the
   attempt, with baseline queries captured first, because "rolled back clean"
   is only a fact when a re-query proves it. Execution mechanics:
   `d365kit-run-and-operate`.

2. **A probe's answer is dated, because platform waves move, and the lesson
   cuts both ways.** "The platform-library path is closed" was correct when
   measured and stale when re-probed; a whole pin regime was maintained
   against a limitation that had dissolved. The same knife points forward:
   today's favorable findings are wave-dependent too. "Declare low, receive
   current" is how the current wave behaves; the deprecated `Xrm.Page` still
   being served through the frame walk is explicitly what masks the boot race
   today. So when you consume a probed behavior, record the probe date and
   what breaks if the wave moves; and when you meet a dated limitation, run
   recipe 1 before building around it. An undated platform fact is folklore
   either way.

## Provenance and maintenance

Ported from the kit's internal working notes and re-stamped 2026-07-15 against
v1.3.0. Sources: `docs/internal/decisions.md` (the worked examples' entries),
`docs/internal/roadmap.md`, `docs/deployment.md`, `docs/gotchas.md`,
`shared/metadata/attributeMetadataReads.ts`,
`shared/context/hostSurface.ts`, and the named test files.

Re-verification commands (PowerShell, one line each):

| Fact that can drift | Re-verify with |
|---|---|
| Paint-count contract still pinned | `Select-String -Path tests/unit/shared/controls/smart/smartControls.test.tsx -Pattern "form-load render batching"` |
| Boot-race orders still pinned | `Select-String -Path tests/unit/clientui/bootstrap.test.tsx -Pattern "AFTER context creation"` |
| Adapter-level live-source tests | `Select-String -Path tests/unit/shared/context/contextAdapters.test.ts -Pattern "live source"` |
| Encoding pins present | `Select-String -Path tests/unit/shared/metadata/attributeMetadataReads.test.ts -Pattern "OData encodings"` |
| Decoder centralization posture | `Select-String -Path shared/metadata/attributeMetadataReads.ts -Pattern "ONE place"` |
| Ground-truth invariant guarded | `Select-String -Path deployment/solution/src/Other/Customizations.xml -Pattern "WebResources"` |
| Live perf datapoints still published | `Select-String -Path docs/deployment.md -Pattern "perf=true"` |
| Twin-form traps still recorded | `Select-String -Path docs/internal/roadmap.md -Pattern "formpresentation"` |

When a recipe here and the decision log disagree, the log wins; fix this file
the same day.
