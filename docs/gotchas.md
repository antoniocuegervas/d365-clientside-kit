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

## `overflowY: "auto"` also turns on a left-right scrollbar

What you see: you click into a text field and a scrollbar flickers in along the
bottom of the panel, then disappears when you click away. It only appears while a
field has focus, which makes it look random.

Two small things are meeting here. First, the panel sets `overflowY: "auto"` so a
long form can scroll up and down. CSS quietly switches on left-right scrolling at
the same time: if you make one direction scrollable and leave the other one
alone, the browser makes both scrollable. So the panel will show a horizontal
scrollbar the moment anything inside it is even slightly wider than the panel.

Second, a focused field is just wide enough to trip it. Fluent draws the focus
underline 1px past each side of the field (the underline is a `::after` element
set to `-1px` on the left and right). When the field sits flush against the panel
edge, that 1px tips the content over the edge and the scrollbar appears; on blur
the underline goes away and so does the scrollbar.

The fix is to say explicitly that only up-and-down scrolling is wanted:

```ts
panel: { overflowY: "auto", overflowX: "hidden" },
```

Most panels never show this, because their padding leaves more than 1px of room
around the fields and absorbs the bleed. It turns up only where a field reaches
the panel edge with no padding, like the wizard's step area.

## Opening an activity from a grid leans on the activitytypecode label

`SmartViewGrid` opens an activity row's real form (phonecall, task, appointment)
by reading the row's `activitytypecode` formatted value, because
`activitypointer` itself has no openable form. That formatted value is the entity
logical name in an English org, which is why it works. The kit trims it and
lowercases it, but it cannot rescue a localized label: in a non-English org the
formatted value can come back localized (for example "Telefonanruf"), which is
not a logical name and will not open. If you run activity grids in a non-English
org, supply your own `onItemInvoked` that maps the row to a logical name (for
example from the numeric type code) rather than relying on the label.

## Entity set names are a convention first, metadata-learned second

The cds-client paths (the V8 write methods, `fetchPage`, bound `executeAction`,
and `@odata.bind` via `LibraryUtils.odataBind`) need an entity SET name, not a
logical name. `LibraryUtils.entitySetName` derives it by Dataverse pluralization,
which is right for the vast majority of entities. For the rare custom entity whose
set name breaks the convention, the guess would be wrong, so `MetadataService`
teaches the pluralizer the real `EntitySetName` whenever it loads an entity's
metadata: any later resolution for that entity returns the authoritative name.
This is opportunistic, an entity whose metadata has never been loaded still uses
the convention. Where you know the convention is wrong and no metadata has been
loaded, pass the explicit set name (for example the `entitySet` argument on
`odataBind`).

## Money precision comes from PrecisionSource, not just the attribute

A money attribute's own `Precision` is not always the precision the platform
shows. `PrecisionSource` decides which one applies: 0 uses the attribute
`Precision`, 1 uses the record currency's precision, 2 uses the org pricing
precision. `SmartNumberField` resolves 0 and 1 exactly (the currency precision
rides in on `getCurrencySymbol`). Source 2 (org pricing precision) is uncommon
and is not fetched: those fields fall back to the attribute precision, so treat
their displayed decimals as best-effort.

## The date picker's first day of week follows Language, not the Format locale

Dataverse derives the calendar's first day of week from the user's Language, not
their Format/Region locale. English ships only as en-US (1033), so a user with UK
formatting (dd/MM/yyyy) but English language still gets a Sunday-first calendar.
This is not a kit bug: the native model-driven date picker shows Sunday too, so
the kit matches it rather than disagreeing with the native pickers beside it. If a
deployment wants the calendar to follow the format locale (Monday for the UK),
pass `firstDayOfWeek` to `SmartDatePicker` (0 = Sunday ... 6 = Saturday), computed
however the deployment prefers (for example
`new Intl.Locale("en-GB").weekInfo?.firstDay`). The default stays
matched-to-platform on purpose.

## A PCF that bundles Fluent v9 pins to the host's shared tabster

When a PCF bundles its own React + Fluent v9 (instead of using the platform-library
mechanism, which is pinned to an older Fluent), the control shares one tabster
instance with the model-driven app on `window`. If the bundled tabster is newer
than the host's, it augments that shared instance with a shape it does not have and
throws during init, blanking the control. The symptom is a blank container plus the
platform's unhandled-error dialog, with no data queries fired, so it reads as a
broken control when it is really a version collision.

Pin the Fluent v9 tabster chain in the PCF's `package.json` to the host's floor,
currently `@fluentui/react-components` at 9.68.0, which resolves
`@fluentui/react-tabster` to 9.26.1 and `tabster` to 8.5.5, with an `overrides`
block forcing the last two. If a Dynamics update moves the host's tabster, re-pin to
match. Ship the Release (production) build: the debug bundle can exceed the 5 MB
webresource size ceiling.

Bundling Fluent v9 also trips the Solution Checker: running it on the PCF reports
`web-avoid-window-top` (High) several times against `bundle.js`. These are false
positives. The rule pattern-matches `.top` in minified code and flags Fluent's
positioning engine reading `DOMRect.top` / `style.top`, not `window.top` (the kit's
own code never uses it). They are advisory and safe to dismiss, relevant only for
AppSource certification, where they are flagged to the certification team as false
positives.

## A PCF redeploy needs a manifest version bump, or the platform serves the old bundle

Reimporting a PCF solution with the SAME `<control version>` succeeds and publishes,
but the form keeps running the cached previous build, so a fix looks like it did not
deploy. Bump the version in `ControlManifest.Input.xml` (for example 1.0.0 to 1.0.1)
on every redeploy. This is a hard requirement, not the resource-cache propagation
lag a webresource has (which a fresh session clears); without the bump the platform
never picks up the new bundle.

## A Fluent v9 popover in a PCF needs inline rendering, or its background is transparent

A Fluent `Popover`/`Menu` portals its surface by default. In a PCF the default portal
mounts OUTSIDE the control's themed `FluentProvider`, so the theme CSS variables
(`--colorNeutralBackground1`, `--shadow16`, and the rest) are undefined there and any
token-based background, shadow, or radius resolves to nothing, the surface renders
transparent with the form showing through. Render the surface `inline` (it then stays
inside the themed provider); it is not clipped because Fluent positions it `fixed`.
The kit's `NativeLookupField` flyout does this, so it renders the same in the
webresource and a field-bound PCF.

## Column (field-level) security is the form's job, not the kit's

Native model-driven forms resolve each user's effective access to a column-secured
field and render it accordingly: masked or blank with no read, read-only with no
update. That resolution comes from the form runtime, which a webresource control
does not have. So the kit takes the safe, honest path rather than pretend to match
it:

- A column-secured attribute (`IAttributeMetadata.isSecured`) renders **read-only
  by default** in the smart controls, so a field the current user may not be allowed
  to update never appears editable (which would only fail at save). A host that
  knows the user can edit it passes `readOnly={false}`.
- Read-denied values still show as empty: the Web API returns a secured column the
  user cannot read as null, and the kit cannot tell that apart from a genuinely
  empty value without the form runtime.

The kit deliberately does not resolve per-user column permissions itself. If a
custom UI genuinely needs native-grade, per-user field security, that is
a sign the requirement has outgrown a client-side kit: use a native form, where the
platform enforces it. This kit is for the cases where that enforcement is not the
point.
