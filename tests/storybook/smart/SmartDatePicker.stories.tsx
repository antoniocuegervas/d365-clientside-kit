import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { SmartDatePicker } from "../../../shared/controls/smart/SmartDatePicker";
import {
  fieldContext,
  withContext,
  sample,
  makeRequired,
  fieldContractNote,
} from "./smartStoryHarness";

const meta: Meta<typeof SmartDatePicker> = {
  title: "Smart Controls/SmartDatePicker",
  component: SmartDatePicker,
  decorators: [withContext(fieldContext)],
  parameters: {
    docs: {
      description: {
        component:
          "Date and date-time field. Date-only vs date+time comes from the attribute, and the " +
          "calendar strings, first day of week, and display format follow the user's locale. " +
          fieldContractNote,
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SmartDatePicker>;

const birthday = new Observable<Date | null>(new Date(1985, 3, 14));
const startTime = new Observable<Date | null>(new Date(2026, 5, 22, 9, 30));
const required = makeRequired<Date>("Birthday is required.");

export const DateOnly: Story = {
  name: "Date-only (from metadata)",
  render: () => <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} />,
  parameters: sample(
    `// contact.birthdate is date-only, so the picker hides the time part. The
// calendar strings, first day of week, and display format follow the user's
// Language and Format settings in Dataverse.
//
// Dataverse returns a date-only value as a plain string ("1985-04-14"), not a
// Date. Build it with local parts to avoid a UTC-midnight off-by-one:
//   const [y, m, d] = record.birthdate.split("-").map(Number);
//   const birthday = new Observable(new Date(y, m - 1, d));
const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} />`,
    "Date-only attributes hide the time part. Construct the Date from the value's local calendar parts (not new Date(\"1985-04-14\"), which parses as UTC midnight and can shift a day in negative-offset time zones)."
  ),
};

export const DateAndTime: Story = {
  name: "Date + time (from metadata)",
  render: () => (
    <SmartDatePicker entity="appointment" attribute="scheduledstart" value={startTime} />
  ),
  parameters: sample(
    `// appointment.scheduledstart is a date-time attribute, so the same control
// also shows a time part. The attribute kind decides it, not a prop.
const startTime = new Observable<Date | null>(new Date(2026, 5, 22, 9, 30));

<SmartDatePicker entity="appointment" attribute="scheduledstart" value={startTime} />`,
    "Date-only vs date+time comes straight from the attribute kind, so the same control covers both."
  ),
};

export const Required: Story = {
  render: () => (
    <SmartDatePicker
      entity="contact"
      attribute="birthdate"
      value={required.value}
      required
      errorMessage={required.errorMessage}
      onChange={required.onChange}
    />
  ),
  parameters: sample(
    `// The control writes birthday itself when a date is picked; this onChange
// only keeps the error in step, clearing it once a date is present.
const birthday = new Observable<Date | null>(null);
const error = new Observable<string | undefined>("Birthday is required.");
const onChange = (v: Date | null) => {
  error.value = v ? undefined : "Birthday is required.";
};

<SmartDatePicker
  entity="contact"
  attribute="birthdate"
  value={birthday}
  required
  errorMessage={error}
  onChange={onChange}
/>`,
    "The control writes the value Observable itself; the onChange shown only clears the error, which tracks input the way live form validation does."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} disabled />
  ),
  parameters: sample(
    `const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} disabled />`,
    "Disabled greys the picker and blocks interaction; the date stays visible. It is a prop the ViewModel drives from business rules, not a metadata default. Use readOnly when the value should stay readable without dimming."
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} readOnly />
  ),
  parameters: sample(
    `const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} readOnly />`,
    "Read-only renders the formatted date as locked text (no calendar button); disabled dims the whole control and blocks focus. This is distinct from Dataverse field-level security, which also produces a read-only field via metadata."
  ),
};

export const MondayFirst: Story = {
  name: "First day of week overridden (Monday)",
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} firstDayOfWeek={1} />
  ),
  parameters: sample(
    `// The calendar's first day is the ORG-level format setting (System Settings,
// Formats), not the user's personal Format locale, so a Monday-first user on a
// Sunday-first org still gets Sunday (matching the native picker beside it).
// Pass firstDayOfWeek to follow a different convention per deployment (1 = Monday).
<SmartDatePicker
  entity="contact"
  attribute="birthdate"
  value={birthday}
  firstDayOfWeek={1}
/>`,
    "First day of week defaults to the host, whose value is the org-level format setting (Sunday for an en-US org). Override it with firstDayOfWeek; here Monday (1). See the date-picker gotcha."
  ),
};
