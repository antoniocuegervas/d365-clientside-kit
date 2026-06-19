import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultilineTextField } from "../../../../shared/controls/presentational/MultilineTextField";
import { longText } from "../../fixtures";

const meta: Meta<typeof MultilineTextField> = {
  title: "Controls/MultilineTextField",
  component: MultilineTextField,
};
export default meta;
type Story = StoryObj<typeof MultilineTextField>;

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
  render: () => <MultilineTextField label="Description" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <MultilineTextField label="Description" {...make("Key strategic account.")} />,
};
export const Required: Story = {
  render: () => <MultilineTextField label="Description" required {...makeRequired("Description")} />,
};
export const Disabled: Story = {
  render: () => <MultilineTextField label="Description" disabled {...make("Locked notes")} />,
};
export const ReadOnly: Story = {
  render: () => <MultilineTextField label="Description" readOnly {...make("Read-only notes")} />,
};
export const WithError: Story = {
  render: () => (
    <MultilineTextField label="Description" errorMessage="Too long." {...make(longText)} />
  ),
};
export const Overflow: Story = {
  render: () => (
    <MultilineTextField label="Description" rows={3} {...make(`${longText}\n\n${longText}`)} />
  ),
};
