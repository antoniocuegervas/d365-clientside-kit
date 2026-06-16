import * as React from "react";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { DateTimeField } from "../presentational/DateTimeField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";
import {
  buildDatePickerStrings,
  makeFormatDate,
  toFirstDayOfWeek,
} from "./localeDateFormatting";

export type ISmartDatePickerProps = ISmartFieldProps<Date | null>;

/**
 * Date block, date-only vs date-and-time resolves from attribute metadata;
 * localized calendar strings, first day of week, and display format follow the
 * user's locale (G-06). The smart tier reads the formatting from context
 * and supplies it as plain presentational props.
 */
export class SmartDatePicker extends SmartFieldBase<Date | null, ISmartDatePickerProps> {
  protected override usesFormatting(): boolean {
    return true;
  }

  protected renderField(metadata: IAttributeMetadata): React.ReactNode {
    const dateFormatInfo = this.state.formatting?.dateFormatInfo;
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
        strings={dateFormatInfo ? buildDatePickerStrings(dateFormatInfo) : undefined}
        firstDayOfWeek={dateFormatInfo ? toFirstDayOfWeek(dateFormatInfo) : undefined}
        formatDate={dateFormatInfo ? makeFormatDate(dateFormatInfo) : undefined}
      />
    );
  }
}
