import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartTextField> = {
  title: "Smart Controls/SmartTextField",
  component: SmartTextField,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Text and memo field. The label and max length come from the attribute, and a memo " +
          "attribute renders as a multi-line area. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartTextField>;

const firstName = new Observable<string | null>("Yvonne");
const description = new Observable<string | null>("Primary executive sponsor for the renewal.");
const accountName = new Observable<string | null>("Contoso Ltd");
// Required: a blank string still counts as empty, so the message tracks input.
const required = makeRequired<string>("Account Name is required.", (v) => v === "");

export const Default: Story = {
  name: "Default (label + maxLength from metadata)",
  render: () => <SmartTextField entity="contact" attribute="firstname" value={firstName} />,
  parameters: sample(
    `// contact.firstname in Dataverse metadata:
//   display name "First Name", text, max length 100, required.
//
// The ViewModel owns the value; the View binds the control to it.
const firstName = new Observable<string | null>("Yvonne");

// entity + attribute is the whole contract. The label, the 100-character
// max length, and the required marker all come from metadata, not props.
<SmartTextField entity="contact" attribute="firstname" value={firstName} />`
  ),
};

export const Multiline: Story = {
  name: "Multiline (a memo attribute)",
  render: () => <SmartTextField entity="contact" attribute="description" value={description} />,
  parameters: sample(
    `// contact.description is a memo attribute, so the same control renders a
// multi-line text area. The attribute kind, not a prop, decides this.
const description = new Observable<string | null>(
  "Primary executive sponsor for the renewal."
);

<SmartTextField entity="contact" attribute="description" value={description} />`,
    "A memo attribute renders as a multi-line text area. Nothing on the call site changes; the attribute's kind in metadata drives it."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartTextField
      entity="account"
      attribute="name"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
    />
  ),
  parameters: sample(
    `// account.name is not required in metadata; the required prop forces the
// marker on, like a form-level override. The ViewModel owns both the value
// and the error, and clears the error as soon as a value is typed, so the
// message tracks input rather than sticking.
const accountName = new Observable<string | null>(null);
const error = new Observable<string | undefined>("Account Name is required.");
const onChange = (v: string | null) => {
  error.value = v ? undefined : "Account Name is required.";
};

<SmartTextField
  entity="account"
  attribute="name"
  value={accountName}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "Required can come from metadata or be forced by the prop. The error clears the moment a value is entered, mirroring live form validation."
  ),
};

export const Disabled: Story = {
  render: () => <SmartTextField entity="account" attribute="name" value={accountName} disabled />,
  parameters: sample(
    `const accountName = new Observable<string | null>("Contoso Ltd");

<SmartTextField entity="account" attribute="name" value={accountName} disabled />`
  ),
};

export const ReadOnly: Story = {
  render: () => <SmartTextField entity="account" attribute="name" value={accountName} readOnly />,
  parameters: sample(
    `const accountName = new Observable<string | null>("Contoso Ltd");

// Read-only shows the value as plain locked text, distinct from disabled
// (which dims the control); both come straight from SmartFieldBase.
<SmartTextField entity="account" attribute="name" value={accountName} readOnly />`
  ),
};

export const HintOverride: Story = {
  name: "Hint (from metadata, overridable)",
  render: () => (
    <SmartTextField
      entity="contact"
      attribute="firstname"
      value={firstName}
      hint="Override: enter the preferred first name."
    />
  ),
  parameters: sample(
    `// contact.firstname carries a Description in metadata, shown as a hint by
// default. Pass hint to override it, or hint="" to suppress.
<SmartTextField
  entity="contact"
  attribute="firstname"
  value={firstName}
  hint="Override: enter the preferred first name."
/>`,
    "The hint defaults to the attribute's Dataverse Description; the hint prop overrides it, and an empty hint suppresses it. A free-form placeholder is still not offered."
  ),
};

export const LabelStart: Story = {
  name: "Label beside the field (labelPosition)",
  render: () => (
    <SmartTextField entity="account" attribute="name" value={accountName} labelPosition="start" />
  ),
  parameters: sample(
    `// labelPosition "start" places the label beside the field on the leading edge
// (left in LTR, right in RTL, via Fluent). The default is "top".
<SmartTextField entity="account" attribute="name" value={accountName} labelPosition="start" />`,
    "labelPosition is top (default) or start; start places the label on the leading edge, RTL-aware via Fluent's Field orientation."
  ),
};
