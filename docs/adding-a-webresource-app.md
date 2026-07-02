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

The `host` your props factory receives carries three things (`IAppHost` in
`clientui/AppContract.ts`): `host.context`, the `IViewModelContext` your
ViewModel talks to (Web API, metadata, navigation); `host.params`, the launch
parameters (`params.data` is the payload from `openClientUI` or the `data=`
query value, `params.query` the raw query string pairs); and `host.container`,
the root element, for the rare app that measures its viewport. When the props
object you return includes a `viewModel` with a `dispose()` method,
`createViewApp` disposes it on unmount for you.

While you write the View, keep the `observe()` rule in reach: **every
Observable whose `.value` the View reads must be listed in `this.observe(...)`
in the View's constructor.** Forgetting one used to fail silently (the screen
just stops updating); development builds now catch it, logging a console
warning that names the component when a render reads an Observable it does
not observe (production builds strip the check). The Storybook story
"Sample Patterns → End-to-end wiring" shows the whole View + ViewModel +
provider assembly in one place.

## 3. See it before you have an org (Storybook scenario)

Your new app will NOT appear in Storybook by itself: the sample screens there
are hand-written scenario stories under `tests/storybook/scenarios/`, running
against the shared fake context. Writing one for your app is the supported
way to see it render, click through it, and demo it with no Dataverse org at
all:

1. Copy `tests/storybook/scenarios/templateAppRealWiring.stories.tsx` (the
   story "Sample Patterns → Template App (real View + ViewModel)"). It renders
   the template app's ACTUAL View and ViewModel against the fake context,
   which is exactly the shape your story needs; point its imports at your app.
   (Most other scenario stories are presentational recreations built for
   reviewing control behavior, not the pattern to copy for this.)
2. Seed `createFakeViewModelContext` (`tests/mocks/fakeViewModelContext.ts`)
   with the metadata and query results your app reads: `attributes` for every
   `entity.attribute` a smart control binds, `queryResults` keyed by entity
   for whatever the ViewModel fetches. One trap when your app has a lookup:
   the fake defaults every entity's primary name attribute to `name`, so seed
   an `entities:` block for the lookup's target when its real primary name is
   different (contact and systemuser use `fullname`), or the seeded result
   rows render blank and the story looks broken.
3. Render your View inside `ViewModelContextProvider` with that fake context
   (the story from step 1 shows the exact wrapper; wrap the context with
   `withClientQuerySemantics` from `tests/storybook/smart/smartStoryHarness.tsx`
   if you want lookups and grids to actually filter/sort as you type instead
   of replaying the seeded list).

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
