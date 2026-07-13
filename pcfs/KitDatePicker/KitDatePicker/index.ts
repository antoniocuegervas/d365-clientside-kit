import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { pcfProviderProps } from "../../../shared/theme/d365Theme";
import { securedReadOnly } from "../../../shared/context/pcfHostReads";
import { normalizeDateFormatInfo } from "../../../shared/context/hostSurface";
import { setKitStringsLanguage } from "../../../shared/localization/kitStrings";
import {
  buildDatePickerStrings,
  makeParseDate,
  toFirstDayOfWeek,
  toHourCycle,
} from "../../../shared/controls/smart/localeDateFormatting";
import { Observable } from "../../../shared/reactivity/Observable";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";

/**
 * Sample PCF, smart-via-root datepicker: the PCF root resolves the
 * LOCALE-correct behavior from the PCF context and drives the presentational
 * DateTimeField with it: the display format, the calendar month and day names,
 * the first day of the week, typed-date parsing, the clock (12 or 24 hour), and
 * the kit chrome language. The field itself never learns where any of it came
 * from.
 *
 * This is a virtual control: the platform hands it the host's own React
 * and Fluent at runtime and owns the React root. updateView RETURNS the
 * element instead of rendering into a container. The date and time picker
 * compat packages are the one exception to "nothing bundled": the platform
 * Fluent library does not carry them, so they ride in the bundle (see
 * webpack.config.js).
 */
export class KitDatePicker implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: (() => void) | undefined;

  private readonly value = new Observable<Date | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    // The kit chrome follows the user language. This root builds no kit context
    // (the context adapters resolve the language at construction, there is none
    // here), so it resolves the language itself.
    if (context.userSettings.languageId !== undefined) {
      setKitStringsLanguage(context.userSettings.languageId);
    }
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.value.value = context.parameters.value.raw ?? null;
    const format = context.parameters.value.attributes?.Format;
    const includeTime = format === "datetime";
    // Normalize the host date-format object once per paint. The PCF host serves
    // camelCase members; the helper reads both casings and returns undefined
    // when nothing usable is present, in which case the locale props below fall
    // back to the picker's own defaults.
    const info = normalizeDateFormatInfo(
      context.userSettings.dateFormattingInfo as unknown as Record<string, unknown>
    );

    return React.createElement(
      FluentProvider,
      // Shared root props: the platform theme when the new look serves one,
      // and the full-width style the platform's flex mount point requires.
      pcfProviderProps(context),
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(DateTimeField, {
          value: this.value,
          includeTime,
          disabled: context.mode.isControlDisabled,
          // Per-user column security: a user without write access to a secured
          // column gets the read-only rendering, not an editable field that
          // fails at save.
          readOnly: securedReadOnly(context.parameters.value),
          // Locale via context. The host's short-date formatter stays the
          // display authority; the calendar names, first day of week, typed-date
          // parsing, and the clock ride the normalized dateFormattingInfo, so the
          // calendar agrees with the native picker beside it.
          formatDate: (date: Date) => context.formatting.formatDateShort(date),
          strings: info ? buildDatePickerStrings(info) : undefined,
          firstDayOfWeek: info ? toFirstDayOfWeek(info) : undefined,
          parseDate: info ? makeParseDate(info) : undefined,
          hourCycle: toHourCycle(info?.shortTimePattern),
          onChange: (next: Date | null) => {
            this.value.value = next;
            this.notifyOutputChanged?.();
          },
        })
      )
    );
  }

  public getOutputs(): IOutputs {
    return { value: this.value.value ?? undefined };
  }

  public destroy(): void {
    // The platform owns the React root for a virtual control.
  }
}
