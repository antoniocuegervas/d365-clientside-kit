# Testing

| Layer | Tool | Where |
|---|---|---|
| Observables, utils, cds-client, context adapters | Jest (jsdom) | `tests/unit/**` (mirrors source paths) |
| Presentational controls | Storybook, fixture data ONLY | `tests/storybook/**` |
| Smart controls | Jest + scripted fake context | `tests/unit/shared/controls/smart/` |
| Shell + hooks bundles | jsdom smoke against PRODUCTION bundles | `tests/smoke/**` |
| End-to-end CRM | Manual checklist after sandbox deploy | below |

## Commands

```bash
npm run test            # unit tests (excludes smoke)
npm run build           # required before smoke, smoke loads dist/ bundles
npm run smoke           # modern + legacy host mocks against built artifacts
npm run storybook       # dev server on :6006
npm run build-storybook # CI gate
npm run verify          # the whole local gate in order
```

PCFs: `cd pcfs/<Control> && npm run build`.

## Test infrastructure (reuse, don't reinvent)

- `tests/mocks/XrmMock.ts`, `createModernXrmMock` / `createV8XrmMock`,
  recording mocks shared by unit and smoke tests.
- `tests/mocks/FakeXhr.ts`, scriptable XMLHttpRequest server for cds-client
  and MetadataService tests.
- `tests/mocks/fakeViewModelContext.ts`, in-memory `IViewModelContext` with
  scriptable attribute metadata, views, and query results; use for smart
  controls and ViewModels.

## Conventions

- Test paths mirror production paths; **no co-located** `*.test.tsx` or
  `*.stories.tsx` next to sources.
- Storybook stories use fixture data only, if a story needs CRM data, it
  arrives as a plain value, exactly like a ViewModel would supply it. Zero
  CRM mocks in stories is a hard rule (§17.1.3).
- Hooks get smoke/DI coverage (registry shape + handler behavior), not
  exhaustive business-logic suites, they are templates.

## Manual sandbox checklist (human acceptance)

1. Deploy webresources (see deployment.md), then open the shell inside a
   model-driven app (deployment.md, "Hosting the shell"), e.g. navigate to
   `…&pagetype=webresource&webresourceName=new_clientui.html&data=%7B%22app%22%3A%22samples%22%7D`.
2. Walk each sample; compare controls side-by-side with native UCI forms
   (labels, spacing, focus, validation, hover).
3. Register the example hooks on Account form/ribbon/grid; verify behavior.
4. Install PCFs from `pcfs/*/out` into a solution; bind to columns and verify.
