# KitCounterpartyGrid

A virtual dataset PCF for the account form's **Activities** subgrid. It renders
the subgrid view's own columns plus two columns no native activitypointer-bound
view can express:

- **Counterparty**, the external party on the other end of the activity (the
  account or contact), resolved from the activity's parties.
- **Role**, that party's `participationtypemask` (Sender, To Recipient, Required
  attendee, and so on).

## Why this is a PCF (and not a custom page)

Host placement. A PCF can BE the bound subgrid on the form; a custom page cannot
occupy that slot. This is the Tier 1 line: it is a capability difference, not a
convenience one.

## How it works

The platform hands the control the page of `activitypointer` rows the subgrid is
showing (common columns + sort). For that page the control runs ONE
`activityparty` query, filtered by the page's `activityid`s, with annotations on,
so the party name, the party's target type, and the role label all come back
inline (no per-row lookups). Each party is classified by its TARGET TYPE, account
or contact is external (a counterparty), systemuser/team/queue is internal, so it
works for every activity type, including custom ones, with no per-type code.
Resolving by target type (not by `directioncode`, which lives only on the
per-type tables, not on activitypointer) is the whole trick.

Verified against a live org while building: a single `activityparty` query
returns `_partyid_value@OData.Community.Display.V1.FormattedValue` (name),
`_partyid_value@Microsoft.Dynamics.CRM.lookuplogicalname` (target type), and
`participationtypemask@OData.Community.Display.V1.FormattedValue` (role) inline for
account/contact parties. (The auto-created systemuser "Owner" party has no inline
name, which is moot: it is internal, never a counterparty.)

## Honest caveats (all render-time)

- **Disambiguation is real logic, not "zero logic."** Internal-only activities (a
  task between two users) have no counterparty and render blank. Multi-party
  activities (an email to several) show the first external party plus "(+N more)".
  Non-person party targets (knowledgearticle, equipment, bookable resource) are
  not counterparties and are ignored. The **host record is excluded**: every
  activity regarding the account auto-carries that account as a party with the
  "Regarding" role (and account is an external type), so without this rule the
  account would show as its own counterparty; the Regarding party is dropped from
  the candidates. (Found while testing against a live org, not in theory.)
- **The synthesized columns are render-only.** They are not available to Export to
  Excel, Advanced Find, views, charts, or rollups. Sort/filter on them is
  page-local, which is platform parity: the native cross-type list cannot sort
  beyond common `activitypointer` columns either.
- **Two-phase render.** The view's own columns paint immediately; Counterparty and
  Role fill in once the `activityparty` query resolves.
- **Field-level security (FLS).** Parties the user cannot see degrade to blank; they do not break the row.
- **"Include related" is not reproduced.** The native "Open Activity Associated
  View" has an Include-related toggle that rolls up child-record activities. This
  control shows the activities the subgrid is bound to and does not reproduce that
  rollup. Disclosed here so the side-by-side is honest.
- **Mobile/offline out of scope for v1** (desktop model-driven). A dataset PCF
  could be made offline-capable later; the current limiter is the data layer, not
  the host.

## The honest config counterpart

Ship this beside the account's **Open Activity Associated View**, configured as
well as config allows. That view can show common `activitypointer` columns, but it
**cannot add a counterparty or role column**: a PartyList is not an addable
grid/view column, and `participationtypemask` lives on the `activityparty`
rows, not on activitypointer, so there is nothing to add.

The config route to match this control would be: a shadow `counterparty` column on
the activity, a plugin per activity type to populate it (and keep it in sync), a
backfill for existing rows, and perpetual drift risk, with silent gaps whenever a
new or custom activity type appears. That is write-time denormalization. This
control synthesizes the same columns at READ time: no schema, no backfill,
automatic coverage of new and custom activity types.

## Bundle: React 18 + Fluent v9 are bundled (not platform libraries)

This is a `control-type="standard"` control that BUNDLES React 18 and Fluent v9,
the same as the kit's other PCFs. The platform-library route was tried first and
does not work for this kit: the platform exposes Fluent v9 only PINNED at 9.46.2,
and this kit is on 9.74.1, so a virtual control that relies on the platform's
Fluent renders to nothing (anything introduced after 9.46.2 is missing at
runtime). Bundling is the working path. The cost is bundle size (React + Fluent v9
ride in the control bundle), which is accepted. See the decision-log note for the
full finding, including the documented "drop the Fluent platform-library line"
workaround that this control effectively takes by being a standard control.

## Build

Standard PCF toolchain (outside the repo's root `npm run verify`, the same as the
other controls under `pcfs/`):

```
npm install
npm run build
```
