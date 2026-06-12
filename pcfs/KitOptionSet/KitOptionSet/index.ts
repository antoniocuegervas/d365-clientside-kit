import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../../../shared/theme/d365Theme";
import { Observable } from "../../../shared/reactivity/Observable";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import type { IOptionItem } from "../../../shared/utils/EntityModel";

/**
 * Sample PCF, PATTERN 1: presentational control via the PCF root.
 *
 * The root owns the Observables (it is the host, section 4.2), maps PCF parameters
 * into them on every updateView, and renders the CRM-agnostic
 * OptionSetField. No context provider, no metadata calls, the option list
 * comes straight from the bound column's PCF parameter attributes.
 */
export class KitOptionSet implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root: Root | undefined;
  private notifyOutputChanged: (() => void) | undefined;

  // Host-owned observables bridging PCF properties to the control.
  private readonly options = new Observable<IOptionItem[]>([]);
  private readonly selectedValue = new Observable<number | null>(null);

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
    this.options.value = (context.parameters.value.attributes?.Options ?? []).map((option) => ({
      value: option.Value,
      label: option.Label,
      color: option.Color,
    }));
    this.selectedValue.value = context.parameters.value.raw ?? null;

    this.root?.render(
      React.createElement(
        FluentProvider,
        { theme: d365Theme },
        React.createElement(OptionSetField, {
          options: this.options,
          selectedValue: this.selectedValue,
          disabled: context.mode.isControlDisabled,
          onChange: (value: number | null) => {
            this.selectedValue.value = value;
            this.notifyOutputChanged?.();
          },
        })
      )
    );
  }

  public getOutputs(): IOutputs {
    return { value: this.selectedValue.value ?? undefined };
  }

  public destroy(): void {
    this.root?.unmount();
  }
}
