import * as React from "react";
import { render, screen } from "@testing-library/react";
import { formatDateToTimeString } from "@fluentui/react-timepicker-compat";
import { DateTimeField } from "../../../../../shared/controls/presentational/DateTimeField";
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
