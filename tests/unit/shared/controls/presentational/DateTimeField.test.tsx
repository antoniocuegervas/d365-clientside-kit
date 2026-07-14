import * as React from "react";
import { render, screen } from "@testing-library/react";
import { formatDateToTimeString } from "@fluentui/react-timepicker-compat";
import {
  DateTimeField,
  dateTimeStacked,
  DATE_TIME_STACK_BELOW_PX,
} from "../../../../../shared/controls/presentational/DateTimeField";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * DateTimeField renders the time in the user's clock when the smart tier passes
 * an hourCycle. formatDateToTimeString with an explicit hourCycle is
 * deterministic regardless of the test runner's browser locale, so 3pm reads as
 * "15:00" under h23 here. Undefined keeps the plain (browser-locale) call.
 */
describe("DateTimeField hourCycle", () => {
  const at3pm = new Date(2026, 5, 18, 15, 0);

  it("renders 24-hour time in the read-only text when hourCycle is h23", () => {
    render(
      <DateTimeField
        label="Scheduled Start"
        value={new Observable<Date | null>(at3pm)}
        includeTime
        hourCycle="h23"
        readOnly
      />
    );
    const time = formatDateToTimeString(at3pm, { hourCycle: "h23" });
    // 3pm as 24-hour, no meridiem, whatever the runner locale.
    expect(time).toMatch(/^15[:.]/);
    expect(time).not.toMatch(/[AP]M/i);
    const expected = `${at3pm.toLocaleDateString()} ${time}`;
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("keeps the plain browser-locale time when hourCycle is undefined", () => {
    render(
      <DateTimeField
        label="Scheduled Start"
        value={new Observable<Date | null>(at3pm)}
        includeTime
        readOnly
      />
    );
    // The default call (no hourCycle) is what the control still makes.
    const expected = `${at3pm.toLocaleDateString()} ${formatDateToTimeString(at3pm)}`;
    expect(screen.getByText(expected)).toBeTruthy();
  });
});

/**
 * dateTimeStacked is the pure decision behind the responsive date/time layout:
 * given the container's measured width it says whether the pair stacks onto two
 * full-width lines. jsdom has no layout engine, so the function is tested
 * directly rather than through a rendered width.
 */
describe("DateTimeField stacking decision", () => {
  it("stays side by side until the container has been measured", () => {
    expect(dateTimeStacked(0, true)).toBe(false);
  });

  it("keeps a normal field-width cell on one line", () => {
    expect(dateTimeStacked(377, true)).toBe(false);
  });

  it("stacks once the container drops below the readable threshold", () => {
    expect(dateTimeStacked(DATE_TIME_STACK_BELOW_PX - 1, true)).toBe(true);
  });

  it("treats the threshold width itself as still side by side", () => {
    expect(dateTimeStacked(DATE_TIME_STACK_BELOW_PX, true)).toBe(false);
  });

  it("never stacks a date-only field", () => {
    expect(dateTimeStacked(200, false)).toBe(false);
  });
});
