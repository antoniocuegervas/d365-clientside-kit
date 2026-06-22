import * as React from "react";
import { Switch } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IBooleanFieldProps extends ICommonFieldProps {
  value: Observable<boolean | null>;
  onChange?: (value: boolean) => void;
  /** Display labels, smart wrappers supply localized metadata labels. */
  trueLabel?: string;
  falseLabel?: string;
}

/** Two-option toggle matching the UCI yes/no field. */
export class BooleanField extends ObserverComponent<IBooleanFieldProps> {
  constructor(props: IBooleanFieldProps) {
    super(props);
    this.observe(props.value, props.errorMessage);
  }

  private readonly handleChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: { checked: boolean }
  ): void => {
    this.props.onChange?.(data.checked);
  };

  override render(): React.ReactNode {
    const { value, disabled, trueLabel, falseLabel } = this.props;
    const checked = value.value === true;
    const currentLabel = checked ? trueLabel ?? "Yes" : falseLabel ?? "No";
    // Read-only renders the label as flat text via FieldShell; null shows "---".
    const readOnlyText = value.value === null ? "" : currentLabel;
    return (
      <FieldShell {...this.props} readOnlyText={readOnlyText}>
        <Switch
          checked={checked}
          onChange={this.handleChange}
          disabled={disabled}
          label={currentLabel}
        />
      </FieldShell>
    );
  }
}
