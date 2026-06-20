import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { BooleanField } from "../../../../shared/controls/presentational/BooleanField";

const meta: Meta<typeof BooleanField> = {
  title: "Presentational Controls/BooleanField",
  component: BooleanField,
};
export default meta;
type Story = StoryObj<typeof BooleanField>;

const make = (initial: boolean | null) => {
  const value = new Observable<boolean | null>(initial);
  return { value, onChange: (v: boolean) => (value.value = v) };
};

/** Required variant: the validation message clears once a choice is made. */
const makeRequired = () => {
  const value = new Observable<boolean | null>(null);
  const errorMessage = new Observable<string | undefined>("A choice is required.");
  return {
    value,
    errorMessage,
    onChange: (v: boolean) => {
      value.value = v;
      errorMessage.value = undefined;
    },
  };
};

export const Empty: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" {...make(true)} />,
};
export const Required: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" required {...makeRequired()} />,
};
export const Disabled: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" disabled {...make(true)} />,
};
export const ReadOnly: Story = {
  render: () => <BooleanField label="Do Not Allow Emails" readOnly {...make(false)} />,
};
export const CustomLabels: Story = {
  name: "Metadata labels (supplied)",
  render: () => (
    <BooleanField label="Credit Hold" trueLabel="On Hold" falseLabel="Clear" {...make(true)} />
  ),
};
