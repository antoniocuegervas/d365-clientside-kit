import * as React from "react";
import { Dropdown, Option } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import type { IOptionItem } from "../../utils/EntityModel";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IOptionSetFieldProps extends ICommonFieldProps {
  /**
   * Available options, host-owned (the host owns the option list). Smart wrappers
   * populate this after metadata loads; stories pass fixture arrays.
   */
  options: OrObservable<IOptionItem[]>;
  /** Host-owned selected value. */
  selectedValue: Observable<number | null>;
  onChange?: (value: number | null) => void;
  /** Label for the clear choice. Default "---" like UCI. */
  blankLabel?: string;
  placeholder?: string;
}

const BLANK = "__blank__";

/** Single-select option set matching the standard choice field. */
export class OptionSetField extends ObserverComponent<IOptionSetFieldProps> {
  constructor(props: IOptionSetFieldProps) {
    super(props);
    this.observe(props.options, props.selectedValue, props.errorMessage);
  }

  private readonly handleSelect = (
    _event: unknown,
    data: { optionValue?: string }
  ): void => {
    if (data.optionValue === undefined) {
      return;
    }
    this.props.onChange?.(data.optionValue === BLANK ? null : Number(data.optionValue));
  };

  override render(): React.ReactNode {
    const { selectedValue, disabled, readOnly, blankLabel, placeholder } = this.props;
    const options = valueOf(this.props.options);
    const current = selectedValue.value;
    const currentLabel =
      current === null ? "" : options.find((o) => o.value === current)?.label ?? String(current);

    return (
      <FieldShell {...this.props} readOnlyText={currentLabel}>
        <Dropdown
          // Fill the field like the Input/Lookup/Date controls, so every control
          // in a form section lines up at the same width (native UCI).
          style={{ width: "100%" }}
          value={currentLabel}
          selectedOptions={current === null ? [] : [String(current)]}
          onOptionSelect={this.handleSelect}
          disabled={disabled || readOnly}
          placeholder={placeholder ?? "---"}
        >
          <Option key={BLANK} value={BLANK} text={blankLabel ?? "---"}>
            {blankLabel ?? "---"}
          </Option>
          {options.map((option) => (
            <Option key={option.value} value={String(option.value)} text={option.label}>
              {option.label}
            </Option>
          ))}
        </Dropdown>
      </FieldShell>
    );
  }
}
