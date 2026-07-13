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
  /**
   * Parses typed text back into a Date using the user's date pattern. Without it
   * the picker falls back to the browser's m/d/y parsing, which misreads a value
   * typed in a d/m/y locale. The smart tier supplies this from user settings.
   */
  parseDate?: (value: string) => Date;
  /** Localized calendar strings (month/day names), smart tier supplies from metadata. */
  strings?: DatePickerProps["strings"];
  /** First day of the week (0 = Sunday). Smart tier supplies from user settings. */
  firstDayOfWeek?: DatePickerProps["firstDayOfWeek"];
  /**
   * Clock the time renders in ('h11'|'h12'|'h23'|'h24'), passed to the time
   * picker and used to format the time text. The smart tier sets this from the
   * user's time pattern. Undefined lets the browser locale decide (12h vs 24h).
   */
  hourCycle?: "h11" | "h12" | "h23" | "h24";
  placeholder?: string;
}

const useStyles = makeStyles({
  // The time picker has a wide intrinsic minimum, so on a narrow host the date
  // and time cannot sit side by side without forcing the container wider than
  // its host (a horizontal scroll). The row wraps instead, dropping the time
  // picker onto its own line below the date. A host with room keeps both on one
  // line unchanged (wrap engages only when the pair overflows).
  row: { display: "flex", columnGap: tokens.spacingHorizontalS, flexWrap: "wrap", rowGap: tokens.spacingVerticalS },
  date: { flexGrow: 1, flexBasis: "220px" },
  time: { flexBasis: "220px" },
  // The compat DatePicker has its own intrinsic width, so it must be told to
  // fill its flex-grow wrapper, matching the full-width Input/Dropdown fields.
  fill: { width: "100%" },
});

/**
 * Date / date-time field using the official Fluent v9 compat pickers (the
 * sanctioned exception where v9 has no native equivalent).
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
  // Anchor for the time list's overlay. By default it would mount at the end
  // of the document, outside the themed FluentProvider, and in an embedded
  // host (a PCF on a form) the theme's CSS variables are undefined out there,
  // leaving the list transparent. Mounting it here keeps it inside the themed
  // part of the page; Fluent still floats it beside the field.
  const [overlayHome, setOverlayHome] = React.useState<HTMLDivElement | null>(null);
  const { value, disabled, readOnly, includeTime, formatDate, parseDate, strings, firstDayOfWeek, hourCycle, placeholder } =
    props;
  const current = value.value;
  const formatForDisplay = formatDate ?? defaultFormatDate;
  // When the user's time pattern fixes the clock (hourCycle from the smart
  // tier), honor it in both the read-only text and the picker value; undefined
  // lets the browser locale decide, exactly as before.
  const formatTime = (date: Date): string =>
    hourCycle ? formatDateToTimeString(date, { hourCycle }) : formatDateToTimeString(date);
  const readOnlyText = current
    ? `${formatForDisplay(current)}${includeTime ? ` ${formatTime(current)}` : ""}`
    : "";
  return (
    <FieldShell {...props} readOnlyText={readOnlyText}>
      <div className={styles.row}>
        <div className={styles.date}>
          <DatePicker
            className={styles.fill}
            value={current}
            onSelectDate={props.onDateSelect}
            formatDate={(date) => (date ? formatForDisplay(date) : "")}
            parseDateFromString={parseDate}
            strings={strings}
            firstDayOfWeek={firstDayOfWeek}
            disabled={disabled || readOnly}
            placeholder={readOnly ? undefined : placeholder ?? "---"}
            allowTextInput
            // Render the calendar in place rather than in a portal. A portal
            // mounts outside the themed FluentProvider, and in an embedded host
            // (a PCF on a form) the theme's CSS variables are undefined out
            // there, leaving the surface transparent. In place it inherits
            // them, and Fluent positions the surface fixed, so an overflow
            // ancestor never clips it (the native lookup flyout does the same).
            inlinePopup
          />
        </div>
        {includeTime ? (
          <div className={styles.time}>
            <TimePicker
              selectedTime={current}
              value={current ? formatTime(current) : ""}
              onTimeChange={props.onTimeChange}
              hourCycle={hourCycle}
              disabled={disabled || readOnly || !current}
              mountNode={overlayHome ?? undefined}
            />
            <div ref={setOverlayHome} />
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
};

function defaultFormatDate(date: Date): string {
  return date.toLocaleDateString();
}
