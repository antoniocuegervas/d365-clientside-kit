import * as React from "react";
import type { Observable } from "../../reactivity/Observable";
import { NumberField } from "./NumberField";
import type { ICommonFieldProps } from "./fieldProps";

export interface ICurrencyFieldProps extends ICommonFieldProps {
  value: Observable<number | null>;
  onChange?: (value: number | null) => void;
  /** Currency symbol to display, SUPPLIED by the host (smart tier resolves it). */
  currencySymbol?: string;
  /**
   * Symbol placement, the usersettings currencyformatcode (.NET
   * CurrencyPositivePattern): 0 symbol-amount, 1 amount-symbol, 2
   * symbol-space-amount, 3 amount-space-symbol. Undefined keeps the leading
   * symbol with a separating space (the kit's original rendering), SUPPLIED by
   * the host (smart tier resolves it from the user's formatting).
   */
  currencyFormatCode?: number;
  /** Decimal places. Default 2. */
  precision?: number;
  min?: number;
  max?: number;
  /** Decimal separator (CRM user setting), forwarded to the number input. */
  decimalSymbol?: string;
  /** Group (thousands) separator (CRM user setting), forwarded to the number input. */
  groupSeparator?: string;
}

/**
 * Currency, a NumberField with a supplied currency symbol placed by the user's
 * currency format code. The code maps to a leading (prefix) or trailing
 * (suffix) symbol with the platform's spacing; an undefined code keeps the
 * original leading-symbol-with-space rendering, so existing consumers are
 * byte-identical.
 */
export class CurrencyField extends React.Component<ICurrencyFieldProps> {
  override render(): React.ReactNode {
    const { currencySymbol, currencyFormatCode, precision, ...rest } = this.props;
    const symbol = currencySymbol ?? "$";
    const affix = currencyAffix(symbol, currencyFormatCode);
    return <NumberField {...rest} {...affix} precision={precision ?? 2} />;
  }
}

/**
 * Maps a currency symbol + format code to the NumberField prefix or suffix.
 * The .NET CurrencyPositivePattern spacing: 0 "$n", 1 "n$", 2 "$ n", 3 "n $".
 * An undefined or unrecognized code keeps the original "$ n" (leading symbol,
 * separating space) so a host that never resolves the code renders as before.
 * The prefix or suffix carries its own spacing; NumberField renders it verbatim.
 */
function currencyAffix(
  symbol: string,
  code: number | undefined
): { prefix?: string; suffix?: string } {
  switch (code) {
    case 0:
      return { prefix: symbol };
    case 1:
      return { suffix: symbol };
    case 2:
      return { prefix: `${symbol} ` };
    case 3:
      return { suffix: ` ${symbol}` };
    default:
      return { prefix: `${symbol} ` };
  }
}
