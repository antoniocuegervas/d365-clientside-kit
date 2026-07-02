# Adding a Webresource App

Time budget: minutes for the scaffold, the rest is your actual requirement.

## 1. Create the folder

```text
clientui/apps/<app-key>/
├── app.ts              # registration, copy from template/
├── <Name>View.tsx      # form-like layout of kit controls
└── <Name>ViewModel.ts  # Observables + handlers (omit for trivial apps)
```

## 2. Register

`app.ts`:

```ts
import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { MyView } from "./MyView";
import { MyViewModel } from "./MyViewModel";

registerApp(
  "my-app",
  createViewApp("My app title", MyView, (host) => ({
    viewModel: new MyViewModel(host.context),
  }))
);
```

Add one import line to `clientui/apps/index.ts` (keep the category grouping).
An app the manifest does not import is tree-shaken out of the bundle entirely,
so this line is what makes your app exist.

While you write the View, keep the `observe()` rule in reach: **every
Observable whose `.value` the View reads must be listed in `this.observe(...)`
in the View's constructor.** Forgetting one fails silently (the screen just
stops updating), which makes it the one contract worth memorizing. The
Storybook story "Sample Patterns → End-to-end wiring" shows the whole
View + ViewModel + provider assembly in one place.

## 3. See it before you have an org (Storybook scenario)

Your new app will NOT appear in Storybook by itself: the sample screens there
are hand-written scenario stories under `tests/storybook/scenarios/`, running
against the shared fake context. Writing one for your app is the supported
way to see it render, click through it, and demo it with no Dataverse org at
all:

1. Copy the closest story in `tests/storybook/scenarios/` (for a form-shaped
   app, the wizard or master-detail one).
2. Seed `createFakeViewModelContext` (`tests/mocks/fakeViewModelContext.ts`)
   with the metadata and query results your app reads: `attributes` for every
   `entity.attribute` a smart control binds, `queryResults` keyed by entity
   for whatever the ViewModel fetches.
3. Render your View inside `ViewModelContextProvider` with that fake context
   (the existing stories show the exact wrapper; `smartStoryHarness.tsx` adds
   client-side contains/orderby semantics so lookups filter as you type).

`npm run storybook`, and your app runs on fixture data. The first LIVE render
(step 4) still needs a deployed org; plan for that, it is the part of the
journey no local tool covers.

## 4. Launch (needs a deployed org)

Deploy first: `npm run build`, then `deployment/deploy.ps1` publishes the
shell webresources (see deployment.md for the SPKL setup). Then launch in-app,
not as a top-level `/WebResources/...` URL (see deployment.md, "Hosting the
shell"):

- From a ribbon/hook: `context.navigation.openClientUI("new_clientui.html", "my-app", { anyPayload: "…" })`
- Quick test: inside a model-driven app, open
  `…/main.aspx?appid=<app-id>&pagetype=webresource&webresourceName=new_clientui.html&data=<json>`
  where `<json>` is a URL-encoded `{"app":"my-app"}`. In the browser console,
  `encodeURIComponent('{"app":"my-app"}')` produces the encoded value
  (`%7B%22app%22%3A%22my-app%22%7D`).
- The payload arrives as `host.params.data`; query params as `host.params.query`.

## 5. When to use RecordReady

Only when the app is embedded on a form **and** needs the record id before it
can create state:

```tsx
<RecordReady>
  {(recordId, entityName) => <MyForm recordId={recordId} />}
</RecordReady>
```

It waits indefinitely by design (an unsaved form may be saved later). Search
apps and standalone pages render without it.

## 6. Rules of the road

- Standard fields → Smart controls (`entity` + `attribute` + value Observable).
- Custom data (merged queries, computed rows) → ViewModel fetch → presentational
  `DataGrid`/`PersonaList`/etc.
- The View never executes queries and never receives context, if you're
  tempted, that logic belongs in the ViewModel or a smart control.
