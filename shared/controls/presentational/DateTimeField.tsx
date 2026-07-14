import * as React from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { DatePicker, type DatePickerProps } from "@fluentui/react-datepicker-compat";
import { TimePicker, formatDateToTimeString } from "@fluentui/react-timepicker-compat";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";
import { FieldShell } from "./FieldShell";
import { MeasuredWidth } from "./MeasuredWidth";
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

// Below this container width the date cannot stay readable beside the time's
// compact floor, so the date and time stack onto their own full-width lines.
export const DATE_TIME_STACK_BELOW_PX = 340;
export function dateTimeStacked(containerWidth: number, includeTime: boolean): boolean {
  return includeTime && containerWidth > 0 && containerWidth < DATE_TIME_STACK_BELOW_PX;
}

const useStyles = makeStyles({
  row: {
    display: "flex",
    flexDirection: "row",
    columnGap: tokens.spacingHorizontalS,
    // Safety net only: MeasuredWidth stacks before this matters, but if a host
    // has no ResizeObserver the row still wraps rather than overflowing.
    flexWrap: "wrap",
    rowGap: tokens.spacingVerticalS,
  },
  // Stacked: one field per full-width line, so the time fills its own line.
  rowStacked: { flexDirection: "column", flexWrap: "nowrap" },
  // Side by side: the date takes the remaining width beside the compact time.
  dateInline: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  // Side by side: the time keeps its own compact width.
  timeInline: { flexShrink: 0, minWidth: 0 },
  // Stacked: the field fills the line.
  itemStacked: { width: "100%", minWidth: 0 },
  // The compat DatePicker has its own intrinsic width, so it must fill its wrapper.
  fill: { width: "100%", minWidth: 0 },
  // The compat TimePicker is a Combobox: an inline-grid with a min-content input
  // column and a wide default min-width, so by default it will neither fill a
  // wide line nor shrink to share a narrow one. Making it a block grid whose
  // input column is minmax(0, 1fr), with the min-widths relaxed down through the
  // inner input, lets it fill its wrapper when stacked and stay compact when
  // beside the date.
  timeField: {
    display: "grid",
    width: "100%",
    minWidth: 0,
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    "& input": { minWidth: 0 },
  },
  // The open time list is a popup. Mounted inside the themed form tree (see
  // mountNode below), it inherits the default stacking, so on a narrow form the
  // timeline pane and later fields paint over it. Lift it above the form and cap
  // its height so a long list stays on screen instead of running off the bottom.
  timeListbox: { zIndex: 1000, maxHeight: "40vh" },
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
    if (!data.selectedTime) {
      return;
    }
    // Picking a time with no date sets today, so the time is always editable
    // like the native control.
    const base = this.props.value.value ?? new Date();
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
  const datePicker = (
    <DatePicker
      className={styles.fill}
      // filled-darker matches the model-driven New Look field styling (measured live).
      appearance="filled-darker"
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
  );
  return (
    <FieldShell {...props} readOnlyText={readOnlyText}>
      {includeTime ? (
        <MeasuredWidth>
          {(width) => {
            const stacked = dateTimeStacked(width, true);
            return (
              <div className={mergeClasses(styles.row, stacked && styles.rowStacked)}>
                <div className={stacked ? styles.itemStacked : styles.dateInline}>{datePicker}</div>
                <div className={stacked ? styles.itemStacked : styles.timeInline}>
                  <TimePicker
                    className={styles.timeField}
                    // filled-darker matches the model-driven New Look field styling (measured live).
                    appearance="filled-darker"
                    selectedTime={current}
                    value={current ? formatTime(current) : ""}
                    onTimeChange={props.onTimeChange}
                    hourCycle={hourCycle}
                    disabled={disabled || readOnly}
                    // Anchor the list under the field at the field width (without
                    // this the list mis-anchors on a narrow form host), and give it
                    // the elevated, height-capped listbox so it overlays the form.
                    positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
                    listbox={{ className: styles.timeListbox }}
                    mountNode={overlayHome ?? undefined}
                  />
                  <div ref={setOverlayHome} />
                </div>
              </div>
            );
          }}
        </MeasuredWidth>
      ) : (
        <div className={styles.row}>
          <div className={styles.dateInline}>{datePicker}</div>
        </div>
      )}
    </FieldShell>
  );
};

function defaultFormatDate(date: Date): string {
  return date.toLocaleDateString();
}
