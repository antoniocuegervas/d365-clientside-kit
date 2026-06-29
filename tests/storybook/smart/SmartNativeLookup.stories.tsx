import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartNativeLookup } from "../../../shared/controls/smart/SmartNativeLookup";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { nativeLookupContext, withContext, sample, makeRequired, fieldContractNote } from "./smartStoryHarness";

const meta: Meta<typeof SmartNativeLookup> = {
  title: "Smart Controls/SmartNativeLookup",
  component: SmartNativeLookup,
  decorators: [withContext(nativeLookupContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Native-parity lookup field: a resting chip with clickthrough, and an inline flyout that " +
          "opens on click, loads the entity's lookup view (querytype 64) first page, filters as you " +
          "type with the match bolded, and expands per-row detail. The target entity, the lookup " +
          "view and its columns, and the entity icon all resolve from the attribute's metadata; " +
          "the footer Advanced escalates to the native picker and the value link opens the record. " +
          "It shares the same value Observable contract as SmartLookup (the simpler combobox); reach " +
          "for this when native look and feel (muscle memory) is the point. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartNativeLookup>;

const company = new Observable<IEntityReference | null>(null);
const customer = new Observable<IEntityReference | null>(null);
const companyIcons = new Observable<IEntityReference | null>(null);
const companySeeded = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});
const required = makeRequired<IEntityReference>("Company is required.");

export const Default: Story = {
  name: "Native flyout (click to open)",
  render: () => (
    <SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} searchDebounceMs={0} showIcons />
  ),
  parameters: sample(
    `// contact.parentcustomerid is a lookup whose metadata target is "account".
// The flyout loads the account lookup view's first page on open and filters as
// you type. The view's columns become the two-line rows (name over the first
// column, the rest behind the expand chevron). No view or query is wired by hand.
const company = new Observable<IEntityReference | null>(null);

<SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} showIcons />`,
    "Click the field to open the flyout (no Enter). Rows are two-line (name + first lookup-view column); a row with more columns shows an expand chevron, one with only a name does not. Typing filters live with the match bolded. (Stories set searchDebounceMs={0} so search fires immediately.)"
  ),
};

export const Seeded: Story = {
  name: "Seeded value (chip + clickthrough)",
  render: () => (
    <SmartNativeLookup entity="contact" attribute="parentcustomerid" value={companySeeded} searchDebounceMs={0} showIcons />
  ),
  parameters: sample(
    `// A lookup value is an entity reference (id + logical name + display name).
// Seeded, the control shows the chip: entity icon + the record name as a
// clickthrough link (openForm) + a clear button, matching the native lookup.
const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} showIcons />`,
    "A set value renders as the native chip: icon + record-name link (click opens the record) + clear. Clicking the magnifier reopens the flyout to change it."
  ),
};

export const Polymorphic: Story = {
  name: "Polymorphic (target switcher)",
  render: () => (
    <SmartNativeLookup entity="incident" attribute="customerid" value={customer} searchDebounceMs={0} showIcons />
  ),
  parameters: sample(
    `// incident.customerid is a Customer lookup: its metadata lists TWO targets
// (account and contact). The flyout header shows a target switcher so the user
// picks which table to search; the view, columns, and search re-point to it.
// Single-target lookups resolve their one target from metadata, no switcher.
const customer = new Observable<IEntityReference | null>(null);

<SmartNativeLookup entity="incident" attribute="customerid" value={customer} showIcons />`,
    "Customer and Owner lookups list more than one target. The flyout header offers a switcher between them, and the lookup view, columns, and search follow the chosen table. Build covers single-target by default; the switcher appears only when metadata lists several."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartNativeLookup
      entity="contact"
      attribute="parentcustomerid"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
      searchDebounceMs={0}
      showIcons
    />
  ),
  parameters: sample(
    `// The control writes the value itself when a record is chosen or cleared; this
// onChange only keeps the error in step, clearing it once a record is present.
const company = new Observable<IEntityReference | null>(null);
const error = new Observable<string | undefined>("Company is required.");
const onChange = (v: IEntityReference | null) => {
  error.value = v ? undefined : "Company is required.";
};

<SmartNativeLookup
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
    <SmartNativeLookup entity="contact" attribute="parentcustomerid" value={companySeeded} disabled searchDebounceMs={0} showIcons />
  ),
  parameters: sample(
    `const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} disabled />`,
    "Disabled blocks interaction; the chosen record stays visible but cannot be changed or cleared and the flyout will not open. Use readOnly to keep the record readable (as a link) without dimming."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartNativeLookup entity="contact" attribute="parentcustomerid" value={companySeeded} readOnly searchDebounceMs={0} showIcons />
  ),
  parameters: sample(
    `const company = new Observable<IEntityReference | null>({
  id: "a1a00000-0000-0000-0000-000000000001",
  logicalName: "account",
  name: "Contoso Ltd",
});

<SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} readOnly />`,
    "Read-only shows the selected record as a non-editable link (no search, clear, or flyout); disabled dims the whole field and blocks focus."
  ),
};

export const IconsOff: Story = {
  name: "Icons off (showIcons={false})",
  render: () => (
    <SmartNativeLookup
      entity="contact"
      attribute="parentcustomerid"
      value={companyIcons}
      showIcons={false}
      searchDebounceMs={0}
    />
  ),
  parameters: sample(
    `// Entity icons show by default (native parity). Set showIcons={false} to drop
// them and save the per-target getEntityIconUrl metadata read; the rows then
// align without the leading glyph.
const company = new Observable<IEntityReference | null>(null);

<SmartNativeLookup entity="contact" attribute="parentcustomerid" value={company} showIcons={false} />`,
    "Entity icons show by default. Set showIcons={false} to drop them (and save the per-target getEntityIconUrl read); the rows then render without the leading glyph but are otherwise identical."
  ),
};
