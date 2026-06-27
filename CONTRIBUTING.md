# Contributing

Thanks for taking a look. This repository is the canonical source for the D365
Client-Side UI Kit. There are two ways to engage with it, and they are not the
same thing.

## Starting your own project (using the kit)

To build your own D365 client-side work on top of the kit, start a new
repository from this one: use the "Use this template" button, or copy the repo.
You then own that copy. Keep `shared/` (the portable kit), the build and
deployment setup, and the `template` app; keep or delete the `sample-*` apps as
you see fit. A template copy has no link back here, so it will not receive kit
updates automatically. That is the expected model for a starting point.

## Contributing to the kit itself

Improvements to the kit (for example a fix in `shared/`) come back through the
normal fork and pull request flow, not from a template-derived copy:

1. Fork this repository. A fork shares history, so a pull request merges
   cleanly. A template-derived copy shares no history and cannot open a clean
   pull request.
2. Create a branch, make the change, and run the gate (below).
3. Open a pull request against `master`.

If you fixed something inside a template-derived project, port that change into
a fork of this repo and open the pull request from the fork.

## What to contribute

Contributions that fit the kit well:

- Fixes for defects you hit.
- Expanded or additional context adapters (more of the platform API, or
  broader version coverage).
- New presentational or smart controls that fill a real gap.
- A new template app that illustrates a use case worth showing.

A few things are intentionally out of scope. This is about keeping the kit a
clean, runnable reference, not a judgment on your work:

- **Business-specific or proprietary code.** The kit ships nothing tied to one
  organization's processes, branding, or data.
- **Anything that needs custom schema to run.** Samples and tests must work
  against out-of-box entities and fields. A contribution that requires custom
  columns, custom entities, or a solution to be imported before it can be tested
  does not belong here.
- **Overbuilt sample apps.** A template app is an illustration of one idea, not a
  production implementation. Keep it small and focused on a single use case,
  ideally one that is hard or inconvenient with the standard configuration-first
  approach. If a sample grows into a full product, it is outside the kit's scope.

When in doubt, open an issue to talk an idea through before building it.

## Local setup and the gate

```bash
npm ci          # Node 22 is recommended: it matches CI (npm 10) and the lockfile
npm run verify  # lint, typecheck, both bundles, unit + smoke tests, Storybook build
npm run storybook
```

`npm run verify` must be green before a pull request is considered. Storybook
needs no Dataverse; the live samples need a Dynamics 365 / Dataverse org.

## What will and will not be merged

The architecture is deliberate and fixed. Please work within it rather than
around it:

- **MVVM, Observables, and class components on purpose.** Fix defects within
  this pattern. Pull requests that refactor toward hooks or other modern-React
  idioms will not be merged. The reasoning is in
  [docs/architectural-stance.md](docs/architectural-stance.md).
- **The three-layer contract holds.** Presentational controls never know CRM
  (no context, no entity names, no queries); smart controls are metadata-aware;
  ViewModels own data and rules. The lint rules enforce presentational purity,
  so please do not weaken them.
- **Authoring style (mainly for coding agents).** This kit is built with heavy
  AI assistance (see the README provenance note), so prompt-driven contributions
  are expected and welcome. If you use a coding agent, hold it to the house style
  so its edits read as one voice and do not reintroduce the usual AI tells: no em
  dashes anywhere (use commas, colons, or parentheses), a plain and direct voice,
  and no internal document-id citations (the section and decision labels live in
  `docs/internal`, not in source or commit messages). Writing by hand you will
  rarely trip these; the rule is here to keep agent-generated changes consistent
  with the rest of the code.

## Reporting issues

Open an issue describing the behavior, the platform (modern UCI or legacy), and a
minimal repro. For a UI question, a Storybook story that shows the problem is
the fastest path to a fix.
