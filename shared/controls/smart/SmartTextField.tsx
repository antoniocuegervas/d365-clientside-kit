import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { MultilineTextField } from "../presentational/MultilineTextField";
import { TextField } from "../presentational/TextField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export interface ISmartTextFieldProps extends ISmartFieldProps<string | null> {
  /** Rows when the attribute is a memo. Default 3. */
  rows?: number;
}

/**
 * Text field resolved from metadata. Single-line vs memo and max length come
 * from the attribute. `SmartFieldBase` loads the metadata and renders the
 * loading/error state; this only maps it to the control.
 */
export class SmartTextField extends SmartFieldBase<string | null, ISmartTextFieldProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
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
      maxLength: metadata.maxLength,
    };
    return metadata.kind === "memo" ? (
      <MultilineTextField {...common} rows={this.props.rows} />
    ) : (
      <TextField {...common} />
    );
  }
}
