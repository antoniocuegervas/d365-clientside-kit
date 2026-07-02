import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { pcfProviderProps } from "../../../shared/theme/d365Theme";
import { Observable } from "../../../shared/reactivity/Observable";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { hostEntity } from "../../../shared/context/pcfHostReads";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
import { TooltipApp } from "./App";

/**
 * Sample PCF, PATTERN 2: smart component + ViewModelContextProvider.
 *
 * The root wraps the ComponentFramework context in PCFContext once, provides
 * it through ViewModelContextProvider, and the smart TooltipApp fetches
 * attribute metadata through the SAME IViewModelContext contract used by
 * webresources and client hooks.
 *
 * This is a virtual control: the platform hands it the host's own React
 * and Fluent at runtime and owns the React root. updateView RETURNS the
 * element instead of rendering into a container.
 */
export class KitTooltip implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: (() => void) | undefined;
  private kitContext: PCFContext | undefined;

  private readonly value = new Observable<string | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    // One PCFContext for the control lifetime.
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.value.value = context.parameters.value.raw ?? null;

    // The hosting table's logical name, via the shared host read (which also
    // covers the older page fallback the inline read here used to skip).
    const entityLogicalName = hostEntity(context) ?? "";
    const attributeLogicalName = context.parameters.value.attributes?.LogicalName ?? "";

    return React.createElement(
      FluentProvider,
      // Shared root props: the platform theme when the new look serves one,
      // and the full-width style the platform's flex mount point requires.
      pcfProviderProps(context),
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(
          ViewModelContextProvider,
          // init always runs before the first updateView, so the context exists.
          { context: this.kitContext as PCFContext },
          React.createElement(TooltipApp, {
            entityLogicalName,
            attributeLogicalName,
            value: this.value,
            disabled: context.mode.isControlDisabled,
            onChange: (next: string | null) => {
              this.value.value = next;
              this.notifyOutputChanged?.();
            },
          })
        )
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
