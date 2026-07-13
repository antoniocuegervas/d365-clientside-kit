import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import {
  attributeKind,
  attributeMaxValue,
  attributeMinValue,
  attributePrecision,
  attributePrecisionSource,
} from "../../metadata/attributeMetadataReads";
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
  private resolvedCurrencyPrecision?: number;
  /** Bumped per currency load so a slow earlier record's symbol cannot win. */
  private currencySequence = 0;
  /** Org pricing precision, resolved when a money field declares PrecisionSource 2. */
  private resolvedOrgPrecision?: number;

  protected override usesFormatting(): boolean {
    return true;
  }

  override componentDidUpdate(prevProps: ISmartNumberFieldProps): void {
    super.componentDidUpdate(prevProps);
    // A reused instance following a record change must not keep showing the
    // previous record's currency symbol and precision. (The FIRST load rides
    // loadExtras with the metadata; this path is a runtime record change.)
    if (prevProps.transactionCurrencyId !== this.props.transactionCurrencyId) {
      this.currencySequence++;
      this.resolvedCurrencySymbol = undefined;
      this.resolvedCurrencyPrecision = undefined;
      const { transactionCurrencyId, currencySymbol } = this.props;
      if (transactionCurrencyId && !currencySymbol) {
        void this.loadCurrency(transactionCurrencyId);
      } else {
        this.forceUpdate();
      }
    }
  }

  /**
   * Everything a money field's first paint can need, resolved BEFORE the
   * single metadata commit (see SmartFieldBase.loadExtras): the record
   * currency's symbol and precision, and the org pricing precision when the
   * attribute declares PrecisionSource 2. Both cached by the context, both
   * non-fatal (the field falls back to the attribute precision and the
   * default symbol).
   */
  protected override async loadExtras(
    metadata: IAttributeMetadata
  ): Promise<(() => void) | undefined> {
    const { transactionCurrencyId, currencySymbol } = this.props;
    const wantsCurrency = !!transactionCurrencyId && !currencySymbol;
    const wantsOrgPrecision =
      attributeKind(metadata) === "money" && attributePrecisionSource(metadata) === 2;
    if (!wantsCurrency && !wantsOrgPrecision) {
      return undefined;
    }
    const sequence = ++this.currencySequence;
    const [currency, orgPrecision] = await Promise.all([
      wantsCurrency
        ? this.vmContext.metadata.getCurrencySymbol(transactionCurrencyId).catch(() => undefined)
        : Promise.resolve(undefined),
      wantsOrgPrecision
        ? this.vmContext.metadata.getPricingDecimalPrecision().catch(() => undefined)
        : Promise.resolve(undefined),
    ]);
    return () => {
      // The sequence still guards the currency: a record change that raced
      // this load owns the newer sequence and must win.
      if (currency && sequence === this.currencySequence) {
        this.resolvedCurrencySymbol = currency.symbol;
        this.resolvedCurrencyPrecision = currency.precision;
      }
      if (orgPrecision !== undefined) {
        this.resolvedOrgPrecision = orgPrecision;
      }
    };
  }

  private async loadCurrency(transactionCurrencyId: string): Promise<void> {
    const sequence = ++this.currencySequence;
    try {
      const info = await this.vmContext.metadata.getCurrencySymbol(transactionCurrencyId);
      if (!this.isDisposed && sequence === this.currencySequence) {
        this.resolvedCurrencySymbol = info.symbol;
        this.resolvedCurrencyPrecision = info.precision;
        this.forceUpdate();
      }
    } catch {
      // Non-fatal: fall back to the supplied/default symbol.
    }
  }

  /**
   * Resolves the money precision the platform would use. PrecisionSource 1
   * means the record currency's precision applies (it rides in on
   * getCurrencySymbol); source 2 means the ORG pricing precision
   * (organization.pricingdecimalprecision, fetched once); source 0 and every
   * unresolved case fall back to the attribute precision.
   */
  private moneyPrecision(metadata: IAttributeMetadata): number {
    const source = attributePrecisionSource(metadata);
    if (source === 1 && this.resolvedCurrencyPrecision !== undefined) {
      return this.resolvedCurrencyPrecision;
    }
    if (source === 2 && this.resolvedOrgPrecision !== undefined) {
      return this.resolvedOrgPrecision;
    }
    return attributePrecision(metadata) ?? 2;
  }

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const formatting = this.state.formatting;
    const kind = attributeKind(metadata);
    const common = {
      label: this.resolveLabel(metadata),
      required: this.resolveRequired(metadata),
      disabled: this.props.disabled,
      readOnly: this.resolveReadOnly(metadata),
      hint: this.resolveHint(metadata),
      labelPosition: this.props.labelPosition,
      errorMessage: this.props.errorMessage,
      value: this.props.value,
      onChange: this.commitChange,
      min: attributeMinValue(metadata),
      max: attributeMaxValue(metadata),
      decimalSymbol: formatting?.decimalSymbol,
      groupSeparator: formatting?.numberSeparator,
    };
    if (kind === "money") {
      return (
        <CurrencyField
          {...common}
          currencySymbol={this.props.currencySymbol ?? this.resolvedCurrencySymbol}
          currencyFormatCode={formatting?.currencyFormatCode}
          precision={this.moneyPrecision(metadata)}
        />
      );
    }
    const precision = kind === "integer" ? 0 : attributePrecision(metadata);
    return <NumberField {...common} precision={precision} />;
  }
}
