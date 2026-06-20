import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartBooleanField } from "../../../shared/controls/smart/SmartBooleanField";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartBooleanField> = {
  title: "Smart Controls/SmartBooleanField",
  component: SmartBooleanField,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Two-option field. The two labels come from the attribute's boolean option set " +
          "(false label, then true label). " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartBooleanField>;

const doNotEmail = new Observable<boolean | null>(false);
const required = makeRequired<boolean>("Choose an option.");

export const Default: Story = {
  name: "Default (true/false labels from metadata)",
  render: () => <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />,
  parameters: sample(
    `// contact.donotemail's two-option set supplies the labels:
//   false -> "Allow", true -> "Do Not Allow".
const doNotEmail = new Observable<boolean | null>(false);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />`
  ),
};

export const Required: Story = {
  render: () => (
    <SmartBooleanField
      entity="contact"
      attribute="donotemail"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
    />
  ),
  parameters: sample(
    `// The ViewModel owns the value and the error, and clears the error as soon
// as a choice is made, so the message tracks the selection.
const doNotEmail = new Observable<boolean | null>(null);
const error = new Observable<string | undefined>("Choose an option.");
const onChange = (v: boolean | null) => {
  error.value = v == null ? "Choose an option." : undefined;
};

<SmartBooleanField
  entity="contact"
  attribute="donotemail"
  value={doNotEmail}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The required message clears the moment a choice is made, mirroring live form validation."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} disabled />
  ),
  parameters: sample(
    `const doNotEmail = new Observable<boolean | null>(false);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} disabled />`
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} readOnly />
  ),
  parameters: sample(
    `const doNotEmail = new Observable<boolean | null>(false);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} readOnly />`
  ),
};
