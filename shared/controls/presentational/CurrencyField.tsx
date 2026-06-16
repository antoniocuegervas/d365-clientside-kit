import * as React from "react";
import type { Observable } from "../../reactivity/Observable";
import { NumberField } from "./NumberField";
import type { ICommonFieldProps } from "./fieldProps";

export interface ICurrencyFieldProps extends ICommonFieldProps {
  value: Observable<number | null>;
  onChange?: (value: number | null) => void;
  /** Currency symbol to display, SUPPLIED by the host (smart tier resolves it). */
  currencySymbol?: string;
  /** Decimal places. Default 2. */
  precision?: number;
  min?: number;
  max?: number;
  /** Decimal separator (CRM user setting), forwarded to the number input. */
  decimalSymbol?: string;
  /** Group (thousands) separator (CRM user setting), forwarded to the number input. */
  groupSeparator?: string;
}

/** Currency, a NumberField with a supplied currency symbol prefix. */
export class CurrencyField extends React.Component<ICurrencyFieldProps> {
  override render(): React.ReactNode {
    const { currencySymbol, precision, ...rest } = this.props;
    return <NumberField {...rest} prefix={currencySymbol ?? "$"} precision={precision ?? 2} />;
  }
}
