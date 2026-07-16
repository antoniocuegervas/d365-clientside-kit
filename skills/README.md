# Agent skills

Task guides for coding agents working with the D365 Client-Side UI Kit. Each
skill is a self-contained markdown file distilled from this repo's own working
notes: the concepts, runbooks, traps, and evidence standards the kit was built
with. They exist so an agent (or a person) can pick up a kit task without
re-deriving the context from scratch.

Start with `AGENTS.md` at the repo root (the short list of load-bearing
constraints), then load the skill that matches the task.

## The catalog

| Skill | Load it when |
|---|---|
| `dataverse-clientside-reference` | You know React/TypeScript but not the D365/Dataverse client-side world: webresources, PCF, solutions, publisher prefixes, FetchXML, UCI caching, Fluent, control identity |
| `d365kit-architecture-contract` | Before designing any change: the fixed invariants (three layers, MVVM, Observables, virtual PCFs), why they are fixed, and the known-weak points |
| `d365kit-build-and-env` | Setting up a machine, install failures, toolchain pins, the verify gate step by step, PCF and solution-zip builds |
| `d365kit-config-and-versioning` | Changing any configuration file, bumping any version, the publisher prefix, the floor checker, the versioning policy |
| `d365kit-debugging-playbook` | Something is broken: blank webresource, stale PCF bundle, invisible form change, a value that stops updating, a red verify step, a transparent popover |
| `d365kit-diagnostics-and-tooling` | A perf, size, or render claim needs a number: the UCI perf overlay, Profiler pinned tests, the bundle-size report (ships with a script), Solution Checker |
| `d365kit-proof-and-analysis-toolkit` | A platform behavior is undocumented or doubted: eight experiment recipes (re-probes, identity experiments, race staging, encoding pinning, A/B twins, claims audits) |
| `d365kit-run-and-operate` | Running the samples, hosting the shell, deploying webresources and PCFs, building the solution zip, client hooks, cache rituals |
| `d365kit-validation-and-qa` | Before claiming anything works: the evidence ladder, the verify gate's exit-code trap, test authoring rules, the mock inventory, live-verification protocols |
| `d365kit-docs-and-writing` | Writing any prose: the docs map, house style (no em dashes, plain D365 register), templates for decision/roadmap/gotchas entries, the claims checklist |

These are guides for working ON and WITH this kit. The deeper why behind any
rule lives in `docs/internal/decisions.md` (the decision log); when a skill
and the repo disagree, the repo wins.

## Using the skills

**Claude Code.** Copy the skill folders into your project's `.claude/skills/`
directory (or your user-level `~/.claude/skills/`):

```powershell
Copy-Item skills\* .claude\skills\ -Recurse
```

Claude Code discovers them automatically and loads one when its description
matches the task (or invoke one directly with `/<skill-name>`).

**Other coding agents.** Each skill is plain markdown with a YAML frontmatter
(name, description). Point your agent at `skills/<name>/SKILL.md`, paste the
relevant skill into its context, or wire the folder into whatever
skill/instruction mechanism your tool has. `AGENTS.md` at the repo root is the
always-load companion.

**Keeping them current.** Each skill ends with a Provenance block containing
re-verification one-liners for its drift-prone facts. If a command's output
contradicts the skill, the repo wins; fix your copy of the skill.

## Configuration you supply

The skills describe workflows against a Dataverse environment. The repo ships
with placeholders; you supply your own values:

| Placeholder in the skills and docs | Your value | Where it is set or used |
|---|---|---|
| `new_` (publisher prefix) | Your publisher's customization prefix, with trailing underscore | `kit.config.json` at the repo root; names every built artifact, deployed webresource, and packed solution component. See `d365kit-config-and-versioning` axis 1, including how to keep a private prefix out of a public fork's history |
| `https://yourorg.crm.dynamics.com` | Your Dataverse org URL | Quick-test URLs, `pac auth create --environment <url>`, the SPKL connection string |
| `<app-guid>` | A model-driven app id in your org | The quick-test URL for hosting the shell (`d365kit-run-and-operate` section 2) |
| SPKL connection string | An XrmTooling connection string for your org | `$env:SPKL_CONNECTION` or the gitignored `deployment/connection.local.json`; never commit it (`d365kit-run-and-operate` section 3) |
| PCF deploy wrappers | Untracked `pcfs/_<name>` solution wrapper projects you scaffold once with `pac solution init` | The PCF deploy loop (`d365kit-run-and-operate` section 4); the `_` prefix keeps the repo's checkers out of them, and the folders stay untracked because a rendered wrapper embeds your publisher |
| Your org card | Org URL, app id, hub URL, solution name | A local note per environment; the template is at the top of `d365kit-run-and-operate` |

Secrets (connection strings, tokens) never go in tracked files; the repo's
`.gitignore` already covers `deployment/connection.local.json` and the
rendered deploy manifests.

## What is deliberately not here

The kit's internal process notes (release gating, positioning policy, research
campaign plans, historical working notes) stay internal: they govern how this
repo's own releases and claims are managed, and they would not help you build
on the kit. Everything an agent needs to understand, build, run, debug,
measure, and verify kit work is in the ten skills above plus the docs they
point to.
