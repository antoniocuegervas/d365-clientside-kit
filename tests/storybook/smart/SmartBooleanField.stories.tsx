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
const doNotEmailOn = new Observable<boolean | null>(true);
const required = makeRequired<boolean>("Choose an option.");

export const Default: Story = {
  name: "Default (true/false labels from metadata)",
  render: () => <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />,
  parameters: sample(
    `// contact.donotemail's two-option set supplies the labels:
//   false -> "Allow", true -> "Do Not Allow".
// The value is false here, so the control shows the false label, "Allow". The
// label maps the boolean VALUE, not the field name: on a field called "Do Not
// Allow Emails", false (Allow) means email is permitted.
const doNotEmail = new Observable<boolean | null>(false);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />`,
    "The control shows the metadata label for the current boolean value, not the field name. Here the value is false, so it shows the false label \"Allow\" even though the field is named \"Do Not Allow Emails\" (the classic two-option double-negative)."
  ),
};

export const TrueValue: Story = {
  name: "True value (shows the true label)",
  render: () => <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmailOn} />,
  parameters: sample(
    `// Same field, value true: the control now shows the true label, "Do Not Allow".
// Seeing both ends confirms the label comes from the option set, not the value.
const doNotEmail = new Observable<boolean | null>(true);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} />`,
    "With the value true, the control shows the true label \"Do Not Allow\". The contrast with the Default story makes the value-to-label mapping concrete."
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
    `// value starts null (nothing chosen yet), so the required error shows until a
// choice is made. The control writes doNotEmail itself; this onChange only keeps
// the error in step.
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
    "A null value means no choice yet, so the required error shows until one is made. The control writes the value Observable itself; the onChange only clears the error."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} disabled />
  ),
  parameters: sample(
    `const doNotEmail = new Observable<boolean | null>(false);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} disabled />`,
    "Disabled greys the control and blocks interaction; the value (showing \"Allow\" here) stays visible. It is a prop the ViewModel drives from business rules, not a metadata default. Use readOnly when the value should stay readable without dimming."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmailOn} readOnly />
  ),
  parameters: sample(
    `// Shown with value true so it reads "Do Not Allow", visibly distinct from the
// dimmed Disabled story.
const doNotEmail = new Observable<boolean | null>(true);

<SmartBooleanField entity="contact" attribute="donotemail" value={doNotEmail} readOnly />`,
    "Read-only renders the current label as locked text (here \"Do Not Allow\" for value true) without dimming; disabled greys the whole control and blocks focus."
  ),
};
