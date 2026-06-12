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

export const Empty: Story = {
  render: () => <MultilineTextField label="Description" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <MultilineTextField label="Description" {...make("Key strategic account.")} />,
};
export const Required: Story = {
  render: () => <MultilineTextField label="Description" required {...make(null)} />,
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
