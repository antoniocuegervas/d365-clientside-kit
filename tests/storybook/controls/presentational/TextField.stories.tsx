import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { TextField } from "../../../../shared/controls/presentational/TextField";
import { longText } from "../../fixtures";

const meta: Meta<typeof TextField> = {
  title: "Controls/TextField",
  component: TextField,
};
export default meta;
type Story = StoryObj<typeof TextField>;

/** Host-owned observable per story, the story plays the ViewModel's role. */
const make = (initial: string | null) => {
  const value = new Observable<string | null>(initial);
  return { value, onChange: (v: string | null) => (value.value = v) };
};

export const Empty: Story = {
  render: () => <TextField label="Account Name" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <TextField label="Account Name" {...make("Contoso Ltd")} />,
};
export const Required: Story = {
  render: () => <TextField label="Account Name" required {...make(null)} />,
};
export const Disabled: Story = {
  render: () => <TextField label="Account Name" disabled {...make("Contoso Ltd")} />,
};
export const ReadOnly: Story = {
  render: () => <TextField label="Account Name" readOnly {...make("Contoso Ltd")} />,
};
export const WithError: Story = {
  render: () => (
    <TextField label="Account Name" errorMessage="Account Name is required." {...make(null)} />
  ),
};
export const Overflow: Story = {
  render: () => <TextField label="Account Name" {...make(longText)} />,
};
