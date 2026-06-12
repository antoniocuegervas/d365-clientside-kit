import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../../../shared/theme/d365Theme";
import { Observable } from "../../../shared/reactivity/Observable";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";

/**
 * Sample PCF, smart-via-root datepicker: the PCF root resolves
 * LOCALE-correct formatting and date-vs-datetime behavior from the PCF
 * context, then drives the presentational DateTimeField. The field itself
 * never learns where the format came from.
 */
export class KitDatePicker implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root: Root | undefined;
  private notifyOutputChanged: (() => void) | undefined;

  private readonly value = new Observable<Date | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.root = createRoot(container);
    this.render(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.render(context);
  }

  private render(context: ComponentFramework.Context<IInputs>): void {
    this.value.value = context.parameters.value.raw ?? null;
    const format = context.parameters.value.attributes?.Format;
    const includeTime = format === "datetime";

    this.root?.render(
      React.createElement(
        FluentProvider,
        { theme: d365Theme },
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
    this.root?.unmount();
  }
}
