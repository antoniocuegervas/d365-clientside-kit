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

## When to reach for it (and when not)

The kit is not for exotic UI by default. Where it earns its keep is the gap between what
the platform almost does and what the user actually needs: the requirement is about 90% native, but where it has to run, the interaction, or
the data shape leaves no clean standard path.

| Use native D365 | Use the kit |
|---|---|
| Standard fields on entity forms | Webresource or PCF UI that needs native look with programmatic control |
| Subgrids on forms with no custom interaction | Subgrid-like grids in a webresource you bind, refresh, and handle from code |
| A subgrid bound to one relationship | A grid whose rows come from merged or normalized result sets |
| Single-entity activity subgrids | Activity lists spanning multiple activity types with unified columns and sort |
| Out-of-box lookup behavior | Lookups with custom search, saved-query overrides, or multi-step filtering |
| A standard guided process | A multi-step, gated wizard with an in-memory draft committed at the end, where Power Pages is overkill and a business process flow does not fit (record already on one, or large data volume) |
| "Good enough" standard config | Requirements where users will notice if you compromise |

One additional use case is a judgement call, not a capability gap: sometimes standard config or a
low-code page *can* deliver the requirement, but a native-parity experience *is* the requirement.
High-visibility, high-use apps where a visible break in the UX or a paradigm shift has a real cost (the
daily-driver grid, the screen the whole sales floor lives in) can justify reaching for the kit on UX
grounds alone. That is a tier of its own, separate from the capability cases above: in those, config
genuinely can't deliver it; in this one it can, and you are choosing parity anyway because the polish is
worth it. The discipline is in the "worth": reach for it where the experience earns the extra app, not by
default.

It is also the wrong tool for a full SPA. The kit's unit of work is a form-shaped View
plus a thin ViewModel. If a requirement is too large to express that way, that is the
signal it is outside the kit's scope, not a reason to grow the kit. Routing, global state
managers, and composition patterns aimed at full-time frontend teams are deliberately
out of scope.

It also leaves **field-level (column) security** enforcement to the platform,
with one split by delivery shape. A webresource has no per-user access signal,
so there the kit renders column-secured fields read-only and shows read-denied
values as empty rather than pretending to enforce access. A bound PCF DOES
receive the user's real access through the documented property surface, and
the kit's editable field PCFs consume it: a secured column the user can edit
stays editable. If you need native-grade column security in webresource UI, that is
the platform's job: use a native form. See [docs/gotchas.md](docs/gotchas.md).

## How this relates to canvas apps and custom pages

The first reaction to "custom UI in a model-driven app" is usually "use a canvas
app," or more currently "use a custom page." Often that is the right call, and it
solves a different problem than this kit does.

Canvas apps and custom pages are a second app paradigm: Power Fx, a separate
runtime, and a layout-first authoring tool. They shine when the app is standalone,
draws on sources beyond Dataverse, or is built by a citizen developer who will not
write code. If that is your situation, reach for them.

This kit is for the other situation: your entities, forms, views, security, and
metadata already live in a model-driven app, and you have hit the edge of what
configuration expresses. Embedding a custom page there carries costs that are easy
to underestimate:

- **It sits beside the form, not in it.** A custom page attaches as a full page, a
  dialog, a side pane, or a section-embedded canvas app. None of those is a bound
  subgrid or a form-field control, so for work that belongs in the grid or on the
  field (an editable subgrid, a lookup, a cell editor) a custom page can render near
  it but cannot be it. A PCF from this kit can.
- **It resolves metadata per binding, not comprehensively.** A custom page is not
  metadata-blind: `Choices()` reads live option-set labels and `DataSourceInfo()`
  exposes column facts. The difference is coverage and default. The kit's smart
  controls resolve labels, option sets, number precision and `PrecisionSource`, date
  and locale behavior, lookup targets, and the record currency from Dataverse by
  default, where a custom page wires each one binding by binding and leaves the
  awkward cases to you.
- **It is a second paradigm to staff and maintain.** Power Fx beside React beside
  your form scripts is three mental models, re-learned by a team that returns to
  it twice a year. The kit is one: React on the metadata you already have, in
  source control and CI, reviewed like the rest of your code, and legible enough
  that the intermittent maintainer, or a coding agent generating the next one,
  can re-read it cold.
- **It is awkward for programmable data shapes.** Merged or normalized result sets,
  lists spanning multiple activity types, lookups with custom ranking or multi-step
  filtering, the cases this kit targets, are where a layout-first tool is most
  strained and where code-first, metadata-aware controls are most at home.

Canvas and custom pages are the right tool when you build *beside*
your model-driven app. This kit is the right tool when you build *inside* it, in the
grid or on the field, and need a native-feeling, programmable, metadata-aware extension point
that stays in your codebase.

## Code apps

Power Apps code apps are a *build-beside* option, not a *build-inside* one: a
standalone React/TypeScript app running on the Power Platform, the same paradigm
as canvas and custom pages, and a different job from this kit. They are capable:
they read Dataverse metadata at runtime via `getMetadata`, and the
code-apps SDK opens the full Power Platform connector ecosystem (Dataverse,
SharePoint, SQL, third-party SaaS) through governed connectors. For an app that
lives *beside* the model-driven app, that is a strong option.

What a code app categorically cannot do is *be* a bound control inside a
model-driven form (a subgrid, a form field, a grid cell). Being that control inside the form is
this kit's whole point, and it is the one line nothing in the build-beside
paradigm crosses.

The two are not mutually exclusive. The kit's presentational layer is
indifferent to where it runs and already works in any React app, code apps included, with no
adapter. The metadata-aware layer would need a code-app context adapter, a real
adapter rather than a thin wrapper, since the data plumbing differs (the
code-apps SDK rather than `Xrm.WebApi`). That, and the connector-reach scenarios
it would open, is a deliberate future direction rather than a v1 deliverable. v1
stays focused on the inside-the-model-driven-app cases, where being a native
extension point is the differentiator.

## Architectural stance

Two decisions carry the design.

**A three-layer contract**, enforced by lint, not just convention:

| Layer | Knows CRM? | Queries? | Role |
|---|---|---|---|
| **Presentational** | Never. No context, no entity names | Never | Native-parity UI; renders supplied values and Observables; raises events |
| **Smart (metadata-aware)** | Yes, via `IViewModelContext` | Metadata and standard fetches | `entity` + `attribute` in, resolved presentational child out |
| **ViewModel** | Yes | Anything: merges, multi-query pipelines | Owns Observables and app rules; binds presentational controls |

Presentational controls stay CRM-agnostic so they run in Storybook with zero mocks and
never drift from the native look. Smart controls give you form-designer ergonomics in code: drop a
control into a View with an entity and an attribute, and it resolves labels, option sets,
formats, and lookup targets from Dataverse metadata.

**MVVM and Observables on purpose, not from habit.** Most D365 teams ship a handful of
custom UI pieces across an implementation, then return months later for a small change. Hooks
fluency is perishable under that cadence; every return visit pays a relearning tax. View
plus ViewModel plus Observables stays re-legible: open the ViewModel, see the data and
rules; open the View, see the controls. It reads like the form scripts these developers
already maintain. See [docs/architectural-stance.md](docs/architectural-stance.md) for
the full rationale, written so future contributors do not modernize it away by accident.

## Provenance

This kit distills patterns the author has built by hand across years of D365 client
work. This public version was assembled with heavy AI assistance: the architecture, the
constraints, and the API design are the author's; the bulk of the implementation was
generated against that design. The judgment is human, the typing was not.

## Delivery targets

One shared library, four places it lands:

| Folder | Target |
|---|---|
| `shared/` | The portable kit: controls, context adapters, metadata, reactivity, theme |
| `clientui/` | HTML webresource shell: one page, `?app=` registry, MVVM apps |
| `clienthooks/` | `CrmClientSide` UMD bundle for form / ribbon / grid events |
| `pcfs/` | Sample PCF projects importing `shared/` as source |

Runs against modern orgs (v9.2+/UCI) natively. CRM 8.x support is designed in
(a legacy context adapter, tested against 8.x-shaped mocks) but has not yet
been exercised against a live 8.x org; treat it as best-effort until then.
"Legacy" means old server APIs, not old browsers: modern evergreen browsers
only.

## Multiple ways to ship the same component

Because every control reaches the platform through one `IViewModelContext`, the same
presentational component and ViewModel run unchanged as a webresource, a PCF, or a form
script. That portability is also a development tactic, not only a deployment choice:

- **Develop as a webresource first.** A webresource iterates in Storybook against
  fixture data, and refreshes on the live site without a deploy: a Fiddler
  autoresponder can serve your local bundle straight to the org, the single biggest
  speed-up there is for webresource work (the walkthrough is in
  [docs/deployment.md](docs/deployment.md)). A PCF pays a build, push, and import on every change and fights the model-driven
  app's aggressive caching. So build and debug the hard part, the UI and the data shape,
  as a webresource, where the loop is markedly faster.
- **Ship as webresource or PCF, whichever the requirement needs.** When the control must be a bound
  subgrid, form field, or grid cell, deliver it as a PCF: a thin shell that imports the
  component you already debugged and pipes `PCFContext` in. When no bound slot is needed
  (an app page, a dialog, a search form), the webresource is the delivery shape too.
  The smart-tier PCFs target model-driven FORMS: custom pages and canvas apps do not
  populate the form-context surfaces they read (host entity, org URL), so there they
  render a setup message rather than the control.
  The kit's PCFs are virtual controls: the platform hands them the host's own React and
  Fluent at runtime, so they bundle neither and there is no per-wave re-pin to maintain
  (one exception: the date picker bundles the date/time compat packages, which carry
  the one surviving tabster pin, see docs/deployment.md).
  The one compatibility statement to carry on your fork is the platform-library floor:
  the target org must serve platform Fluent 9.61 or newer (current commercial waves do;
  sovereign clouds trail them, and there the grid control states the wave requirement at
  runtime instead of erroring). `pcfs/platform-floor.json` plus the verify gate hold the
  kit to that floor. Details in
  [docs/deployment.md](docs/deployment.md) ("Virtual controls and the platform-library
  floor").
- **Know the boundary.** The fast loop covers the UI and the data shape, most of the
  work. What still needs the real PCF is the binding feedback loop (the notify and
  update cycle and the platform's update timing), which a simulated binding cannot reproduce.

The counterparty grid in this repo is built this way: one `shared/features/counterparty`
module, debugged as a webresource app, shipped also as a dataset PCF
(`pcfs/KitCounterpartyGrid`) that is a thin wrapper over the same component.

## What a View looks like

A View reads like a form layout. Metadata-aware controls take an entity and an attribute,
and the kit does the rest. This is the `template` app, the file you copy to start a new one:

```tsx
export class TemplateView extends ObserverComponent<ITemplateViewProps> {
  constructor(props: ITemplateViewProps) {
    super(props);
    this.observe(props.viewModel.isSaving, props.viewModel.saveMessage);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<ITemplateViewProps> = ({ viewModel }) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>New Account</Title3>

      {/* Form-designer ergonomics: entity + attribute is the whole config. */}
      <SmartTextField entity="account" attribute="name" value={viewModel.accountName} />
      <SmartOptionSet entity="account" attribute="industrycode" value={viewModel.industry} />

      <div className={styles.actions}>
        <Button
          appearance="primary"
          onClick={() => void viewModel.onSave()}
          disabled={viewModel.isSaving.value}
        >
          {viewModel.isSaving.value ? "Saving…" : "Save"}
        </Button>
      </div>
      {viewModel.saveMessage.value ? (
        <div className={styles.message}>{viewModel.saveMessage.value}</div>
      ) : null}
    </div>
  );
};
```

The ViewModel owns the Observables and the save logic. The View just declares controls.

`this.observe(...)` in the View's constructor is the one line that wires reactivity: list
there every Observable the render reads, and the View re-renders whenever any of them
changes. It is the kit's one silent contract, miss an Observable and that value simply
stops updating the UI, with no error. The five kit terms (presentational, smart,
ViewModel, Observable, observe) are defined once in the [glossary](docs/glossary.md).

## Getting started

Requires **Node 24 and npm 11** (the exact pins live in `.nvmrc` and the
`engines` field; on Windows, nvm-windows or fnm gets you there). Then:

```bash
npm install           # deterministic install from package-lock.json; nothing to commit afterwards
npm run storybook     # browse the controls with fixture data, the quick payoff
npm run verify        # the full gate: lint + typecheck + build + tests + smoke + storybook
```

Day 1 is `install` + `storybook`; run `verify` before you send changes
anywhere. Two install notes so the output does not read as trouble: the
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

Zero-setup alternative: browse the controls live in the hosted Storybook:
https://antoniocuegervas.github.io/d365-clientside-kit/

To see the kit running in a real org without building anything, install the managed
**sample solution** from the repo's
[Releases](https://github.com/antoniocuegervas/d365-clientside-kit/releases): import
it, open the `d365KitSamples` app, and the counterparty grid plus the sample
webresource apps run on standard account, contact, and activity data. It is managed,
so it installs and uninstalls cleanly and changes nothing else in the environment.
(The repo source ships under the `new_` publisher; change it to your own in
`kit.config.json`. The sample solution is a separate, ready-to-try build.)

Sample apps live in `clientui/apps/`. Start with `template` (the scaffold to copy),
`sample-company-search` (the flagship 90%-native case: a saved-view grid and editable
lookups in a webresource that behave like form controls), and `sample-master-detail`
(an account grid driving an editable contact form with a field of every type, runs on
any Dataverse org with no extra metadata). Deploy the shell and open it inside a
model-driven app: the webresource needs that app context to receive `Xrm`, see
[docs/deployment.md](docs/deployment.md) ("Hosting the shell"). The `samples` app key
lists every sample from one webresource.

## Where to go deeper

The public guides in `docs/`, ordered hands-on-first (theory when you want
the why, not before your first app):

1. [docs/adding-a-webresource-app.md](docs/adding-a-webresource-app.md): ship your first app
2. [docs/component-catalog.md](docs/component-catalog.md) and [docs/control-configuration.md](docs/control-configuration.md): controls, their config, and the value types to wire
3. [docs/glossary.md](docs/glossary.md): the five kit terms, one page
4. [docs/architecture.md](docs/architecture.md): the three-layer contract and boot flow
5. [docs/architectural-stance.md](docs/architectural-stance.md): why MVVM + Observables
6. [docs/adding-a-pcf.md](docs/adding-a-pcf.md) and [docs/adding-a-client-hook.md](docs/adding-a-client-hook.md): the other delivery targets
7. [docs/prompt-friendly-development.md](docs/prompt-friendly-development.md): generating apps with coding agents
8. [docs/testing.md](docs/testing.md) and [docs/deployment.md](docs/deployment.md): verify and publish
9. [docs/gotchas.md](docs/gotchas.md): sharp edges that are not obvious from the type signatures

The full design document and decision log live in
[docs/internal/](docs/internal/) for anyone curious about the reasoning behind the
constraints. They are background, not required reading.

## Status

A working v1: the architecture, the three-layer contract, the shell, sample apps, sample
PCFs, and the client-hooks framework are all in place and pass the local verification
gate (lint, typecheck, both bundle builds, unit tests, modern and legacy smoke
tests, and a Storybook build). It has been deployed to and exercised against a live
Dataverse v9 org using standard entities. It is a foundation built to be extended, not a
finished product with a long track record.

Native fidelity is a maintained claim, not a static property: Microsoft advances the
Unified Interface theme and the platform Fluent on its release waves. The PCF tier now
tracks the host automatically (virtual controls render on the platform's own Fluent),
so the claim to revisit on that cadence is the webresource shell's bundled Fluent and
theme tokens against live UCI, roughly twice a year.

## Contributing and reuse

This repo is meant to be built on. To start your own D365 client-side project,
use it as a template (the "Use this template" button, or copy the repo) and own
your copy from there; a template copy has no upstream link, so it will not pull
kit updates automatically. To contribute a fix to the kit itself, fork and open
a pull request against `master` (a template-derived copy shares no history and
cannot open a clean PR). The architecture (MVVM, Observables, class components)
and the authoring rules are intentional and enforced, so read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Released under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).