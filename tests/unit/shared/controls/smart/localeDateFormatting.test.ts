import {
  buildDatePickerStrings,
  makeParseDate,
  toFirstDayOfWeek,
  toHourCycle,
} from "../../../../../shared/controls/smart/localeDateFormatting";
import { normalizeDateFormatInfo } from "../../../../../shared/context/hostSurface";

/**
 * toHourCycle reads the .NET custom time-pattern letters: "H" is the 24-hour
 * hour, "h" the 12-hour hour (with "tt" riding along for AM/PM). Uppercase "H"
 * wins; a pattern with no hour letter, or none at all, yields undefined.
 */
describe("toHourCycle", () => {
  it.each([
    ["H:mm", "h23"],
    ["HH:mm", "h23"],
    ["hh:mm tt", "h12"],
    ["h:mm tt", "h12"],
  ])("maps %s to %s", (pattern, expected) => {
    expect(toHourCycle(pattern)).toBe(expected);
  });

  it("returns undefined for no pattern or a pattern with no hour letter", () => {
    expect(toHourCycle(undefined)).toBeUndefined();
    expect(toHourCycle("mm")).toBeUndefined();
  });
});

/**
 * The KitDatePicker PCF root builds no kit context, so it normalizes the host's
 * own camelCase dateFormattingInfo and threads the four locale helpers into the
 * presentational field itself. This pins that whole path: a camelCase, en-GB
 * shaped object (Monday first, day-first pattern, 24-hour clock) through
 * normalizeDateFormatInfo and out the four helpers the root passes.
 */
describe("normalizeDateFormatInfo feeding the DatePicker locale helpers", () => {
  const raw: Record<string, unknown> = {
    firstDayOfWeek: 1,
    shortDatePattern: "dd/MM/yyyy",
    shortTimePattern: "HH:mm",
    monthNames: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    abbreviatedMonthNames: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortestDayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  };
  const info = normalizeDateFormatInfo(raw);

  it("normalizes the camelCase host object", () => {
    expect(info).toBeDefined();
  });

  it("yields Monday as the first day of the week", () => {
    expect(toFirstDayOfWeek(info!)).toBe(1);
  });

  it("parses a day-first typed date under the pattern (05/01/1990 is 5 January)", () => {
    const parse = makeParseDate(info!);
    expect(parse).toBeDefined();
    const date = parse!("05/01/1990");
    expect(date.getFullYear()).toBe(1990);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(5);
  });

  it("reads the 24-hour clock from the time pattern", () => {
    expect(toHourCycle(info!.shortTimePattern)).toBe("h23");
  });

  it("builds calendar strings from the localized names", () => {
    const strings = buildDatePickerStrings(info!);
    expect(strings?.months).toEqual(raw.monthNames);
    expect(strings?.days).toEqual(raw.dayNames);
  });
});
