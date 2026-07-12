import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartMultiSelectOptionSet } from "../../../shared/controls/smart/SmartMultiSelectOptionSet";
import { fieldContext, withContext, sample, fieldContractNote } from "./smartStoryHarness";

const meta: Meta<typeof SmartMultiSelectOptionSet> = {
  title: "Smart Controls/SmartMultiSelectOptionSet",
  component: SmartMultiSelectOptionSet,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Multi-select choice field. The option list loads from the attribute's multi-select " +
          "option set, and the selection is a number-array Observable the ViewModel owns. It is " +
          "the plural twin of SmartOptionSet: same metadata resolution, several values at once. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartMultiSelectOptionSet>;

const selected = new Observable<number[]>([1, 3]);

export const Default: Story = {
  name: "Default (options + selection from metadata)",
  render: () => <SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={selected} />,
  parameters: sample(
    `// account.servicelines in metadata carries the multi-select option list:
//   1 -> "Advisory", 2 -> "Implementation", 3 -> "Managed Services", ...
//
// The value holds the picked option numbers; the control renders their labels.
const servicelines = new Observable<number[]>([1, 3]);

// No options prop: the list and the selected labels ("Advisory, Managed
// Services") both come from the attribute's option set.
<SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={servicelines} />`
  ),
};

export const Required: Story = {
  render: () => {
    // The control writes the selection itself; this onChange only keeps the error
    // in step, clearing it once at least one option is picked.
    const value = new Observable<number[]>([]);
    const errorMessage = new Observable<string | undefined>("Pick at least one service line.");
    return (
      <SmartMultiSelectOptionSet
        entity="account"
        attribute="servicelines"
        value={value}
        required
        errorMessage={errorMessage}
        onChange={(values) => {
          errorMessage.value = values.length === 0 ? "Pick at least one service line." : undefined;
        }}
      />
    );
  },
  parameters: sample(
    `const servicelines = new Observable<number[]>([]);
const error = new Observable<string | undefined>("Pick at least one service line.");
const onChange = (values: number[]) => {
  error.value = values.length === 0 ? "Pick at least one service line." : undefined;
};

<SmartMultiSelectOptionSet
  entity="account"
  attribute="servicelines"
  value={servicelines}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The control writes the value Observable itself; the onChange shown only clears the error, which tracks the selection the way live form validation does."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={selected} disabled />
  ),
  parameters: sample(
    `const servicelines = new Observable<number[]>([1, 3]);

<SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={servicelines} disabled />`,
    "Disabled greys the dropdown and blocks interaction; the current selection stays visible. It is a prop the ViewModel drives from business rules, not a metadata default. Use readOnly when the value should stay readable without dimming."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={selected} readOnly />
  ),
  parameters: sample(
    `const servicelines = new Observable<number[]>([1, 3]);

<SmartMultiSelectOptionSet entity="account" attribute="servicelines" value={servicelines} readOnly />`,
    "Read-only keeps the selected labels visible while locking the dropdown. On the multi-select field a column-secured attribute the user cannot edit resolves to this state from metadata."
  ),
};
