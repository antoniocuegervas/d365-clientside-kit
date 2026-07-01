import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultilineTextField } from "../../../../shared/controls/presentational/MultilineTextField";
import { longText } from "../../fixtures";

const meta: Meta<typeof MultilineTextField> = {
  title: "Presentational Controls/MultilineTextField",
  component: MultilineTextField,
  parameters: {
    docs: {
      description: {
        component:
          "Multi-line text input, the memo-column counterpart of TextField. Same values-in, " +
          "events-out contract: `value` plus `onChange`, everything else (label, required, " +
          "readOnly, errorMessage, maxLength) supplied by the host, no CRM knowledge inside. " +
          "`SmartTextField` picks this control automatically when the bound attribute is a " +
          "memo, so the multiline decision comes from metadata, not from the View.",
      },
    },
  },
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
export const Overflow: Story = {
  render: () => (
    <MultilineTextField label="Description" rows={3} {...make(`${longText}\n\n${longText}`)} />
  ),
};
