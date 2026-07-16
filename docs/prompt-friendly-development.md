# Prompt-Friendly Development

The kit is designed so **coding agents generate good apps** and **citizen
developers can read them afterwards**. Views composed of declarative
metadata-aware blocks are a small, well-typed prompt target, far harder to
hallucinate than hand-wired FetchXML and option-list plumbing.

The delivery model frames the whole workflow: develop as a webresource for the
fast loop (Storybook on fixtures, no org needed), ship as a webresource or a
PCF, whichever the requirement demands. The webresource steps below are the
fast half, not the destination: when the requirement needs a bound control (a
form field, a subgrid), the same component ships as a PCF at the end.

## The workflow

1. Prompt an agent with the requirement plus a few-shot reference.
2. The agent generates `app.ts` + `XyzView.tsx` + `XyzViewModel.ts` under
   `clientui/apps/<app-key>/` and registers the app in `clientui/apps/index.ts`.
3. Build, deploy, and open the shell in a model-driven app with the app key
   (see deployment.md, "Hosting the shell").
4. Humans tweak or re-prompt. Reading the View tells you the layout; reading
   the ViewModel tells you the rules. Having to read it to change it is the point,
   not a chore.
5. If the requirement needs a bound control, hand the debugged component to the
   PCF tier: a thin root over the same component, with the integration pattern
   chosen per the decision table in [adding-a-pcf.md](adding-a-pcf.md). The
   counterparty grid is the worked example: one `shared/features/counterparty`
   module, debugged as the webresource app `sample-counterparty-grid`, shipped
   also as the dataset PCF `pcfs/KitCounterpartyGrid`, a thin wrapper over the
   same component.

## Which sample to point the agent at

| Requirement shape | Few-shot reference |
|---|---|
| Standard fields in a webresource or PCF | `clientui/apps/template/` |
| Saved-view grid + selection + edit panel | `clientui/apps/sample-company-search/` |
| Master grid driving an editable detail form | `clientui/apps/sample-master-detail/` |
| Filter form over an entity | `clientui/apps/sample-opportunity-search/` |
| Dependent lookups | `clientui/apps/sample-territory-cascade/` |
| Rows merged from several queries | `clientui/apps/sample-merged-grid/` |
| Mixed activity types in one list | `clientui/apps/sample-activities-grid/` |
| Multi-step gated wizard with an in-memory draft | `clientui/apps/sample-new-account-wizard/` |
| A bound form-field PCF over a standard column | `pcfs/KitOptionSet` (the smart pattern; pattern choice per [adding-a-pcf.md](adding-a-pcf.md)) |
| A bound dataset (subgrid) PCF | `pcfs/KitCounterpartyGrid`, the thin wrapper over `shared/features/counterparty` |

## Patterns agents should default to

- **Smart controls first**: `<SmartTextField entity="account" attribute="name"
  value={vm.name} />`, never hand-build option lists, labels, precision, or
  date formats for standard fields.
- **Presentational + ViewModel only when data is custom** (merged queries,
  multi-entity lists): ViewModel fetches and normalizes into an
  `ObservableArray<IGridRow>`; `DataGrid` displays it.
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

And the companion for the hand-off, once the component is debugged and the
requirement needs a bound control:

> Ship `<component>` from shared/ as a PCF in pcfs/. Pick the integration
> pattern per docs/adding-a-pcf.md (decision table) and copy the matching
> reference control: pcfs/KitOptionSet for a bound field, pcfs/KitCounterpartyGrid
> for a dataset. Keep the root thin: context wiring in init, return the element
> from updateView, logic stays in shared/.
