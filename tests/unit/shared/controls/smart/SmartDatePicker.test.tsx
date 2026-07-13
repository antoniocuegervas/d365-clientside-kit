import * as React from "react";
import { render, screen } from "@testing-library/react";
import { ViewModelContextProvider } from "../../../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { SmartDatePicker } from "../../../../../shared/controls/smart/SmartDatePicker";
import { createFakeViewModelContext } from "../../../../mocks/fakeViewModelContext";

/**
 * SmartDatePicker maps the user's short time pattern (from getFormatting) into
 * DateTimeField's hourCycle, so a 24-hour user reads a 24-hour time regardless
 * of the browser locale.
 */
describe("SmartDatePicker time format", () => {
  it("threads the user's 24-hour time pattern into the time display", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "appointment.scheduledstart": { DisplayName: "Start", Type: "datetime" },
      },
      formatting: { timeFormat: "H:mm" },
    });
    const value = new Observable<Date | null>(new Date(2026, 5, 18, 15, 0));
    render(
      <ViewModelContextProvider context={context}>
        <SmartDatePicker
          entity="appointment"
          attribute="scheduledstart"
          value={value}
          readOnly
        />
      </ViewModelContextProvider>
    );
    // 3pm renders as 24-hour "15:00" (h23), never "3:00 PM".
    expect(await screen.findByText(/\b15:00\b/)).toBeTruthy();
    expect(screen.queryByText(/[AP]M/i)).toBeNull();
  });
});
