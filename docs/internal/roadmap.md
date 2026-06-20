# Roadmap and open ideas

The original forward-looking items here have shipped (recorded under "Shipped").
One new direction is open: in-app release communication. One idea stays parked
for lack of a v8 environment.

## Direction: in-app "what's new" for a release

### The gap

When a team ships a release (new forms, fields, custom UI from this kit), end
users rarely learn what changed. The usual channels each miss in a different way:
email and Teams are push, out of context, and easy to ignore; a SharePoint or
wiki page lives outside the app the change is in. Model-driven **in-app
notifications** (the `appnotification` table) are real, but they are per-event,
transient toasts in the notification center, not a curated, versioned "here is
what changed since you were last here" digest that a product owner controls per
release, with read-state and a browsable history.

### Why this kit fits

- It is custom UI over the Web API, so a "What's new" panel renders in Fluent v9
  and reads as native, not a foreign page.
- It already owns the launch surface: `openClientUI` opens an app as a centered
  dialog or a side pane from a command-bar button, the two shapes this wants.
- The note list is exactly the host-owned collection `ObservableArray` was built
  for: a View binds it, the ViewModel loads and gates it.
- Per-user "seen" gating is ordinary ViewModel logic over the Web API: compare
  the latest published release against what this user last acknowledged.

### Framing (keep this honest)

This renders product-owner-authored content; it is not a CMS. The PO authors
release notes on a **standard model-driven form** over a Dataverse table, the
same boundary the wizard keeps: the kit renders and gates, the platform authors.
Out of scope: a rich WYSIWYG authoring UI, scheduling or campaign targeting, A/B
audiences. It is complementary to in-app notifications, not a replacement: use
notifications for transient, per-event pings; use this for the release-scoped,
revisitable changelog.

### Pieces to build (when picked up)

1. A **release-notes data model**: a Dataverse table (version or semver,
   published date, title, summary, body, a New/Improved/Fixed category, and an
   optional audience by security role or team). Authored through a normal form,
   so no custom authoring UI is in scope.
2. A **presentational "What's new" surface**: a dialog or side-pane list of
   entries (newest first), category badges, and a per-entry expand. CRM-agnostic,
   so it renders in Storybook from fixtures with zero mocks.
3. A **seen/acknowledged strategy**: store each user's last-seen release so the
   surface shows only what is new and marks it read on dismiss. Cross-device
   means Dataverse-backed (a per-user acknowledgement row, or a user setting),
   not browser storage. This is the main open design question.
4. A **launch pattern**: auto-open once per user when the latest published
   release is newer than their last-seen, plus a manual "What's new" entry point
   on the command bar. Both reuse `openClientUI` (dialog or side pane).
5. A **smart variant (optional)**: resolve the category option-set labels and the
   published-date format from metadata, so a metadata-aware entry looks native
   for free, consistent with the rest of the smart tier.

### Possible avenue, not planned

Sourcing notes from outside Dataverse (a CI release pipeline writing entries on
deploy, or a markdown file in the solution) would let engineering, not only the
PO, append "what changed." Noted as a nice-to-have; the Dataverse-authored path
is the honest default because it needs no extra infrastructure.

### README follow-up

When this is picked up, consider a "When to reach for it" row for in-app release
communication, where in-app notifications are too transient and email is out of
context.

## Shipped (were roadmap items)

- **Multi-stage gated data input (the wizard capability).** Built as a reusable
  engine plus a sample app:
  - `shared/wizard/WizardViewModel.ts`: step sequence, per-step gating
    (`isStepValid`), back/next, an `isDirty` unsaved-progress flag, `isBusy`
    navigation lock, and a `commit` seam for atomic persistence.
  - `clientui/apps/sample-new-account-wizard`: a three-step, standard-entity
    "new account + primary contact" flow on any plain Dataverse org, with the
    in-memory-draft-then-commit strategy and a custom-API drop-in documented at
    the `commit()` seam.
  - Launch helper: `navigation.openClientUI(...)` opens a webresource app as a
    centered dialog or a side pane (see `clienthooks/ribbon/AccountRibbon.ts`).
  - The README "When to reach for it" table carries the multi-stage gated-input
    row.

- **Required-field demos react to input.** Every required-field Storybook story
  now wires the validation message to track emptiness as the user types, rather
  than showing it statically (the presentational field stories under
  `tests/storybook/controls/presentational`).

## Parked (needs an environment we do not have)

- **Classic dialog XML -> generated wizard.** Classic dialog definitions are XML
  with a defined schema (pages, typed prompts, responses, conditions, query and
  set-value steps), close to a formal spec of a wizard. A transform from that XML
  into a generated ViewModel plus step Views could accelerate rebuilding legacy
  dialogs. It is an uncommon need (orgs on CRM v8 or earlier are out of support
  and few remain), and building or testing it needs a legacy v8 environment,
  which is not currently available. Noted as a nice-to-have if such an
  environment turns up.
