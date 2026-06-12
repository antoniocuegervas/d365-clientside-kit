import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { CurrencyField } from "../presentational/CurrencyField";
import { NumberField } from "../presentational/NumberField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartNumberFieldProps extends ISmartFieldProps<number | null> {
  /**
   * Currency symbol when the attribute is money. Metadata does not carry the
   * record's transaction currency in v1, defaults to "$", override per app.
   */
  currencySymbol?: string;
}

/**
 * Numeric block for whole/decimal/double/money attributes, precision and
 * min/max resolve from metadata (: no hand-configured precision).
 */
export class SmartNumberField extends SmartFieldBase<number | null, ISmartNumberFieldProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const common = {
      label: this.resolveLabel(metadata),
      required: this.resolveRequired(metadata),
      disabled: this.props.disabled,
      readOnly: this.props.readOnly,
      errorMessage: this.props.errorMessage,
      value: this.props.value,
      onChange: this.commitChange,
      min: metadata.minValue,
      max: metadata.maxValue,
    };
    if (metadata.kind === "money") {
      return (
        <CurrencyField
          {...common}
          currencySymbol={this.props.currencySymbol}
          precision={metadata.precision ?? 2}
        />
      );
    }
    const precision = metadata.kind === "integer" ? 0 : metadata.precision;
    return <NumberField {...common} precision={precision} />;
  }
}
