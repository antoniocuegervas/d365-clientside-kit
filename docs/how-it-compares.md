# How the kit compares

Where the kit sits among the platform's own custom-UI options. The
[README](../README.md) carries the one-line versions; this page keeps the full
reasoning: canvas apps and custom pages, code apps, the UX-parity judgement
call, and the cases where the kit is the wrong tool.

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

## The UX-parity tier: a judgement call, not a capability gap

One tier of kit use is a judgement call, not a capability gap: sometimes standard
config or a low-code page *can* deliver the requirement, but a native-parity
experience *is* the requirement. High-visibility, high-use apps where a visible
break in the UX or a paradigm shift has a real cost (the daily-driver grid, the
screen the whole sales floor lives in) can justify reaching for the kit on UX
grounds alone. That is a tier of its own, separate from the capability cases in
the README's when-to-reach table: in those, config genuinely can't deliver it; in
this one it can, and you are choosing parity anyway because the polish is worth
it. The discipline is in the "worth": reach for it where the experience earns the
extra app, not by default.

## When the kit is the wrong tool

The kit is the wrong tool for a full SPA. The kit's unit of work is a form-shaped
View plus a thin ViewModel. If a requirement is too large to express that way, that
is the signal it is outside the kit's scope, not a reason to grow the kit. Routing,
global state managers, and composition patterns aimed at full-time frontend teams
are deliberately out of scope.

Column (field-level) security is a related boundary with its own home: the kit
leaves enforcement to the platform, and the behavior differs by delivery shape.
See [gotchas.md](gotchas.md) ("Column (field-level) security").
