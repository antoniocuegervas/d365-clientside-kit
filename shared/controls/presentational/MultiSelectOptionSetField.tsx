import * as React from "react";
import { Dropdown, Option } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import type { IOptionItem } from "../../utils/EntityModel";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IMultiSelectOptionSetFieldProps extends ICommonFieldProps {
  options: OrObservable<IOptionItem[]>;
  /** Host-owned selection. */
  selectedValues: Observable<number[]>;
  onChange?: (values: number[]) => void;
  placeholder?: string;
}

/** Multi-select option set matching the multi-choice field. */
export class MultiSelectOptionSetField extends ObserverComponent<IMultiSelectOptionSetFieldProps> {
  constructor(props: IMultiSelectOptionSetFieldProps) {
    super(props);
    this.observe(props.options, props.selectedValues, props.errorMessage);
  }

  private readonly handleSelect = (
    _event: unknown,
    data: { selectedOptions: string[] }
  ): void => {
    this.props.onChange?.(data.selectedOptions.map(Number).filter((n) => !Number.isNaN(n)));
  };

  override render(): React.ReactNode {
    const { selectedValues, disabled, readOnly, placeholder } = this.props;
    const options = valueOf(this.props.options);
    const selected = selectedValues.value;
    const display = options
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
      .join(", ");

    return (
      <FieldShell {...this.props}>
        <Dropdown
          multiselect
          // Fill the field like the Input/Lookup/Date controls, so every control
          // in a form section lines up at the same width (native UCI).
          style={{ width: "100%" }}
          value={display}
          selectedOptions={selected.map(String)}
          onOptionSelect={this.handleSelect}
          disabled={disabled || readOnly}
          placeholder={placeholder ?? "---"}
        >
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
