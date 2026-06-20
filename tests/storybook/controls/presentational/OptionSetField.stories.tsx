import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { OptionSetField } from "../../../../shared/controls/presentational/OptionSetField";
import { industryOptions } from "../../fixtures";

const meta: Meta<typeof OptionSetField> = {
  title: "Presentational Controls/OptionSetField",
  component: OptionSetField,
};
export default meta;
type Story = StoryObj<typeof OptionSetField>;

/**
 * Exemplar contract: BOTH the options list and the selected value are
 * host-owned observables. Stories own them just like a smart wrapper would.
 */
const make = (initial: number | null) => {
  const selectedValue = new Observable<number | null>(initial);
  return {
    options: industryOptions,
    selectedValue,
    onChange: (v: number | null) => (selectedValue.value = v),
  };
};

/** Required variant: the validation message clears once an option is selected. */
const makeRequired = () => {
  const selectedValue = new Observable<number | null>(null);
  const errorMessage = new Observable<string | undefined>("Select an industry.");
  return {
    options: industryOptions,
    selectedValue,
    errorMessage,
    onChange: (v: number | null) => {
      selectedValue.value = v;
      errorMessage.value = v == null ? "Select an industry." : undefined;
    },
  };
};

export const Empty: Story = {
  render: () => <OptionSetField label="Industry" {...make(null)} />,
};
export const Filled: Story = {
  render: () => <OptionSetField label="Industry" {...make(6)} />,
};
export const Required: Story = {
  render: () => <OptionSetField label="Industry" required {...makeRequired()} />,
};
export const Disabled: Story = {
  render: () => <OptionSetField label="Industry" disabled {...make(1)} />,
};
export const ReadOnly: Story = {
  render: () => <OptionSetField label="Industry" readOnly {...make(1)} />,
};
export const AsyncLoadedOptions: Story = {
  name: "Options arrive async (host-owned observable)",
  render: () => {
    const options = new Observable<typeof industryOptions>([]);
    const selectedValue = new Observable<number | null>(null);
    setTimeout(() => (options.value = industryOptions), 1500);
    return (
      <OptionSetField
        label="Industry (loads after 1.5s)"
        options={options}
        selectedValue={selectedValue}
        onChange={(v) => (selectedValue.value = v)}
      />
    );
  },
};
export const Overflow: Story = {
  name: "Overflow (long option labels)",
  render: () => <OptionSetField label="Industry" {...make(2)} />,
};
