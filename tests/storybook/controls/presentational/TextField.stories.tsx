import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { TextField } from "../../../../shared/controls/presentational/TextField";
import { longText } from "../../fixtures";

const meta: Meta<typeof TextField> = {
  title: "Presentational Controls/TextField",
  component: TextField,
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
