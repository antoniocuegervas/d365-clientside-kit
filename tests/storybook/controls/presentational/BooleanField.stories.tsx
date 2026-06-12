import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { BooleanField } from "../../../../shared/controls/presentational/BooleanField";

const meta: Meta<typeof BooleanField> = {
  title: "Controls/BooleanField",
  component: BooleanField,
};
export default meta;
type Story = StoryObj<typeof BooleanField>;

const make = (initial: boolean | null) => {
  const value = new Observable<boolean | null>(initial);
  return { value, onChange: (v: boolean) => (value.value = v) };
};

export const Empty: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" {...make(true)} />,
};
export const Required: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" required {...make(null)} />,
};
export const Disabled: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" disabled {...make(true)} />,
};
export const ReadOnly: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" readOnly {...make(false)} />,
};
export const WithError: Story = {
  render: () => (
    <BooleanField label="Do Not Allow Emails" errorMessage="A choice is required." {...make(null)} />
  ),
};
export const CustomLabels: Story = {
  name: "Metadata labels (supplied)",
  render: () => (
    <BooleanField label="Credit Hold" trueLabel="On Hold" falseLabel="Clear" {...make(true)} />
  ),
};
