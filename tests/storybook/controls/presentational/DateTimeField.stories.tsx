import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { DateTimeField } from "../../../../shared/controls/presentational/DateTimeField";

const meta: Meta<typeof DateTimeField> = {
  title: "Presentational Controls/DateTimeField",
  component: DateTimeField,
  parameters: {
    docs: {
      description: {
        component:
          "Date and date-time picker. `value` (a Date-or-null Observable or plain value) plus " +
          "`onChange`; whether the time part shows (`includeTime`) and how values format are " +
          "supplied by the host, because date-only versus date-and-time is a property of the " +
          "column, not the control. `SmartDatePicker` resolves the attribute's date behavior " +
          "and format from metadata and renders this control.",
      },
    },
  },
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
export const TwentyFourHourTime: Story = {
  name: "24-hour time (hourCycle h23)",
  render: () => (
    // hourCycle h23 fixes the clock at 24-hour regardless of the browser locale,
    // so 2:30 PM reads as "14:30" for a 24-hour user.
    <DateTimeField label="Scheduled Start" includeTime hourCycle="h23" {...make(sampleDate)} />
  ),
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
export const NarrowContainer: Story = {
  name: "Field-width container (360px)",
  render: () => (
    // A fixed 360px wrapper (a normal field width) shows the date and time on one
    // line: the date takes the remaining width beside the compact time.
    <div style={{ width: 360 }}>
      <DateTimeField label="Scheduled Start" includeTime {...make(sampleDate)} />
    </div>
  ),
};
export const Stacked: Story = {
  name: "Stacked (narrow, 280px)",
  render: () => (
    // Below the readable threshold the fields stack onto their own full-width
    // lines, so the time fills its line.
    <div style={{ width: 280 }}>
      <DateTimeField label="Scheduled Start" includeTime {...make(sampleDate)} />
    </div>
  ),
};
