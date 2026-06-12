import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { DateTimeField } from "../presentational/DateTimeField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";

export type ISmartDatePickerProps = ISmartFieldProps<Date | null>;

/**
 * Date block, date-only vs date-and-time resolves from attribute metadata,
 * display format follows the user's locale.
 */
export class SmartDatePicker extends SmartFieldBase<Date | null, ISmartDatePickerProps> {
  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    return (
      <DateTimeField
        label={this.resolveLabel(metadata)}
        required={this.resolveRequired(metadata)}
        disabled={this.props.disabled}
        readOnly={this.props.readOnly}
        errorMessage={this.props.errorMessage}
        value={this.props.value}
        onChange={this.commitChange}
        includeTime={metadata.kind === "datetime"}
      />
    );
  }
}
