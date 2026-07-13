import * as React from "react";
import type { DatePickerProps } from "@fluentui/react-datepicker-compat";
import type { IAttributeMetadata } from "../../context/IViewModelContext";
import { attributeKind } from "../../metadata/attributeMetadataReads";
import { DateTimeField } from "../presentational/DateTimeField";
import { SmartFieldBase, type ISmartFieldProps } from "./SmartFieldBase";
import {
  buildDatePickerStrings,
  makeFormatDate,
  makeParseDate,
  toFirstDayOfWeek,
  toHourCycle,
} from "./localeDateFormatting";

export interface ISmartDatePickerProps extends ISmartFieldProps<Date | null> {
  /**
   * Override the first day of the calendar week (0 = Sunday ... 6 = Saturday).
   * Default follows the host's dateFormattingInfo, whose first day is the
   * ORG-level format setting (System Settings, Formats), not the user's
   * personal Format locale, so the kit calendar always agrees with the native
   * picker beside it. Pass this to follow a different convention per
   * deployment. See the gotcha.
   */
  firstDayOfWeek?: DatePickerProps["firstDayOfWeek"];
}

/**
 * Date / date-time field. Date-only vs date+time comes from the attribute; the
 * calendar strings, first day of week, and display format follow the user's
 * locale. `SmartFieldBase` loads the metadata and renders the loading/error state.
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
        readOnly={this.resolveReadOnly(metadata)}
        hint={this.resolveHint(metadata)}
        labelPosition={this.props.labelPosition}
        errorMessage={this.props.errorMessage}
        value={this.props.value}
        onChange={this.commitChange}
        includeTime={attributeKind(metadata) === "datetime"}
        hourCycle={toHourCycle(this.state.formatting?.timeFormat)}
        strings={dateFormatInfo ? buildDatePickerStrings(dateFormatInfo) : undefined}
        firstDayOfWeek={
          this.props.firstDayOfWeek ??
          (dateFormatInfo ? toFirstDayOfWeek(dateFormatInfo) : undefined)
        }
        formatDate={dateFormatInfo ? makeFormatDate(dateFormatInfo) : undefined}
        parseDate={dateFormatInfo ? makeParseDate(dateFormatInfo) : undefined}
      />
    );
  }
}
