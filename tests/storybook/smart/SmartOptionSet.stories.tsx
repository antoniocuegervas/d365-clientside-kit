import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartOptionSet> = {
  title: "Smart Controls/SmartOptionSet",
  component: SmartOptionSet,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Choice field. The option list and the selected label load from the attribute's option " +
          "set, and `filterOptions` prunes or reorders the choices before display. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartOptionSet>;

const gender = new Observable<number | null>(2);
const genderFiltered = new Observable<number | null>(null);
const required = makeRequired<number>("Gender is required.");

export const Default: Story = {
  name: "Default (options + selected label from metadata)",
  render: () => <SmartOptionSet entity="contact" attribute="gendercode" value={gender} />,
  parameters: sample(
    `// contact.gendercode in metadata carries the option list:
//   1 -> "Male", 2 -> "Female".
//
// The value holds the option's number; the control renders its label.
const gender = new Observable<number | null>(2);

// No options prop: the list and the selected "Female" label both come
// from the attribute's option set.
<SmartOptionSet entity="contact" attribute="gendercode" value={gender} />`
  ),
};

export const FilterOptions: Story = {
  name: "filterOptions (prunes the list)",
  render: () => (
    <SmartOptionSet
      entity="contact"
      attribute="gendercode"
      value={genderFiltered}
      filterOptions={(all) => all.filter((o) => o.value !== 1)}
    />
  ),
  parameters: sample(
    `// filterOptions runs over the metadata options before display, so a
// ViewModel can prune or reorder choices without restating the list.
const gender = new Observable<number | null>(null);

<SmartOptionSet
  entity="contact"
  attribute="gendercode"
  value={gender}
  filterOptions={(all) => all.filter((o) => o.value !== 1)} // drop "Male"
/>`,
    "filterOptions keeps the metadata as the source of truth while letting the caller prune or reorder the choices shown."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartOptionSet
      entity="contact"
      attribute="gendercode"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
    />
  ),
  parameters: sample(
    `// The ViewModel owns the value and the error, and clears the error as soon
// as an option is chosen, so the message tracks the selection.
const gender = new Observable<number | null>(null);
const error = new Observable<string | undefined>("Gender is required.");
const onChange = (v: number | null) => {
  error.value = v == null ? "Gender is required." : undefined;
};

<SmartOptionSet
  entity="contact"
  attribute="gendercode"
  value={gender}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The required message clears the moment an option is selected, mirroring live form validation."
  ),
};

export const Disabled: Story = {
  render: () => <SmartOptionSet entity="contact" attribute="gendercode" value={gender} disabled />,
  parameters: sample(
    `const gender = new Observable<number | null>(2);

<SmartOptionSet entity="contact" attribute="gendercode" value={gender} disabled />`
  ),
};

export const ReadOnly: Story = {
  render: () => <SmartOptionSet entity="contact" attribute="gendercode" value={gender} readOnly />,
  parameters: sample(
    `const gender = new Observable<number | null>(2);

<SmartOptionSet entity="contact" attribute="gendercode" value={gender} readOnly />`
  ),
};
