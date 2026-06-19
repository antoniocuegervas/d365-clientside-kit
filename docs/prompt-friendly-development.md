# Prompt-Friendly Development

The kit is designed so **coding agents generate good apps** and **citizen
developers can read them afterwards**. Views composed of declarative
metadata-aware blocks are a small, well-typed prompt target, far harder to
hallucinate than hand-wired FetchXML and option-list plumbing.

## The workflow

1. Prompt an agent with the requirement plus a few-shot reference.
2. The agent generates `app.ts` + `XyzView.tsx` + `XyzViewModel.ts` under
   `clientui/apps/<app-key>/` and registers the app in `clientui/apps/index.ts`.
3. Build, deploy, and open the shell in a model-driven app with the app key
   (see deployment.md, "Hosting the shell").
4. Humans tweak or re-prompt. Reading the View tells you the layout; reading
   the ViewModel tells you the rules. That comprehension step is a feature.

## Which sample to point the agent at

| Requirement shape | Few-shot reference |
|---|---|
| Standard fields on a custom surface | `clientui/apps/template/` |
| Saved-view grid + selection + edit panel | `clientui/apps/sample-company-search/` |
| Master grid driving an editable detail form | `clientui/apps/sample-master-detail/` |
| Filter form over an entity | `clientui/apps/sample-opportunity-search/` |
| Dependent lookups | `clientui/apps/sample-territory-cascade/` |
| Rows merged from several queries | `clientui/apps/sample-merged-grid/` |
| Mixed activity types in one list | `clientui/apps/sample-activities-grid/` |
| Multi-step gated wizard with an in-memory draft | `clientui/apps/sample-new-account-wizard/` |

## Patterns agents should default to

- **Smart controls first**: `<SmartTextField entity="account" attribute="name"
  value={vm.name} />`, never hand-build option lists, labels, precision, or
  date formats for standard fields.
- **Presentational + ViewModel only when data is custom** (merged queries,
  multi-entity lists): ViewModel fetches and normalizes into an
  `Observable<IGridRow[]>`; `DataGrid` displays it.
- **One ViewModel shape** (see architectural-stance.md), constructors take
  `IViewModelContext`, handlers are arrow properties, async callbacks check
  `tracker.isDisposed`.
- **Views contain no entity names on presentational controls.** If an entity
  name appears in JSX, it belongs on a Smart control's `entity` prop.

## Prompt template that works

> Build a webresource app `<app-key>` for the kit in clientui/apps/.
> Follow the structure of clientui/apps/sample-company-search exactly
> (app.ts registration, View, ViewModel). Requirement: …
> Use Smart controls for standard fields; put any multi-query or merge logic
> in the ViewModel feeding the presentational DataGrid. OOTB entities only.
