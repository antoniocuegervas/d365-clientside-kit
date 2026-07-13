import type { DatePickerProps } from "@fluentui/react-datepicker-compat";
import type { IDateFormatInfo } from "../../context/IViewModelContext";
import { kitStrings } from "../../localization/kitStrings";

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
  const strings = kitStrings();
  return {
    months: info.monthNames,
    shortMonths: info.abbreviatedMonthNames.length >= 12 ? info.abbreviatedMonthNames : info.monthNames,
    days: info.dayNames,
    shortDays: info.shortestDayNames.length >= 7 ? info.shortestDayNames : info.dayNames,
    goToToday: strings.goToToday,
    prevMonthAriaLabel: strings.prevMonthAriaLabel,
    nextMonthAriaLabel: strings.nextMonthAriaLabel,
    prevYearAriaLabel: strings.prevYearAriaLabel,
    nextYearAriaLabel: strings.nextYearAriaLabel,
  };
}

/** First day of week as Fluent's DayOfWeek (0 = Sunday), clamped to 0–6. */
export function toFirstDayOfWeek(info: IDateFormatInfo): DatePickerProps["firstDayOfWeek"] {
  const day = Math.max(0, Math.min(6, info.firstDayOfWeek));
  return day as NonNullable<DatePickerProps["firstDayOfWeek"]>;
}

/**
 * Maps the user's short time pattern to the hourCycle the Fluent time controls
 * take. The .NET custom pattern letters: "H" is the 24-hour hour, "h" the
 * 12-hour hour (with "tt" the AM/PM designator riding along with h). An
 * uppercase "H" anywhere means 24-hour ("h23"); otherwise a lowercase "h" means
 * 12-hour ("h12"); a pattern with neither, or no pattern, yields undefined so
 * the control keeps the browser-locale default. Deliberately dumb: it reads the
 * pattern letters, nothing more.
 */
export function toHourCycle(timeFormat: string | undefined): "h12" | "h23" | undefined {
  if (!timeFormat) {
    return undefined;
  }
  if (timeFormat.includes("H")) {
    return "h23";
  }
  if (timeFormat.includes("h")) {
    return "h12";
  }
  return undefined;
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

/**
 * A parser for typed dates that honors the user's short date pattern, so a value
 * typed as it is displayed (e.g. "01/06/2001" under "dd/MM/yyyy" is 1 June) is
 * read back correctly. Without this the Fluent picker falls back to the browser's
 * m/d/y parsing and misreads d/m/y input. Returns an Invalid Date for anything
 * that does not parse (the picker then keeps the previous value). Returns
 * undefined when no pattern is known, so the control keeps its default parsing.
 */
export function makeParseDate(info: IDateFormatInfo): ((value: string) => Date) | undefined {
  const pattern = info.shortDatePattern;
  if (!pattern) {
    return undefined;
  }
  // Field order (day/month/year) as it appears in the pattern: "M" is month,
  // "d" day, "y" year. Each field is recorded once, on its first token char.
  const order: Array<"d" | "m" | "y"> = [];
  const seen = { d: false, m: false, y: false };
  for (const char of pattern) {
    const lower = char.toLowerCase();
    if (lower === "d" && !seen.d) {
      order.push("d");
      seen.d = true;
    } else if (lower === "m" && !seen.m) {
      order.push("m");
      seen.m = true;
    } else if (lower === "y" && !seen.y) {
      order.push("y");
      seen.y = true;
    }
  }
  return (value: string): Date => {
    const invalid = new Date(NaN);
    const parts = value.split(/\D+/).filter((part) => part !== "");
    if (parts.length < 3 || order.length < 3) {
      return invalid;
    }
    const fields: Record<"d" | "m" | "y", number> = { d: NaN, m: NaN, y: NaN };
    order.forEach((field, index) => {
      fields[field] = Number(parts[index]);
    });
    const { d, m } = fields;
    let { y } = fields;
    if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) {
      return invalid;
    }
    if (y < 100) {
      y += y < 50 ? 2000 : 1900; // two-digit-year heuristic, matching the platform
    }
    const date = new Date(y, m - 1, d);
    // Reject out-of-range parts (e.g. 31/02) by checking the round-trip.
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return invalid;
    }
    return date;
  };
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
