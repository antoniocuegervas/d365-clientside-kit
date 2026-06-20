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
// locale (resolved through getFormatting on the host).
const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} />`
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
    `// The ViewModel owns the value and the error, and clears the error once a
// date is picked, so the message tracks input.
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
    "The required message clears the moment a date is picked, mirroring live form validation."
  ),
};

export const Disabled: Story = {
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} disabled />
  ),
  parameters: sample(
    `const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} disabled />`
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} readOnly />
  ),
  parameters: sample(
    `const birthday = new Observable<Date | null>(new Date(1985, 3, 14));

<SmartDatePicker entity="contact" attribute="birthdate" value={birthday} readOnly />`
  ),
};

export const MondayFirst: Story = {
  name: "First day of week overridden (Monday)",
  render: () => (
    <SmartDatePicker entity="contact" attribute="birthdate" value={birthday} firstDayOfWeek={1} />
  ),
  parameters: sample(
    `// Dataverse ties the calendar's first day to the user's Language, not their
// Format locale, so a UK-format user still gets Sunday-first (matching native).
// Pass firstDayOfWeek to honor the locale per deployment (1 = Monday).
<SmartDatePicker
  entity="contact"
  attribute="birthdate"
  value={birthday}
  firstDayOfWeek={1}
/>`,
    "First day of week defaults to the host (Dataverse derives it from Language, so Sunday for en-US). Override it with firstDayOfWeek; here Monday (1). See the date-picker gotcha."
  ),
};
