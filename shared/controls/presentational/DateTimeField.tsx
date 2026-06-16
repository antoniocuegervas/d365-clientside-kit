import * as React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { DatePicker, type DatePickerProps } from "@fluentui/react-datepicker-compat";
import { TimePicker, formatDateToTimeString } from "@fluentui/react-timepicker-compat";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import type { ICommonFieldProps } from "./fieldProps";

export interface IDateTimeFieldProps extends ICommonFieldProps {
  value: Observable<Date | null>;
  onChange?: (value: Date | null) => void;
  /** Show the time picker beside the date. Smart tier sets this from metadata. */
  includeTime?: boolean;
  /** Date display formatter, host supplies locale-correct formatting. */
  formatDate?: (date: Date) => string;
  /** Localized calendar strings (month/day names), smart tier supplies from metadata. */
  strings?: DatePickerProps["strings"];
  /** First day of the week (0 = Sunday). Smart tier supplies from user settings. */
  firstDayOfWeek?: DatePickerProps["firstDayOfWeek"];
  placeholder?: string;
}

const useStyles = makeStyles({
  row: { display: "flex", columnGap: tokens.spacingHorizontalS },
  date: { flexGrow: 1 },
  time: { width: "120px" },
});

/**
 * Date / date-time field using the official Fluent v9 compat pickers (* the sanctioned exception where v9 has no native equivalent).
 */
export class DateTimeField extends ObserverComponent<IDateTimeFieldProps> {
  constructor(props: IDateTimeFieldProps) {
    super(props);
    this.observe(props.value, props.errorMessage);
  }

  private readonly handleDateSelect = (date: Date | null | undefined): void => {
    const previous = this.props.value.value;
    if (!date) {
      this.props.onChange?.(null);
      return;
    }
    const next = new Date(date);
    if (this.props.includeTime && previous) {
      next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
    }
    this.props.onChange?.(next);
  };

  private readonly handleTimeChange = (
    _event: unknown,
    data: { selectedTime: Date | null | undefined }
  ): void => {
    const base = this.props.value.value;
    if (!data.selectedTime || !base) {
      return;
    }
    const next = new Date(base);
    next.setHours(data.selectedTime.getHours(), data.selectedTime.getMinutes(), 0, 0);
    this.props.onChange?.(next);
  };

  override render(): React.ReactNode {
    return <Body {...this.props} onDateSelect={this.handleDateSelect} onTimeChange={this.handleTimeChange} />;
  }
}

/** Function child only for makeStyles access, all state stays in the class. */
const Body: React.FC<
  IDateTimeFieldProps & {
    onDateSelect: (date: Date | null | undefined) => void;
    onTimeChange: (event: unknown, data: { selectedTime: Date | null | undefined }) => void;
  }
> = (props) => {
  const styles = useStyles();
  const { value, disabled, readOnly, includeTime, formatDate, strings, firstDayOfWeek, placeholder } =
    props;
  const current = value.value;
  return (
    <FieldShell {...props}>
      <div className={styles.row}>
        <div className={styles.date}>
          <DatePicker
            value={current}
            onSelectDate={props.onDateSelect}
            formatDate={(date) => (date ? (formatDate ?? defaultFormatDate)(date) : "")}
            strings={strings}
            firstDayOfWeek={firstDayOfWeek}
            disabled={disabled || readOnly}
            placeholder={readOnly ? undefined : placeholder ?? "---"}
            allowTextInput
          />
        </div>
        {includeTime ? (
          <div className={styles.time}>
            <TimePicker
              selectedTime={current}
              value={current ? formatDateToTimeString(current) : ""}
              onTimeChange={props.onTimeChange}
              disabled={disabled || readOnly || !current}
            />
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
};

function defaultFormatDate(date: Date): string {
  return date.toLocaleDateString();
}
