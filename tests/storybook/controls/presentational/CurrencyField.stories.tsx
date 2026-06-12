import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { CurrencyField } from "../../../../shared/controls/presentational/CurrencyField";

const meta: Meta<typeof CurrencyField> = {
  title: "Controls/CurrencyField",
  component: CurrencyField,
};
export default meta;
type Story = StoryObj<typeof CurrencyField>;

const make = (initial: number | null) => {
  const value = new Observable<number | null>(initial);
  return { value, onChange: (v: number | null) => (value.value = v) };
};

export const Empty: Story = {
  render: () => <CurrencyField label="Annual Revenue" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <CurrencyField label="Annual Revenue" {...make(1200000)} />,
};
export const EuroSymbol: Story = {
  name: "Supplied currency symbol (€)",
  render: () => <CurrencyField label="Annual Revenue" currencySymbol="€" {...make(840000)} />,
};
export const Required: Story = {
  render: () => <CurrencyField label="Annual Revenue" required {...make(null)} />,
};
export const Disabled: Story = {
  render: () => <CurrencyField label="Annual Revenue" disabled {...make(310000)} />,
};
export const ReadOnly: Story = {
  render: () => <CurrencyField label="Annual Revenue" readOnly {...make(310000)} />,
};
export const WithError: Story = {
  render: () => (
    <CurrencyField label="Annual Revenue" errorMessage="Enter a valid amount." {...make(null)} />
  ),
};
