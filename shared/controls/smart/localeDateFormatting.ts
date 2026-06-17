import type { DatePickerProps } from "@fluentui/react-datepicker-compat";
import type { IDateFormatInfo } from "../../context/IViewModelContext";

/**
 * Smart-tier helpers that turn the context's normalized `IDateFormatInfo`
 * into the plain presentational props `DateTimeField` accepts:
 * localized calendar strings, first day of week, and a pattern-based date
 * formatter. Lives in the smart tier so the presentational control stays free
 * of any context type.
 */

/** Builds Fluent DatePicker calendar strings from localized day/month names. */
export function buildDatePickerStrings(
  info: IDateFormatInfo
): DatePickerProps["strings"] | undefined {
  if (info.monthNames.length < 12 || info.dayNames.length < 7) {
    return undefined; // incomplete, let the picker use its English defaults
  }
  return {
    months: info.monthNames,
    shortMonths: info.abbreviatedMonthNames.length >= 12 ? info.abbreviatedMonthNames : info.monthNames,
    days: info.dayNames,
    shortDays: info.shortestDayNames.length >= 7 ? info.shortestDayNames : info.dayNames,
    goToToday: "Go to today",
  };
}

/** First day of week as Fluent's DayOfWeek (0 = Sunday), clamped to 0–6. */
export function toFirstDayOfWeek(info: IDateFormatInfo): DatePickerProps["firstDayOfWeek"] {
  const day = Math.max(0, Math.min(6, info.firstDayOfWeek));
  return day as NonNullable<DatePickerProps["firstDayOfWeek"]>;
}

/**
 * A date formatter honoring the user's short date pattern (e.g. "dd/MM/yyyy"),
 * using the localized month names for MMM/MMMM tokens. Returns undefined when
 * no pattern is known, so the control keeps its default `toLocaleDateString`.
 */
export function makeFormatDate(info: IDateFormatInfo): ((date: Date) => string) | undefined {
  const pattern = info.shortDatePattern;
  if (!pattern) {
    return undefined;
  }
  return (date: Date): string => formatByPattern(date, pattern, info);
}

const TOKEN = /yyyy|yy|MMMM|MMM|MM|M|dd|d/g;

function formatByPattern(date: Date, pattern: string, info: IDateFormatInfo): string {
  const day = date.getDate();
  const month = date.getMonth(); // 0-based
  const year = date.getFullYear();
  return pattern.replace(TOKEN, (token) => {
    switch (token) {
      case "yyyy":
        return String(year);
      case "yy":
        return String(year % 100).padStart(2, "0");
      case "MMMM":
        return info.monthNames[month] ?? String(month + 1);
      case "MMM":
        return info.abbreviatedMonthNames[month] ?? info.monthNames[month] ?? String(month + 1);
      case "MM":
        return String(month + 1).padStart(2, "0");
      case "M":
        return String(month + 1);
      case "dd":
        return String(day).padStart(2, "0");
      case "d":
        return String(day);
      default:
        return token;
    }
  });
}
