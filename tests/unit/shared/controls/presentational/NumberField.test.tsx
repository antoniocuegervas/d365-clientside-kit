import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "../../../../../shared/controls/presentational/NumberField";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * NumberField has genuine parse/format logic, so it gets a unit test
 * (presentational stories carry the rest). These cover the CRM-settings
 * separators.
 */
describe("NumberField separators", () => {
  it("formats at rest with the supplied decimal symbol and group separator", () => {
    const value = new Observable<number | null>(1234567.5);
    render(
      <NumberField label="Amount" value={value} precision={2} decimalSymbol="," groupSeparator="." />
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1.234.567,50");
  });

  it("parses input typed with those separators back to a number", async () => {
    const value = new Observable<number | null>(null);
    const changes: Array<number | null> = [];
    render(
      <NumberField
        label="Amount"
        value={value}
        precision={2}
        decimalSymbol=","
        groupSeparator="."
        onChange={(v) => changes.push(v)}
      />
    );
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "1.234,50");
    await userEvent.tab(); // blur commits
    expect(changes.at(-1)).toBe(1234.5);
  });

  it("keeps browser-locale behavior when no separators are supplied", () => {
    const value = new Observable<number | null>(1000);
    render(<NumberField label="Amount" value={value} precision={0} />);
    // toLocaleString in the test env groups with commas; the key point is the
    // custom-format branch is NOT taken.
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      (1000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    );
  });
});
