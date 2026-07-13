import * as React from "react";
import { render } from "@testing-library/react";
import { CurrencyField } from "../../../../../shared/controls/presentational/CurrencyField";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * CurrencyField places the currency symbol by the user's currency format code
 * (the .NET CurrencyPositivePattern). These pin the exact read-only composition
 * per code and the leading/trailing slot in edit mode. The value formats with a
 * European decimal (",") and group (".") so the symbol placement reads clearly.
 */
describe("CurrencyField symbol placement", () => {
  const renderReadOnly = (code: number | undefined) =>
    render(
      <CurrencyField
        label="Amount"
        value={new Observable<number | null>(1234.5)}
        currencySymbol="€"
        decimalSymbol=","
        groupSeparator="."
        currencyFormatCode={code}
        readOnly
      />
    );

  it("renders each format code's documented read-only composition", () => {
    // 1234.5 at precision 2 with ",": "1.234,50". Then per .NET pattern:
    const cases: Array<[number | undefined, string]> = [
      [0, "€1.234,50"], // symbol-amount
      [1, "1.234,50€"], // amount-symbol
      [2, "€ 1.234,50"], // symbol-space-amount
      [3, "1.234,50 €"], // amount-space-symbol
      [undefined, "€ 1.234,50"], // today's rendering (leading symbol + space)
    ];
    for (const [code, expected] of cases) {
      const view = renderReadOnly(code);
      expect(view.getByText(expected)).toBeTruthy();
      view.unmount();
    }
  });

  it("places the symbol before the input for a leading code (0)", () => {
    const view = render(
      <CurrencyField
        label="Amount"
        value={new Observable<number | null>(1234.5)}
        currencySymbol="€"
        currencyFormatCode={0}
      />
    );
    const input = view.container.querySelector("input")!;
    const symbol = view.getByText("€");
    // The symbol element precedes the input in DOM order (contentBefore).
    expect(input.compareDocumentPosition(symbol) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("places the symbol after the input for a trailing code (3)", () => {
    const view = render(
      <CurrencyField
        label="Amount"
        value={new Observable<number | null>(1234.5)}
        currencySymbol="€"
        currencyFormatCode={3}
      />
    );
    const input = view.container.querySelector("input")!;
    const symbol = view.getByText("€");
    // The symbol element follows the input in DOM order (contentAfter).
    expect(input.compareDocumentPosition(symbol) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the leading symbol before the input for an undefined code (today's behavior)", () => {
    const view = render(
      <CurrencyField
        label="Amount"
        value={new Observable<number | null>(1234.5)}
        currencySymbol="€"
      />
    );
    const input = view.container.querySelector("input")!;
    const symbol = view.getByText("€");
    expect(input.compareDocumentPosition(symbol) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});
