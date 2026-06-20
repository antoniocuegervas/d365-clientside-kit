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
| `executeAction`, `executeClassicWorkflow` | cds-client | cds-client | cds-client |
| `execute`, `executeMultiple` | native | cds-client | cds-client |

Why the non-obvious rows:

- `fetchPage` / `retrieveMultipleByUrl` ride cds-client everywhere because
  `Xrm.WebApi` drops the FetchXML paging annotations and cannot re-issue an
  absolute `@odata.nextLink`.
- `executeAction` / `executeClassicWorkflow` ride cds-client everywhere so app code
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

`executeClassicWorkflow` is a thin ergonomic call built on `executeAction`. It is
named "classic" to set it apart from Copilot Studio workflows, which are unrelated.

## Running flows and the new workflows

`executeClassicWorkflow` exists only because classic workflows have a dedicated
Dataverse action (`ExecuteWorkflow`). There is no equivalent "run by id" verb for
Power Automate cloud flows or Copilot Studio workflows, and that is not a gap:
the supported, kit-friendly way to run either on demand is to wrap it in a
Dataverse Custom API (or custom action) and call `executeAction`. That stays
same-origin, uses the ambient session, and gives you a typed response, exactly
like any other action. So the presence of a method for classic workflows does
not mean flows are second-class; they just go through `executeAction`.

The one case that does not fit is an HTTP-triggered cloud flow: its endpoint is
cross-origin with a secret-bearing URL, which is outside cds-client's
same-origin, ambient-credential scope. Call those from server-side or a
dedicated integration, not from here.

## V8 (CRM 8.x) is best-effort, but never silently does nothing

The legacy adapter maps the subset 8.x exposes and rejects the rest with a clear
"not supported on the CRM 8.x host" error rather than quietly doing nothing.
Examples: `navigateTo` beyond entityrecord/webresource, `openFile`, the current
app properties on `globalContext`, and the newer `formContext` members. Treat a
rejection as "this host can't do it", not as a bug.

## Entity icon URLs rest on a path convention, not a documented API

`metadata.getEntityIconUrl` resolves an entity's icon two ways: a custom entity
(logical name contains "_") points at its `IconVectorName` webresource, an OOTB
entity points at `/_imgs/svg_<ObjectTypeCode>.svg`. The OOTB path is a tested
convention carried from production, not a documented platform contract, so a
platform change could start returning a 404. Treat the icon URL as best-effort:
fine for a decorative glyph, not something to hard-depend on. The method returns
`undefined` when it cannot resolve a name, but a resolved-but-stale URL is still
possible.

## `formContext` is the full mirror; `formAccess` is a small shortcut

`context.formContext` is the full form object model (data, ui, attributes,
controls, tabs, sections, BPF process). `context.formAccess` is a small shortcut
onto it for the common id/entity/attribute reads. Both are undefined when the
app is not hosted on (or beside) a record form, and on PCF, which has no form
context. Reach for `formAccess` for a quick read; drop to `formContext` for
anything more.

## An Observable holding a list does not notice when you change one item

An `Observable` only re-renders the view when you give it a whole new value. If
it holds a list and you change one item inside that list, the view never finds
out:

```ts
rows.value[0].selected = true; // nothing happens: the view keeps showing the old data
```

Replacing the whole list works fine, and a top-level `rows.value.push(x)`
actually throws in development to warn you. It is only reaching inside an item
that goes unnoticed. Two ways to handle it:

- Build a new list instead of editing in place: `rows.update(r => r.map((row, i)
  => i === 0 ? { ...row, selected: true } : row))`. A new list means the view
  refreshes.
- Better, for a list a grid or list view shows, use `ObservableArray<T>`. You
  change it through its methods (`push`, `removeAt`, `updateAt`, `replaceWhere`,
  and so on), which always refresh the view, and in development it catches an
  accidental in-place edit by throwing instead of leaving the grid stale. You
  observe it exactly like an `Observable`.

`DataGrid` takes its `rows` this way (a plain array, an `Observable`, or an
`ObservableArray`), so a grid bound to an `ObservableArray` updates when you
change a row through one of those methods. The other list props (selection,
lookup results, options) stay on a plain `Observable`: they hold ids or lists
that are replaced whole, so there is nothing to reach into.

## Fluent's Divider grows vertically in a column and pushes content down

A page laid out as a flex column (`display: flex; flexDirection: column`, which
every sample View uses) plus a Fluent `<Divider />` reads as an obvious "draw a
line between sections". It has a non-obvious catch: Fluent's `Divider` defaults
to `flex-grow: 1`. In a row that is what you want (the line fills the width), but
in a column it grows along the vertical axis and eats all the free space,
shoving everything below it down. The symptom is content that looks vertically
centered and visibly shifts as sections appear, even though nothing sets
`justify-content: center` anywhere.

Pin it whenever a `Divider` sits in a column layout:

```tsx
const useStyles = makeStyles({ divider: { flexGrow: 0 } });
// ...
<Divider className={styles.divider} />
```

## `overflowY: "auto"` quietly enables a horizontal scrollbar too

Setting only `overflowY: "auto"` on a scroll container looks like "let it scroll
vertically". The browser does more than that: when one axis is a scrolling value
and the other is `visible`, the `visible` one is computed to `auto` as well. So
the container can show a *horizontal* scrollbar whenever its content is even 1px
too wide. That 1px is easy to hit, a focused field is enough: Fluent's input
focus underline is an `::after` inset `-1px` on each side, so it bleeds just past
the edge, and a horizontal scrollbar pops in on focus and vanishes on blur.

For a container that should only scroll vertically, set `overflowX: "hidden"`
alongside `overflowY: "auto"`. (Containers with generous padding hide the symptom
because the padding absorbs the 1px; the ones where content reaches the edge,
like a stepper body, do not.)
