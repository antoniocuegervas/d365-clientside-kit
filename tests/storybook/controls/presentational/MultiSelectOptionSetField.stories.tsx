import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { MultiSelectOptionSetField } from "../../../../shared/controls/presentational/MultiSelectOptionSetField";
import { industryOptions } from "../../fixtures";

const meta: Meta<typeof MultiSelectOptionSetField> = {
  title: "Controls/MultiSelectOptionSetField",
  component: MultiSelectOptionSetField,
};
export default meta;
type Story = StoryObj<typeof MultiSelectOptionSetField>;

const make = (initial: number[]) => {
  const selectedValues = new Observable<number[]>(initial);
  return {
    options: industryOptions,
    selectedValues,
    onChange: (v: number[]) => (selectedValues.value = v),
  };
};

/** Required variant: the validation message clears once an option is selected. */
const makeRequired = () => {
  const selectedValues = new Observable<number[]>([]);
  const errorMessage = new Observable<string | undefined>("Pick at least one.");
  return {
    options: industryOptions,
    selectedValues,
    errorMessage,
    onChange: (v: number[]) => {
      selectedValues.value = v;
      errorMessage.value = v.length === 0 ? "Pick at least one." : undefined;
    },
  };
};

export const Empty: Story = {
  render: () => <MultiSelectOptionSetField label="Service Lines" {...make([])} />,
};
export const Filled: Story = {
  render: () => <MultiSelectOptionSetField label="Service Lines" {...make([1, 6])} />,
};
export const Required: Story = {
  render: () => <MultiSelectOptionSetField label="Service Lines" required {...makeRequired()} />,
};
export const Disabled: Story = {
  render: () => <MultiSelectOptionSetField label="Service Lines" disabled {...make([5])} />,
};
export const ReadOnly: Story = {
  render: () => <MultiSelectOptionSetField label="Service Lines" readOnly {...make([5, 7])} />,
};
export const WithError: Story = {
  render: () => (
    <MultiSelectOptionSetField label="Service Lines" errorMessage="Pick at least one." {...make([])} />
  ),
};
export const Overflow: Story = {
  name: "Overflow (many selections)",
  render: () => (
    <MultiSelectOptionSetField label="Service Lines" {...make(industryOptions.map((o) => o.value))} />
  ),
};
