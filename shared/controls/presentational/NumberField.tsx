import * as React from "react";
import { Input } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface INumberFieldProps extends ICommonFieldProps {
  value: Observable<number | null>;
  onChange?: (value: number | null) => void;
  /** Decimal places shown when not editing. 0 = whole number. */
  precision?: number;
  min?: number;
  max?: number;
  /** Prefix glyph, e.g. a currency symbol, supplied, never resolved here. */
  prefix?: string;
  /** Decimal separator (CRM user setting). Default: browser-locale formatting. */
  decimalSymbol?: string;
  /** Group (thousands) separator (CRM user setting). Default: browser-locale formatting. */
  groupSeparator?: string;
}

interface INumberFieldState {
  /** Raw text while the user is typing; null = show the formatted value. */
  editingText: string | null;
}

/**
 * Numeric input (whole/decimal/float/currency base), displays a formatted
 * value at rest, switches to raw text during editing, commits on blur/Enter.
 */
export class NumberField extends ObserverComponent<INumberFieldProps, INumberFieldState> {
  constructor(props: INumberFieldProps) {
    super(props);
    this.state = { editingText: null };
    this.observe(props.value, props.errorMessage);
  }

  private format(value: number | null): string {
    if (value === null) {
      return "";
    }
    const { precision, decimalSymbol, groupSeparator } = this.props;
    // Default (no CRM separators supplied): browser-locale formatting, unchanged.
    if (decimalSymbol === undefined && groupSeparator === undefined) {
      return precision !== undefined
        ? value.toLocaleString(undefined, {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision,
          })
        : value.toLocaleString();
    }
    // CRM user-setting separators: format manually so the symbols match.
    const fixed = precision !== undefined ? value.toFixed(precision) : String(value);
    const negative = fixed.startsWith("-");
    const [intPart, fracPart] = (negative ? fixed.slice(1) : fixed).split(".");
    const grouped = groupSeparator
      ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator)
      : intPart;
    const sign = negative ? "-" : "";
    return fracPart !== undefined
      ? `${sign}${grouped}${decimalSymbol ?? "."}${fracPart}`
      : `${sign}${grouped}`;
  }

  private readonly handleChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ): void => {
    this.setState({ editingText: data.value });
  };

  private readonly handleFocus = (): void => {
    const current = this.props.value.value;
    this.setState({ editingText: current === null ? "" : String(current) });
  };

  private readonly handleBlur = (): void => {
    this.commit();
  };

  private readonly handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Enter") {
      this.commit();
    }
  };

  /** Strips group separators and maps the decimal symbol back to "." for parsing. */
  private normalizeInput(text: string): string {
    const { decimalSymbol, groupSeparator } = this.props;
    if (decimalSymbol === undefined && groupSeparator === undefined) {
      return text.replace(/,/g, ""); // default: treat comma as a group separator
    }
    let normalized = text;
    if (groupSeparator) {
      normalized = normalized.split(groupSeparator).join("");
    }
    if (decimalSymbol && decimalSymbol !== ".") {
      normalized = normalized.split(decimalSymbol).join(".");
    }
    return normalized;
  }

  private commit(): void {
    const { editingText } = this.state;
    if (editingText === null) {
      return;
    }
    this.setState({ editingText: null });
    const trimmed = this.normalizeInput(editingText.trim());
    if (trimmed === "") {
      this.props.onChange?.(null);
      return;
    }
    let parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return; // keep the previous value, UCI rejects bad numeric input silently
    }
    const { min, max, precision } = this.props;
    if (min !== undefined && parsed < min) {
      parsed = min;
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
    }
    if (precision !== undefined) {
      parsed = Number(parsed.toFixed(precision));
    }
    this.props.onChange?.(parsed);
  }

  override render(): React.ReactNode {
    const { value, disabled, readOnly, prefix } = this.props;
    const text = this.state.editingText ?? this.format(value.value);
    return (
      <FieldShell {...this.props}>
        <Input
          value={text}
          contentBefore={prefix ? <span>{prefix}</span> : undefined}
          onChange={this.handleChange}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          onKeyDown={this.handleKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : "---"}
          inputMode="decimal"
        />
      </FieldShell>
    );
  }
}
