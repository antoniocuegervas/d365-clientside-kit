import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { DateTimeField } from "../../../../shared/controls/presentational/DateTimeField";

const meta: Meta<typeof DateTimeField> = {
  title: "Controls/DateTimeField",
  component: DateTimeField,
};
export default meta;
type Story = StoryObj<typeof DateTimeField>;

const make = (initial: Date | null) => {
  const value = new Observable<Date | null>(initial);
  return { value, onChange: (v: Date | null) => (value.value = v) };
};

const sampleDate = new Date(2026, 5, 18, 14, 30);

export const DateOnlyEmpty: Story = {
  render: () => <DateTimeField label="Est. Close Date" {...make(null)} />,
};
export const DateOnlyFilled: Story = {
  render: () => <DateTimeField label="Est. Close Date" {...make(sampleDate)} />,
};
export const DateAndTime: Story = {
  render: () => <DateTimeField label="Scheduled Start" includeTime {...make(sampleDate)} />,
};
export const Required: Story = {
  render: () => <DateTimeField label="Est. Close Date" required {...make(null)} />,
};
export const Disabled: Story = {
  render: () => <DateTimeField label="Est. Close Date" disabled {...make(sampleDate)} />,
};
export const ReadOnly: Story = {
  render: () => <DateTimeField label="Est. Close Date" readOnly {...make(sampleDate)} />,
};
export const WithError: Story = {
  render: () => (
    <DateTimeField label="Est. Close Date" errorMessage="Date must be in the future." {...make(null)} />
  ),
};
