# D365 Client-Side UI Kit

A portable, metadata-aware client-side kit for Microsoft Dynamics 365 / Dataverse.
It renders native-looking custom UI (refreshed Unified Interface, Fluent UI v9) with
full code-level control, and ships it across webresources, PCFs, and form scripts from
one shared library. Built on React 18 + TypeScript. The spiritual successor to
[SparkleXrm](https://github.com/scottdurow/SparkleXrm), carried forward to UCI fidelity
and modern UCI coverage.

![The kit's activity grid embedded in a native Dynamics 365 account form, sitting alongside the standard form sections and timeline. A synthesized Counterparty column shows the related party per row, hovering a "(+N more)" chip opens a popover listing every party with its role, and "Load more" pages in the rest.](docs/media/counterparty-grid-demo.gif)

**Try it in five minutes** (Node 24 + npm 11): `npm install`, then
`npm run storybook` for every control and whole sample screens on fixture
data, no org needed; or skip the clone entirely with the
[hosted Storybook](https://antoniocuegervas.github.io/d365-clientside-kit/)
and the ready-to-import
[sample solution](https://github.com/antoniocuegervas/d365-clientside-kit/releases).
Details in [Getting started](#getting-started).

## Why it exists

In normal D365 work, when configuration cannot express exactly what the user needs, you
usually face two bad options: compromise the requirement, or spend a week on a custom POC
that still does not look native. This kit is the third option: native-looking UI with
code-level control, with a realistic target of roughly one day for requirements that are
almost standard but need a programmable extension point.

## Develop as a webresource, ship as webresource or PCF

Every control reaches the platform through one `IViewModelContext`, so the same
component and ViewModel run unchanged as a webresource, a PCF, or a form script.
That portability is a development tactic, not only a deployment choice, and it is
the kit's working model:

- **Develop as a webresource first.** The webresource loop is the fast one:
  Storybook on fixture data with no org, then a debug proxy serving your local
  bundle straight to a live org with no deploy (the Fiddler walkthrough is in
  [docs/deployment.md](docs/deployment.md)).
- **Ship as webresource or PCF, whichever the requirement needs.** When the
  control must be a bound subgrid, form field, or grid cell, deliver it as a
  PCF: a thin shell over the component you already debugged
  ([docs/adding-a-pcf.md](docs/adding-a-pcf.md) carries the three integration
  patterns; the virtual-control posture and its platform-library floor live in
  [docs/deployment.md](docs/deployment.md)). Where no bound slot is needed (an
  app page, a dialog, a search form), the webresource is the delivery shape too.
- **Know the boundary.** The fast loop covers the UI and the data shape, most of
  the work; the binding feedback loop (the notify and update cycle, the
  platform's timing) still needs the real PCF on a real form.

The counterparty grid above is the live proof: one `shared/features/counterparty`
module, debugged as a webresource app, shipped also as the dataset PCF that IS the
account's Activities subgrid (`pcfs/KitCounterpartyGrid`).

One shared library, four places it lands:

| Folder | Target |
|---|---|
| `shared/` | The portable kit: controls, context adapters, metadata, reactivity, theme |
| `clientui/` | HTML webresource shell: one page, `?app=` registry, MVVM apps |
| `clienthooks/` | `CrmClientSide` UMD bundle for form / ribbon / grid events |
| `pcfs/` | Sample PCF projects importing `shared/` as source |

Runs against modern orgs (v9.2+/UCI) natively. CRM 8.x support is designed in
(a legacy context adapter) and tested two ways: against 8.x-shaped mocks, and
against the v8.2 Web API contract a modern org still serves, a pass that caught
two real v8 defects, since fixed. It has not run against a live 8.x server, so
treat it as best-effort until then. "Legacy" means old server APIs, not old
browsers: modern evergreen browsers only.

## Who it is for

- Teams building internal enterprise software on Dynamics 365 who want to own
  their custom UI end to end: the kit is a template you copy and control, not
  a dependency you subscribe to (see
  [Contributing and reuse](#contributing-and-reuse)).
- Maintainers who read code well but do not live in React: form-script
  customizers, developers who touch React occasionally, and coding agents
  generating the next control against the samples
  ([docs/prompt-friendly-development.md](docs/prompt-friendly-development.md)).
- It is deliberately not aimed at daily-hooks React teams hand-writing a full
  SPA; the architecture optimizes for the intermittent maintainer instead
  ([docs/architectural-stance.md](docs/architectural-stance.md)).

## When to reach for it (and when not)

The kit is not for exotic UI by default. Where it earns its keep is the gap between what
the platform almost does and what the user actually needs: the requirement is about 90%
native, but where it has to run, the interaction, or the data shape leaves no clean
standard path.

| Use native D365 | Use the kit |
|---|---|
| Standard fields on entity forms | Webresource or PCF UI that needs native look with programmatic control |
| Subgrids on forms with no custom interaction | Subgrid-like grids in a webresource you bind, refresh, and handle from code |
| A subgrid bound to one relationship | A grid whose rows come from merged or normalized result sets |
| Single-entity activity subgrids | Activity lists spanning multiple activity types with unified columns and sort |
| Out-of-box lookup behavior | Lookups with custom search, saved-query overrides, or multi-step filtering |
| A standard guided process | A multi-step, gated wizard with an in-memory draft committed at the end, where Power Pages is overkill and a business process flow does not fit (record already on one, or large data volume) |
| "Good enough" standard config | Requirements where users will notice if you compromise |

How the kit relates to the platform's other custom-UI options lives in
[docs/how-it-compares.md](docs/how-it-compares.md): canvas apps and custom pages
(often the right call beside the model-driven app; the costs start when the work
belongs in the grid or on the field), code apps (capable beside the app,
categorically not a bound control inside it), the UX-parity judgement call, and
when the kit is the wrong tool (a full SPA).

Column (field-level) security enforcement stays with the platform, with one
split by delivery shape: a bound PCF receives the user's real access and honors
it, a webresource has no per-user signal and fails safe. The full behavior is in
[docs/gotchas.md](docs/gotchas.md).

## Architectural stance

Two decisions carry the design; both have their own docs.

**A three-layer contract.** Presentational controls are CRM-agnostic (values and
Observables in, events out): they run in Storybook with zero mocks and never
drift from the native look. Smart controls give you form-designer ergonomics in
code: drop one into a View with an entity and an attribute, and it resolves
labels, option sets, formats, and lookup targets from Dataverse metadata.
ViewModels own the Observables and the app rules. The presentational boundary is
machine-enforced (lint plus a resolution check in the gate); MVVM and no-hooks
are held by convention, the samples, and review. The layer table, the adapter
diagram, and the boot flow live in [docs/architecture.md](docs/architecture.md).

**MVVM and Observables on purpose, not from habit.** Most D365 teams ship a
handful of custom UI pieces across an implementation, then return months later
for a small change. Hooks fluency is perishable under that cadence; View plus
ViewModel plus Observables stays re-legible and reads like the form scripts
these developers already maintain. The full rationale, written so future
contributors do not modernize it away by accident, is
[docs/architectural-stance.md](docs/architectural-stance.md).

## What a View looks like

A View reads like a form layout: metadata-aware controls take an entity and an
attribute, and the kit does the rest. Trimmed from the `template` app, the file
you copy to start a new one
([clientui/apps/template/TemplateView.tsx](clientui/apps/template/TemplateView.tsx)):

```tsx
const Body: React.FC<ITemplateViewProps> = ({ viewModel }) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>New Account</Title3>

      {/* Form-designer ergonomics: entity + attribute is the whole config. */}
      <SmartTextField entity="account" attribute="name" value={viewModel.accountName} />
      <SmartOptionSet entity="account" attribute="industrycode" value={viewModel.industry} />

      <Button appearance="primary" onClick={() => void viewModel.onSave()}
        disabled={viewModel.isSaving.value}>
        {viewModel.isSaving.value ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};
```

The ViewModel owns the Observables and the save logic; the View just declares
controls. The one wiring contract: the View is an `ObserverComponent` and lists
the Observables its render reads in `this.observe(...)`; miss one and that value
silently stops updating the UI, with no error. The five kit terms
(presentational, smart, ViewModel, Observable, observe) are defined once in the
[glossary](docs/glossary.md).

## Getting started

Requires **Node 24 and npm 11** (the exact pins live in `.nvmrc` and the
`engines` field; on Windows, nvm-windows or fnm gets you there). Then:

```bash
npm install           # deterministic install from package-lock.json; nothing to commit afterwards
npm run storybook     # browse the controls with fixture data, the quick payoff
npm run verify        # the full gate: lint + typecheck + build + tests + smoke + storybook
```

Day 1 is `install` + `storybook`; run `verify` before you send changes
anywhere.

<details>
<summary>Install notes: the expected npm warnings, the Storybook fallbacks, and the one Windows trap.</summary>

Two install notes so the output does not read as trouble: the
handful of npm deprecation warnings and audit findings come from dev-time
tooling (jest/storybook transitives at the root, the pcf-scripts toolchain
inside each `pcfs/*` project), none of it ships in any bundle, and the state
is reviewed each release. If a LOCAL Storybook fights you (port 6006 taken and
an interactive prompt, or a stale cache after reinstalling), run
`npm run storybook -- --port 6008 --ci`, and delete
`node_modules/.cache/storybook` if a fresh install fails to start. One Windows
trap: stop the Storybook dev server BEFORE reinstalling node_modules; a running
dev server holds `esbuild.exe`, the install EPERMs halfway, and the half-deleted
tree then fails in confusing ways (missing jest types, a wrong-version global
eslint). Recovery is closing Storybook and rerunning `npm install`.

</details>

Zero-setup alternative: browse the controls live in the hosted Storybook:
https://antoniocuegervas.github.io/d365-clientside-kit/

To see the kit running in a real org without building anything, install the managed
**sample solution** from the repo's
[Releases](https://github.com/antoniocuegervas/d365-clientside-kit/releases): import
it, open the `d365KitSamples` app, and the counterparty grid plus the sample
webresource apps run on standard account, contact, and activity data. It is managed,
so it installs and uninstalls cleanly and changes nothing else in the environment.
The kit's own artifacts are deliberately not a release download: the kit is
consumed as source (this repo is the template), and a fork builds its own
importable solution zip under its own publisher; the ALM chapter in
[docs/deployment.md](docs/deployment.md) carries the walkthrough and the
identity rule behind the policy.

Sample apps live in `clientui/apps/`. Start with `template` (the scaffold to copy),
`sample-company-search` (the flagship 90%-native case: a saved-view grid and editable
lookups in a webresource that behave like form controls), and `sample-master-detail`
(a grid driving an editable form with a field of every type). Deploy the shell and
open it inside a model-driven app: the webresource needs that app context to receive
`Xrm`, see [docs/deployment.md](docs/deployment.md) ("Hosting the shell").

## Where to go deeper

The public guides in `docs/`, each with one job:

1. [docs/adding-a-webresource-app.md](docs/adding-a-webresource-app.md): ship your first app
2. [docs/prompt-friendly-development.md](docs/prompt-friendly-development.md): the agent workflow, from prompt to webresource to PCF hand-off
3. [docs/adding-a-pcf.md](docs/adding-a-pcf.md) and [docs/adding-a-client-hook.md](docs/adding-a-client-hook.md): the bound-control and form/ribbon/grid delivery targets
4. [docs/component-catalog.md](docs/component-catalog.md) and [docs/control-configuration.md](docs/control-configuration.md): which control per field type, and its configuration
5. [docs/glossary.md](docs/glossary.md): the five kit terms, one page
6. [docs/architecture.md](docs/architecture.md): the three-layer contract, the adapters, and the boot flow
7. [docs/architectural-stance.md](docs/architectural-stance.md): why MVVM + Observables, written for reviewers
8. [docs/how-it-compares.md](docs/how-it-compares.md): canvas apps, custom pages, code apps, and when the kit is the wrong tool
9. [docs/testing.md](docs/testing.md) and [docs/deployment.md](docs/deployment.md): verify and publish
10. [docs/gotchas.md](docs/gotchas.md): sharp edges that are not obvious from the type signatures

The full design document and decision log live in
[docs/internal/](docs/internal/) for anyone curious about the reasoning behind the
constraints. They are background, not required reading.

## Status

A working v1: the architecture, the three-layer contract, the shell, sample apps,
sample PCFs, and the client-hooks framework are all in place and pass the local
verification gate (`npm run verify`: lint, typecheck, both bundle builds, unit,
smoke, and a Storybook build). It has been deployed to and exercised against a
live Dataverse v9 org using standard entities. It is a foundation built to be
extended, not a finished product with a long track record.

Native fidelity is a maintained claim, not a static property: Microsoft advances the
Unified Interface theme and the platform Fluent on its release waves. The PCF tier now
tracks the host automatically (virtual controls render on the platform's own Fluent),
so the claim to revisit on that cadence is the webresource shell's bundled Fluent and
theme tokens against live UCI, roughly twice a year.

## Contributing and reuse

This repo is meant to be built on, and the template model is deliberate, not
a missing feature. The kit's audience builds internal enterprise software on
Dynamics 365: code that lives inside a client's org, where owning every line
end to end beats depending on a package that updates on someone else's
schedule. You take the kit as a starting point (the controls, the samples,
the guides, the approach) and from there it is your codebase: you control it,
you extend it, and nothing upstream can change it under you. That also
reframes the single-maintainer question a careful reader will ask of this
repo: a dependency needs its author; a starting point you own does not.

To start your own D365 client-side project,
use it as a template (the "Use this template" button, or copy the repo) and own
your copy from there; a template copy has no upstream link, so it will not pull
kit updates automatically. To contribute a fix to the kit itself, fork and open
a pull request against `master` (a template-derived copy shares no history and
cannot open a clean PR). The architecture (MVVM, Observables, class components)
and the authoring rules are intentional and enforced, so read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Provenance

This kit distills patterns the author has built by hand across years of D365 client
work. This public version was assembled with heavy AI assistance: the architecture, the
constraints, and the API design are the author's; the bulk of the implementation was
generated against that design. The judgment is human, the typing was not.

## License

Released under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
