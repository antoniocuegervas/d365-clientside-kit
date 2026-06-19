# Gotchas

Sharp edges that are not obvious from the type signatures. Skim before you reach
for a Web API or host call that behaves differently than you expect.

## Web API: which call routes where

`context.webAPI` is Xrm-shaped, but not every method goes to the native host.
On a v9 webresource or PCF control you are almost always operating against the
current Dataverse instance, and those calls route straight to
`Xrm.WebApi` / the ComponentFramework Web API. The exceptions ride the
`CdsClient` (a same-origin XHR client) on purpose:

| Method | Modern webresource | PCF | Legacy V8 |
|--------|--------------------|-----|-----------|
| `createRecord` / `updateRecord` / `deleteRecord` / `retrieveRecord` / `retrieveMultipleRecords` | native | native | cds-client |
| `fetchPage`, `retrieveMultipleByUrl` | cds-client | cds-client | cds-client |
| `executeAction`, `executeWorkflow` | cds-client | cds-client | cds-client |
| `execute`, `executeMultiple` | native | cds-client | cds-client |

Why the non-obvious rows:

- `fetchPage` / `retrieveMultipleByUrl` ride cds-client everywhere because
  `Xrm.WebApi` drops the FetchXML paging annotations and cannot re-issue an
  absolute `@odata.nextLink`.
- `executeAction` / `executeWorkflow` ride cds-client everywhere so app code
  never has to hand-build the `Xrm.WebApi.online.execute` request-object
  contract for the common "run this action" case.
- `execute` / `executeMultiple` use the native execute on modern (full
  action/function/CRUD support) and emulate it over cds-client on PCF and V8,
  where there is no native execute. The cds-client emulation runs actions and
  functions and rejects CRUD requests, pointing you at the dedicated
  create/update/delete/retrieve methods.

### Routing is transparent

Which host a method lands on does not change what you get back. The cds-client
paths are held to parity with, or a superset of, the native ones, with no
flow-control differences:

- **Writes** return the same `{ entityType, id }` on every host.
- **Reads** return the same `{ entities, nextLink }` core; the cds-client paths
  add more (all annotations, and the FetchXML paging fields native drops), never
  less.
- **`execute`** returns the same `IExecuteResponse` everywhere and resolves with
  `ok: false` on an HTTP error, rejecting only on a network failure (fetch
  semantics), on native and cds-client alike.

So you code against the contract, not the host.

## `executeAction` vs `execute`: ergonomic vs standard

Both can run a custom action and hit the same endpoint, but they are not the
same method and neither wraps the other:

- **`executeAction(name, params?, boundTo?)`** is the **ergonomic** path. Action
  only. Positional args in, the **parsed body** out. Reach for this first.
- **`execute(request)`** is the **standard** path mirroring
  `Xrm.WebApi.online.execute`. Actions *and* functions. You pass a request
  object (parameter values plus a `getMetadata()`), and you get a **fetch-like
  response** back, so call `.json()` for the body. Use it when you already have
  an Xrm-shaped request or need a function.

They stay separate because their bound-target inputs differ: `executeAction`
receives an already-pluralized entity set, while `execute` takes a logical name
it pluralizes itself. Forcing one through the other would add plumbing that earns
nothing.

`executeWorkflow` is a thin ergonomic call built on `executeAction`.

## V8 (CRM 8.x) is best-effort, never a silent no-op

The legacy adapter maps the subset 8.x exposes and rejects the rest with a clear
"not supported on the CRM 8.x host" error rather than quietly doing nothing.
Examples: `navigateTo` beyond entityrecord/webresource, `openFile`, the current
app properties on `globalContext`, and the newer `formContext` members. Treat a
rejection as "this host can't do it", not as a bug.

## `formContext` is the full mirror; `formAccess` is a facade

`context.formContext` is the full form object model (data, ui, attributes,
controls, tabs, sections, BPF process). `context.formAccess` is a thin facade
over it for the common id/entity/attribute reads. Both are undefined when the
app is not hosted on (or beside) a record form, and on PCF, which has no form
context. Reach for `formAccess` for a quick read; drop to `formContext` for
anything more.
