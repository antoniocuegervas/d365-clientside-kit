import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { pcfProviderProps } from "../../../shared/theme/d365Theme";
import { securedReadOnly } from "../../../shared/context/pcfHostReads";
import { Observable } from "../../../shared/reactivity/Observable";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
import type { IOptionItem } from "../../../shared/utils/EntityModel";

/**
 * Sample PCF, PATTERN 1: presentational control via the PCF root.
 *
 * The root owns the Observables (it is the host), maps PCF parameters
 * into them on every updateView, and renders the CRM-agnostic
 * OptionSetField. No context provider, no metadata calls, the option list
 * comes straight from the bound column's PCF parameter attributes.
 *
 * This is a virtual control: the platform hands it the host's own React
 * and Fluent at runtime and owns the React root. updateView RETURNS the
 * element instead of rendering into a container, so there is no
 * createRoot, no root field, and nothing to unmount in destroy.
 */
export class KitOptionSet implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: (() => void) | undefined;

  // Host-owned observables bridging PCF properties to the control.
  private readonly options = new Observable<IOptionItem[]>([]);
  private readonly selectedValue = new Observable<number | null>(null);

  public init(
    _context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.options.value = (context.parameters.value.attributes?.Options ?? []).map((option) => ({
      value: option.Value,
      label: option.Label,
      color: option.Color,
    }));
    this.selectedValue.value = context.parameters.value.raw ?? null;

    return React.createElement(
      FluentProvider,
      // Shared root props: the platform theme when the new look serves one,
      // and the full-width style the platform's flex mount point requires.
      pcfProviderProps(context),
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(OptionSetField, {
          options: this.options,
          selectedValue: this.selectedValue,
          disabled: context.mode.isControlDisabled,
          // Per-user column security: a user without write access to a secured
          // column gets the read-only rendering, not an editable field that
          // fails at save.
          readOnly: securedReadOnly(context.parameters.value),
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
    // The platform owns the React root for a virtual control.
  }
}
