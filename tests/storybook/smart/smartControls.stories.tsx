import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { SmartBooleanField } from "../../../shared/controls/smart/SmartBooleanField";
import { SmartNumberField } from "../../../shared/controls/smart/SmartNumberField";
import { SmartDatePicker } from "../../../shared/controls/smart/SmartDatePicker";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import { SmartViewGrid } from "../../../shared/controls/smart/SmartViewGrid";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { createFakeViewModelContext } from "../../mocks/fakeViewModelContext";

/**
 * The presentational stories run with no host at all. These show the OTHER tier,
 * the metadata-aware "smart" controls, the part the kit is really about: give a
 * control an `entity` and an `attribute` and it resolves the label, option set,
 * number/date format, and lookup target from Dataverse metadata.
 *
 * They can't run with zero mocks (that is the whole point of being metadata
 * aware), so the compromise is an in-memory metadata fake: a small, canned slice
 * of contact/account metadata and a few records, served through the same
 * `IViewModelContext` the real hosts implement. The resolution you see is real;
 * only the metadata behind it is fixture data.
 */
const context = createFakeViewModelContext({
  attributes: {
    "contact.firstname": { displayName: "First Name", kind: "text", maxLength: 100, required: true },
    "contact.description": { displayName: "Description", kind: "memo" },
    "contact.gendercode": {
      displayName: "Gender",
      kind: "optionset",
      options: [
        { value: 1, label: "Male" },
        { value: 2, label: "Female" },
      ],
    },
    "contact.donotemail": {
      displayName: "Do Not Allow Emails",
      kind: "boolean",
      // options[0] is the false label, options[1] the true label.
      options: [
        { value: 0, label: "Allow" },
        { value: 1, label: "Do Not Allow" },
      ],
    },
    "contact.numberofchildren": { displayName: "No. of Children", kind: "integer" },
    "contact.birthdate": { displayName: "Birthday", kind: "date" },
    "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
    "account.name": { displayName: "Account Name", kind: "text" },
    "account.telephone1": { displayName: "Main Phone", kind: "text" },
  },
  views: {
    "default:account": {
      name: "Active Accounts",
      entityLogicalName: "account",
      fetchXml: "<fetch><entity name='account'/></fetch>",
      columns: [
        { name: "name", width: 300 },
        { name: "telephone1", width: 160 },
      ],
    },
  },
  queryResults: {
    // One result, reused by both the lookup search and the grid (the fake
    // replays a single-entry queue).
    account: [
      {
        entities: [
          { accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd", telephone1: "555-0101" },
          { accountid: "a1a00000-0000-0000-0000-000000000002", name: "Fabrikam Inc", telephone1: "555-0102" },
        ],
      },
    ],
  },
}).context;

// Host-owned values, one per control (the View's job in a real app).
const firstName = new Observable<string | null>("Yvonne");
const description = new Observable<string | null>("Primary executive sponsor for the renewal.");
const gender = new Observable<number | null>(2);
const doNotEmail = new Observable<boolean | null>(false);
const numberOfChildren = new Observable<number | null>(2);
const birthday = new Observable<Date | null>(new Date(1985, 3, 14));
const company = new Observable<IEntityReference | null>(null);

const meta: Meta = {
  title: "Smart Controls (Metadata-aware)",
  decorators: [
    (Story) => (
      <ViewModelContextProvider context={context}>
        <Story />
      </ViewModelContextProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Metadata-aware controls, run against an in-memory metadata fake (no Dataverse host). " +
          "Each takes only an entity and an attribute; the label, options, format, and lookup " +
          "target come from metadata.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const TextField: Story = {
  name: "SmartTextField (label + maxLength from metadata)",
  render: () => <SmartTextField entity="contact" attribute="firstname" value={firstName} />,
};

export const Multiline: Story = {
  name: "SmartTextField (a memo attribute renders multiline)",
  render: () => <SmartTextField entity="contact" attribute="description" value={description} />,
};

export const OptionSet: Story = {
  name: "SmartOptionSet (options from metadata)",
  render: () => <SmartOptionSet entity="contact" attribute="gendercode" value={gender} />,
};

export const BooleanField: Story = {
  name: "SmartBooleanField (true/false labels from metadata)",
  render: () => <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />,
};

export const NumberField: Story = {
  name: "SmartNumberField (integer precision from metadata)",
  render: () => (
    <SmartNumberField entity="contact" attribute="numberofchildren" value={numberOfChildren} />
  ),
};

export const DatePicker: Story = {
  name: "SmartDatePicker (date vs datetime from metadata)",
  render: () => <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} />,
};

export const Lookup: Story = {
  name: "SmartLookup (target + search from metadata)",
  render: () => (
    <SmartLookup
      entity="contact"
      attribute="parentcustomerid"
      value={company}
      searchDebounceMs={0}
    />
  ),
};

export const ViewGrid: Story = {
  name: "SmartViewGrid (columns + rows from a saved view)",
  render: () => <SmartViewGrid entity="account" />,
};
