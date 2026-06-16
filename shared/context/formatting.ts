import type { CdsClient } from "../data/CdsClient";
import { normalizeGuid } from "../utils/EntityModel";
import type { IDateFormatInfo, IFormattingInfo } from "./IViewModelContext";

/**
 * Locale/user-settings formatting resolution shared by the host adapters (G-06).
 *
 * Hosts expose pieces of this differently: modern/PCF carry the date-format
 * info in the global/PCF user settings; the decimal symbol and number
 * separator live on the `usersettings` entity and are queried via cds-client
 * (the proven webresource path). All pieces are optional, a control falls
 * back to its own defaults when a value is absent.
 */

/** Loose shape covering both Xrm (PascalCase) and PCF (camelCase) date-format objects. */
type RawDateFormat = Record<string, unknown> | undefined;

function readStringArray(raw: RawDateFormat, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = raw?.[key];
    if (Array.isArray(value)) {
      return value.map((v) => String(v));
    }
  }
  return [];
}

function readNumber(raw: RawDateFormat, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return fallback;
}

function readString(raw: RawDateFormat, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Normalizes a host date-format object (Xrm `dateFormattingInfo` or PCF
 * `dateFormattingInfo`) to the kit's `IDateFormatInfo`. Trims the trailing
 * empty 13th month some hosts include so the arrays are calendar-ready.
 */
export function normalizeDateFormatInfo(raw: RawDateFormat): IDateFormatInfo | undefined {
  if (!raw) {
    return undefined;
  }
  const monthNames = readStringArray(raw, "MonthNames", "monthNames").filter((n) => n).slice(0, 12);
  const abbreviatedMonthNames = readStringArray(raw, "AbbreviatedMonthNames", "abbreviatedMonthNames")
    .filter((n) => n)
    .slice(0, 12);
  const dayNames = readStringArray(raw, "DayNames", "dayNames").slice(0, 7);
  const shortestDayNames = readStringArray(
    raw,
    "ShortestDayNames",
    "shortestDayNames",
    "AbbreviatedDayNames",
    "abbreviatedDayNames"
  ).slice(0, 7);
  if (monthNames.length === 0 && dayNames.length === 0) {
    return undefined; // nothing usable
  }
  return {
    dayNames,
    monthNames,
    shortestDayNames,
    abbreviatedMonthNames,
    firstDayOfWeek: readNumber(raw, 0, "FirstDayOfWeek", "firstDayOfWeek"),
    shortDatePattern: readString(raw, "ShortDatePattern", "shortDatePattern"),
  };
}

/**
 * Fills in the decimal symbol / number separator from the `usersettings`
 * entity when the host did not already provide them. Failures are swallowed , 
 * the controls fall back to browser-locale formatting.
 */
export async function resolveFormatting(input: {
  client: CdsClient;
  userId: string;
  dateFormatInfo?: IDateFormatInfo;
  decimalSymbol?: string;
  numberSeparator?: string;
}): Promise<IFormattingInfo> {
  let { decimalSymbol, numberSeparator } = input;
  if (decimalSymbol === undefined || numberSeparator === undefined) {
    try {
      const result = await input.client.retrieveMultiple(
        "usersettingscollection",
        `?$select=decimalsymbol,numberseparator&$filter=systemuserid eq ${normalizeGuid(input.userId)}`
      );
      const row = result.entities[0];
      if (row) {
        decimalSymbol = decimalSymbol ?? (row.decimalsymbol as string | undefined);
        numberSeparator = numberSeparator ?? (row.numberseparator as string | undefined);
      }
    } catch {
      // leave undefined, controls fall back to defaults
    }
  }
  return { decimalSymbol, numberSeparator, dateFormatInfo: input.dateFormatInfo };
}
