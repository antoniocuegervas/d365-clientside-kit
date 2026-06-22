import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartLookup> = {
  title: "Smart Controls/SmartLookup",
  component: SmartLookup,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Lookup field. The target entity and its primary name and id fields resolve from the " +
          "attribute. Inline mode (the default) searches that target as you type; dialog mode " +
          "opens the native CRM picker. The search source and filtering can be narrowed three " +
          "ways: a `viewId` or a `viewName` runs a saved view as the search, and `filterXml` " +
          "pre-filters the dialog's view. The value is an entity reference (id, logical name, " +
          "display name). " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartLookup>;

const company = new Observable<IEntityReference | null>(null);
const customer = new Observable<IEntityReference | null>(null);
const companyView = new Observable<IEntityReference | null>(null);
const companyViewById = new Observable<IEntityReference | null>(null);
const companyDialog = new Observable<IEntityReference | null>(null);
const companyFiltered = new Observable<IEntityReference | null>(null);
const companySeeded = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});
const required = makeRequired<IEntityReference>("Company is required.");

export const Inline: Story = {
  name: "Inline (search from metadata target)",
  render: () => (
    <SmartLookup entity="contact" attribute="parentcustomerid" value={company} searchDebounceMs={0} />
  ),
  parameters: sample(
    `// contact.parentcustomerid is a lookup whose metadata target is "account".
// Inline mode (the default) searches that target as the user types, matching
// the account's primary name field. No target or query is wired by hand.
const company = new Observable<IEntityReference | null>(null);

<SmartLookup entity="contact" attribute="parentcustomerid" value={company} />`,
    "Inline mode is embedded search-as-you-type. The target entity and its name/id fields come from the attribute's lookup metadata. (Stories set searchDebounceMs={0} so search fires immediately.)"
  ),
};

export const Polymorphic: Story = {
  name: "Polymorphic lookup (targetEntity)",
  render: () => (
    <SmartLookup
      entity="incident"
      attribute="customerid"
      value={customer}
      targetEntity="account"
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// incident.customerid is a Customer lookup: its metadata lists TWO targets
// (account and contact), so the control cannot guess which to search. Pass
// targetEntity to pick one (here account). Single-target lookups (like
// parentcustomerid above) resolve their target from metadata and need no
// targetEntity. The same applies to Owner lookups (systemuser or team).
const customer = new Observable<IEntityReference | null>(null);

<SmartLookup
  entity="incident"
  attribute="customerid"
  value={customer}
  targetEntity="account"
/>`,
    "Customer and Owner lookups (and any polymorphic lookup) list more than one target entity, so metadata cannot pick one. Pass targetEntity to choose which entity to search and select from."
  ),
};

export const Seeded: Story = {
  name: "Seeded value",
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companySeeded}
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// A lookup value is an entity reference (id + logical name + display name).
// Seed it and the control shows the chosen record straight away.
const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartLookup entity="contact" attribute="parentcustomerid" value={company} />`,
    "The value is an IEntityReference. Seeding one renders the selected record; clearing it is an explicit user action."
  ),
};

export const Dialog: Story = {
  name: "Dialog mode (native picker)",
  render: () => (
    <SmartLookup entity="contact" attribute="parentcustomerid" value={companyDialog} mode="dialog" />
  ),
  parameters: sample(
    `// mode="dialog" swaps inline search for the native CRM picker (recently
// used, view switching, create-new) through lookupObjects. The value
// Observable and onChange contract are identical to inline mode.
const company = new Observable<IEntityReference | null>(null);

<SmartLookup
  entity="contact"
  attribute="parentcustomerid"
  value={company}
  mode="dialog"
/>`,
    "Dialog mode is browse-only: you click Browse to open the native picker instead of typing. Reach for it when you want the platform picker's recently-used list, view switching, or create-new, rather than embedded search-as-you-type. The Browse button calls lookupObjects, a Dataverse host API, so it only opens a real picker inside a model-driven host (here the fake commits a seeded record to show the resolved state). Same value Observable as inline mode."
  ),
};

export const ViewByName: Story = {
  name: "View-driven search (by view name)",
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companyView}
      viewName="Active Accounts"
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// viewName runs a saved view as the search source, so an admin controls the
// columns and filters behind the inline search. The view is resolved by its
// display name at runtime (getViewByName), then the typed text is matched
// inside it: ?savedQuery={id}&$filter=contains(name,'...').
const company = new Observable<IEntityReference | null>(null);

<SmartLookup
  entity="contact"
  attribute="parentcustomerid"
  value={company}
  viewName="Active Accounts"
/>`,
    "viewName resolves a saved view by its display name and runs it as the search source. Use this when admins should own the lookup's columns and filters."
  ),
};

export const ViewById: Story = {
  name: "View-driven search (by view id)",
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companyViewById}
      viewId="99990000-0000-0000-0000-000000000009"
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// viewId is the same view-driven search, but pinned to a stable saved-query
// id instead of a display name, so a rename of the view cannot break it. No
// name resolution step: the id goes straight into ?savedQuery={id}.
const company = new Observable<IEntityReference | null>(null);

<SmartLookup
  entity="contact"
  attribute="parentcustomerid"
  value={company}
  viewId="99990000-0000-0000-0000-000000000009"
/>`,
    "viewId pins the search to a saved view by its stable id (no name lookup), so renaming the view will not break it."
  ),
};

export const FilterXml: Story = {
  name: "Dialog pre-filtered (filterXml)",
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companyFiltered}
      mode="dialog"
      filterXml="<filter type='and'><condition attribute='statecode' operator='eq' value='0' /></filter>"
    />
  ),
  parameters: sample(
    `// filterXml applies a FetchXML <filter> to the dialog's view, so the native
// picker only offers records that pass it (here, active accounts only). It is
// a dialog-mode option; inline search uses the OData "filter" prop instead.
const company = new Observable<IEntityReference | null>(null);

<SmartLookup
  entity="contact"
  attribute="parentcustomerid"
  value={company}
  mode="dialog"
  filterXml="<filter type='and'><condition attribute='statecode' operator='eq' value='0' /></filter>"
/>`,
    "filterXml constrains the dialog's records with a FetchXML filter (dialog mode only). For inline search, the OData `filter` prop plays the same role."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// The control writes company itself when a record is chosen or cleared; this
// onChange only keeps the error in step, clearing it once a record is present.
const company = new Observable<IEntityReference | null>(null);
const error = new Observable<string | undefined>("Company is required.");
const onChange = (v: IEntityReference | null) => {
  error.value = v ? undefined : "Company is required.";
};

<SmartLookup
  entity="contact"
  attribute="parentcustomerid"
  value={company}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The control writes the value Observable itself; the onChange shown only clears the error, which tracks the selection the way live form validation does."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companySeeded}
      disabled
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartLookup entity="contact" attribute="parentcustomerid" value={company} disabled />`,
    "Disabled greys the field and blocks interaction; the selected record stays visible but cannot be changed or cleared. Use readOnly to keep the record readable (as a link) without dimming."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companySeeded}
      readOnly
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartLookup entity="contact" attribute="parentcustomerid" value={company} readOnly />`,
    "Read-only shows the selected record as non-editable text (no search or clear); disabled dims the whole field and blocks focus."
  ),
};
