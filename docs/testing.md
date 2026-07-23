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
npm run smoke           # modern + legacy Xrm mocks against built artifacts
npm run storybook       # dev server on :6006
npm run build-storybook # CI gate
npm run verify          # the whole local gate in order
```

PCFs: `cd pcfs/<Control> && npm run build`.

## Test infrastructure (reuse, don't reinvent)

- `tests/mocks/XrmMock.ts`, `createModernXrmMock` / `createV8XrmMock`,
  recording mocks shared by unit and smoke tests, plus
  `makeEntityMetadataMock`, the builder for standard-shaped entity metadata
  (PascalCase members, ItemCollection `Attributes`, `attributeDescriptor`
  payloads), the shape every host serves.
- `tests/mocks/FakeXhr.ts`, scriptable XMLHttpRequest server for cds-client,
  MetadataService, and CdsEntityMetadataProvider tests.
- `tests/mocks/fakeViewModelContext.ts`, in-memory `IViewModelContext` with
  scriptable attribute metadata (script the PascalCase `attributeDescriptor`
  payload per "entity.attribute" key, e.g. `Type: "picklist"`, `MaxLength`,
  `OptionSet`), views, and query results; use for smart controls and
  ViewModels.

## Conventions

- Test paths mirror production paths; **no co-located** `*.test.tsx` or
  `*.stories.tsx` next to sources.
- Storybook stories use fixture data only, if a story needs CRM data, it
  arrives as a plain value, exactly like a ViewModel would supply it. Zero
  CRM mocks in stories is a hard rule.
- Hooks get smoke/DI coverage (registry shape + handler behavior), not
  exhaustive business-logic suites, they are templates.

## The context adapter tester

A self-contained diagnostic webresource that runs the kit's context adapter
surface live against whatever org it is opened in (modern 9.x or CRM 8.2), so
the v8 path can be exercised on a real 8.x org. Source under
`tests/adapter-tester/`; it reuses the kit's `findXrm`/`createContextFromXrm`
and touches only the context, no UI tier.

- **Build**: `npm run build` compiles it alongside the shell bundles into
  `dist/tester/<prefix>adaptertester.html`, one file with the JS inlined (about
  100 KB). It is not in `deploy.ps1` or the solution project: delivery is manual.
- **Upload**: in the target org, create one webresource of type HTML named
  `<prefix>adaptertester.html`, upload that file, and publish.
- **Open** (works on 8.2 and modern, no query parameters):
  `<org>/main.aspx?pagetype=webresource&webresourceName=<prefix>adaptertester.html`
- **Tier 1** (read-only) auto-runs on load, grouped into sections: Context, Data
  reads, FetchXML channel, Metadata, and Capability probes. It covers the reads,
  the annotation/paging/link-alias shapes on the FetchXML channel, the
  `getEntityMetadata` and Picklist-cast synthesis (the key v8 probes), the
  usersettings/savedQuery/currency reads, an unbound WhoAmI, the 8.x
  host-degradation check, and informational platform classifiers (v9.0 path,
  `$apply`, collection `$expand`, `$count`).
- **API version lab** (tier 1, same-origin only): sweeps which `/api/data/vX.Y/`
  paths the org serves, then runs the kit's real v8 client code (FetchXML,
  metadata synthesis, classifiers) against `v8.2`. Contract-level only: the same
  modern engine sits behind every path, so this measures the API-version
  contract, not an old server; a real 8.2 org run stays definitive.
- **API version selector**: after the sweep, pick any served version to re-run the
  data-channel tests against a context pinned to that path (host-surface and version-explicit
  tests skip while pinned; the pin is stamped on header, summary, and report). The link-alias
  probe asserts the kit delivers dotted alias keys, since the client now normalizes v8 `x002e` keys.
- **Tier 2** (mutating) runs only from its labeled button: create/update/retrieve/
  delete, the escaped-literal positive match, a polymorphic `@odata.bind`, and a
  `return=representation` classifier. Every test cleans up in all cases and
  reports cleanup status separately.
- **Transcripts**: every result shows the literal operations it ran (OData query
  strings, FetchXML documents, write payloads, request URLs and headers) in a
  monospace block, kept even on failure.
- **Capability matrix**: a summary strip states how many kit-REQUIRED platform
  capabilities are confirmed, failed, or not yet probed; a panel lists every
  capability (required vs informational) with its verdict, plus the features the
  kit deliberately does NOT use, so a v9-only dependency cannot ship invisibly.
- **Copy report**: produces a paste-friendly plaintext block with the header,
  summary, capability verdict line, per-section results with their transcripts,
  the capability matrix, and the does-not-use list.

Scope: run against a modern org, the tester already exercises the kit's real v8
client code at the v8.2 contract, which is how the `x002e` alias encoding and
the absent `savedquery.layoutjson` were found and fixed. That is contract-level
evidence on a modern engine, so the v8 path stays best-effort until the tester
has been run on a live 8.x server and the report reviewed.

## Manual sandbox checklist (human acceptance)

1. Deploy webresources (see deployment.md), then open the shell inside a
   model-driven app (deployment.md, "Hosting the shell"), e.g. navigate to
   `…&pagetype=webresource&webresourceName=new_clientui.html&data=%7B%22app%22%3A%22samples%22%7D`.
2. Walk each sample; compare controls side-by-side with native UCI forms
   (labels, spacing, focus, validation, hover).
3. Register the example hooks on Account form/ribbon/grid; verify behavior.
4. Install PCFs from `pcfs/*/out` into a solution; bind to columns and verify.
