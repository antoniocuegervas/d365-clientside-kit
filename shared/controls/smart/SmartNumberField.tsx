import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { CurrencyField } from "../presentational/CurrencyField";
import { NumberField } from "../presentational/NumberField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartNumberFieldProps extends ISmartFieldProps<number | null> {
  /**
   * Currency symbol when the attribute is money. Highest priority; when omitted,
   * `transactionCurrencyId` (if given) resolves the record's real symbol,
   * otherwise the field falls back to "$".
   */
  currencySymbol?: string;
  /**
   * The record's transaction currency id (e.g. `_transactioncurrencyid_value`).
   * When supplied for a money field, the smart tier resolves the currency's
   * symbol from it and supplies it to the presentational control.
   */
  transactionCurrencyId?: string;
}

/**
 * Numeric field for whole/decimal/double/money attributes. Precision and min/max
 * come from metadata; the decimal symbol and group separator follow the user's
 * locale. Money fields show the record's real currency symbol when
 * `transactionCurrencyId` is supplied (else the `currencySymbol` prop, else "$").
 * `SmartFieldBase` loads the metadata and renders the loading/error state.
 */
export class SmartNumberField extends SmartFieldBase<number | null, ISmartNumberFieldProps> {
  private resolvedCurrencySymbol?: string;

  protected override usesFormatting(): boolean {
    return true;
  }

  override componentDidMount(): void {
    super.componentDidMount();
    const { transactionCurrencyId, currencySymbol } = this.props;
    if (transactionCurrencyId && !currencySymbol) {
      void this.loadCurrency(transactionCurrencyId);
    }
  }

  private async loadCurrency(transactionCurrencyId: string): Promise<void> {
    try {
      const info = await this.vmContext.metadata.getCurrencySymbol(transactionCurrencyId);
      if (!this.isDisposed) {
        this.resolvedCurrencySymbol = info.symbol;
        this.forceUpdate();
      }
    } catch {
      // Non-fatal: fall back to the supplied/default symbol.
    }
  }

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const formatting = this.state.formatting;
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
      decimalSymbol: formatting?.decimalSymbol,
      groupSeparator: formatting?.numberSeparator,
    };
    if (metadata.kind === "money") {
      return (
        <CurrencyField
          {...common}
          currencySymbol={this.props.currencySymbol ?? this.resolvedCurrencySymbol}
          precision={metadata.precision ?? 2}
        />
      );
    }
    const precision = metadata.kind === "integer" ? 0 : metadata.precision;
    return <NumberField {...common} precision={precision} />;
  }
}
