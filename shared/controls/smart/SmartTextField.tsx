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
 * `<SmartTextField entity="account" attribute="name" value={vm.name} />`
 * Resolves label, max length, and single/multiline from metadata.
 */
export class SmartTextField extends SmartFieldBase<string | null, ISmartTextFieldProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const common = {
      label: this.resolveLabel(metadata),
      required: this.resolveRequired(metadata),
      disabled: this.props.disabled,
      readOnly: this.props.readOnly,
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
