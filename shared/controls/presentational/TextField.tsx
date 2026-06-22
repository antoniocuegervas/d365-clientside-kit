import * as React from "react";
import { Input } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface ITextFieldProps extends ICommonFieldProps {
  /** Host-owned value. The control renders it and raises onChange. */
  value: Observable<string | null>;
  onChange?: (value: string | null) => void;
  maxLength?: number;
  placeholder?: string;
}

/** Single-line text matching the standard text field. */
export class TextField extends ObserverComponent<ITextFieldProps> {
  constructor(props: ITextFieldProps) {
    super(props);
    this.observe(props.value, props.errorMessage);
  }

  private readonly handleChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ): void => {
    this.props.onChange?.(data.value === "" ? null : data.value);
  };

  override render(): React.ReactNode {
    const { value, disabled, readOnly, maxLength, placeholder } = this.props;
    return (
      <FieldShell {...this.props} readOnlyText={value.value ?? ""}>
        <Input
          value={value.value ?? ""}
          onChange={this.handleChange}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          placeholder={readOnly ? undefined : placeholder ?? "---"}
          appearance="outline"
        />
      </FieldShell>
    );
  }
}
