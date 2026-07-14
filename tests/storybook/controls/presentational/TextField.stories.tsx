import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { TextField } from "../../../../shared/controls/presentational/TextField";
import { longText } from "../../fixtures";

const meta: Meta<typeof TextField> = {
  title: "Presentational Controls/TextField",
  component: TextField,
  parameters: {
    docs: {
      description: {
        component:
          "Native-parity single-line text input. The contract is values in, events out: " +
          "`value` (an Observable or a plain string) plus `onChange`, with label, required, " +
          "disabled, readOnly, errorMessage, and hint all supplied by the host. It knows " +
          "nothing about CRM (no metadata, no context), which is why it renders here with " +
          "zero mocks. In an app you rarely wire these props by hand: `SmartTextField` " +
          "resolves the label, required flag, and max length from attribute metadata and " +
          "renders this control, see its page for the metadata-bound usage. It defaults to " +
          "Fluent's `filled-darker` appearance, the light-grey filled box the model-driven " +
          "New Look uses for form fields (measured live), so it reads native beside platform " +
          "fields; every kit field control shares that default.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof TextField>;

/** Host-owned observable per story, the story plays the ViewModel's role. */
const make = (initial: string | null) => {
  const value = new Observable<string | null>(initial);
  return { value, onChange: (v: string | null) => (value.value = v) };
};

/** Required variant: the validation message tracks emptiness as the user types. */
const makeRequired = (label: string) => {
  const value = new Observable<string | null>(null);
  const errorMessage = new Observable<string | undefined>(`${label} is required.`);
  return {
    value,
    errorMessage,
    onChange: (v: string | null) => {
      value.value = v;
      errorMessage.value = v ? undefined : `${label} is required.`;
    },
  };
};

export const Empty: Story = {
  render: () => <TextField label="Account Name" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <TextField label="Account Name" {...make("Contoso Ltd")} />,
};
export const Required: Story = {
  render: () => <TextField label="Account Name" required {...makeRequired("Account Name")} />,
};
export const Disabled: Story = {
  render: () => <TextField label="Account Name" disabled {...make("Contoso Ltd")} />,
};
export const ReadOnly: Story = {
  render: () => <TextField label="Account Name" readOnly {...make("Contoso Ltd")} />,
};
export const Overflow: Story = {
  render: () => <TextField label="Account Name" {...make(longText)} />,
};
