import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { resolvePcfTheme } from "../../../shared/theme/d365Theme";
import { Observable } from "../../../shared/reactivity/Observable";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";

/**
 * Sample PCF, smart-via-root datepicker: the PCF root resolves
 * LOCALE-correct formatting and date-vs-datetime behavior from the PCF
 * context, then drives the presentational DateTimeField. The field itself
 * never learns where the format came from.
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
    _context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.value.value = context.parameters.value.raw ?? null;
    const format = context.parameters.value.attributes?.Format;
    const includeTime = format === "datetime";

    return React.createElement(
      FluentProvider,
      // The platform theme (fluentDesignLanguage.tokenTheme) wins when the new
      // look serves one; the kit default covers the rest.
      { theme: resolvePcfTheme(context) },
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(DateTimeField, {
          value: this.value,
          includeTime,
          disabled: context.mode.isControlDisabled,
          // Locale via context: the host's formatter, not a hardcoded format.
          formatDate: (date: Date) => context.formatting.formatDateShort(date),
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
