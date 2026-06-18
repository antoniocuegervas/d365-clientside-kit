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

## 3. Launch

- Direct: `…/new_clientui.html?app=my-app`
- From a ribbon/hook: `context.navigation.openClientUI("new_clientui.html", "my-app", { anyPayload: "…" })`
- The payload arrives as `host.params.data`; query params as `host.params.query`.

## 4. When to use RecordReady

Only when the app is embedded on a form **and** needs the record id before it
can create state:

```tsx
<RecordReady>
  {(recordId, entityName) => <MyForm recordId={recordId} />}
</RecordReady>
```

It waits indefinitely by design (an unsaved form may be saved later). Search
apps and standalone pages render without it.

## 5. Rules of the road

- Standard fields → Smart controls (`entity` + `attribute` + value Observable).
- Custom data (merged queries, computed rows) → ViewModel fetch → presentational
  `DataGrid`/`PersonaList`/etc.
- The View never executes queries and never receives context, if you're
  tempted, that logic belongs in the ViewModel or a smart control.
