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

/** Required variant: the validation message tracks emptiness as the user picks a date. */
const makeRequired = (label: string) => {
  const value = new Observable<Date | null>(null);
  const errorMessage = new Observable<string | undefined>(`${label} is required.`);
  return {
    value,
    errorMessage,
    onChange: (v: Date | null) => {
      value.value = v;
      errorMessage.value = v ? undefined : `${label} is required.`;
    },
  };
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
  render: () => <DateTimeField label="Est. Close Date" required {...makeRequired("Est. Close Date")} />,
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
export const LocalizedCalendar: Story = {
  name: "Localized strings + first day Monday",
  render: () => (
    <DateTimeField
      label="Est. Close Date"
      firstDayOfWeek={1}
      strings={{
        months: [
          "januari", "februari", "maart", "april", "mei", "juni",
          "juli", "augustus", "september", "oktober", "november", "december",
        ],
        shortMonths: [
          "jan", "feb", "mrt", "apr", "mei", "jun",
          "jul", "aug", "sep", "okt", "nov", "dec",
        ],
        days: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
        shortDays: ["Z", "M", "D", "W", "D", "V", "Z"],
        goToToday: "Naar vandaag",
      }}
      formatDate={(date) =>
        `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`
      }
      {...make(sampleDate)}
    />
  ),
};
