import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { NumberField } from "../../../../shared/controls/presentational/NumberField";

const meta: Meta<typeof NumberField> = {
  title: "Presentational Controls/NumberField",
  component: NumberField,
};
export default meta;
type Story = StoryObj<typeof NumberField>;

const make = (initial: number | null) => {
  const value = new Observable<number | null>(initial);
  return { value, onChange: (v: number | null) => (value.value = v) };
};

/** Required variant: the validation message tracks emptiness as the user types. */
const makeRequired = (label: string) => {
  const value = new Observable<number | null>(null);
  const errorMessage = new Observable<string | undefined>(`${label} is required.`);
  return {
    value,
    errorMessage,
    onChange: (v: number | null) => {
      value.value = v;
      errorMessage.value = v == null ? `${label} is required.` : undefined;
    },
  };
};

export const WholeNumberEmpty: Story = {
  render: () => <NumberField label="Number of Employees" precision={0} {...make(null)} />,
};
export const WholeNumberFilled: Story = {
  render: () => <NumberField label="Number of Employees" precision={0} {...make(5400)} />,
};
export const DecimalFilled: Story = {
  render: () => <NumberField label="Exchange Rate" precision={4} {...make(1.0825)} />,
};
export const FloatFilled: Story = {
  name: "Floating point (no fixed precision)",
  render: () => <NumberField label="Latitude" {...make(47.6062)} />,
};
export const Required: Story = {
  render: () => (
    <NumberField label="Number of Employees" precision={0} required {...makeRequired("Number of Employees")} />
  ),
};
export const Disabled: Story = {
  render: () => <NumberField label="Number of Employees" precision={0} disabled {...make(250)} />,
};
export const ReadOnly: Story = {
  render: () => <NumberField label="Number of Employees" precision={0} readOnly {...make(250)} />,
};
export const WithBounds: Story = {
  name: "Min/max clamping (type and blur)",
  render: () => <NumberField label="Discount %" precision={2} min={0} max={100} {...make(15)} />,
};
export const EuropeanSeparators: Story = {
  name: "CRM separators (decimal ',' group '.')",
  render: () => (
    <NumberField
      label="Annual Revenue"
      precision={2}
      decimalSymbol=","
      groupSeparator="."
      {...make(1234567.5)}
    />
  ),
};
