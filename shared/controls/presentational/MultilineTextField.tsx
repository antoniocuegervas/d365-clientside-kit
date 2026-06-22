import * as React from "react";
import { Textarea } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IMultilineTextFieldProps extends ICommonFieldProps {
  value: Observable<string | null>;
  onChange?: (value: string | null) => void;
  maxLength?: number;
  placeholder?: string;
  /** Visible text rows. Default 3, matching compact UCI multiline fields. */
  rows?: number;
}

/** Multiline text matching the standard memo field. */
export class MultilineTextField extends ObserverComponent<IMultilineTextFieldProps> {
  constructor(props: IMultilineTextFieldProps) {
    super(props);
    this.observe(props.value, props.errorMessage);
  }

  private readonly handleChange = (
    _event: React.ChangeEvent<HTMLTextAreaElement>,
    data: { value: string }
  ): void => {
    this.props.onChange?.(data.value === "" ? null : data.value);
  };

  override render(): React.ReactNode {
    const { value, disabled, readOnly, maxLength, placeholder, rows } = this.props;
    return (
      <FieldShell {...this.props} readOnlyText={value.value ?? ""}>
        <Textarea
          value={value.value ?? ""}
          onChange={this.handleChange}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          placeholder={readOnly ? undefined : placeholder ?? "---"}
          rows={rows ?? 3}
          resize="vertical"
        />
      </FieldShell>
    );
  }
}
