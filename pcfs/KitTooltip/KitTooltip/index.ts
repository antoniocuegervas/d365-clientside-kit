import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../../../shared/theme/d365Theme";
import { Observable } from "../../../shared/reactivity/Observable";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
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
 */
export class KitTooltip implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root: Root | undefined;
  private notifyOutputChanged: (() => void) | undefined;
  private kitContext: PCFContext | undefined;

  private readonly value = new Observable<string | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    // One PCFContext for the control lifetime.
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
    this.root = createRoot(container);
    this.render(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.render(context);
  }

  private render(context: ComponentFramework.Context<IInputs>): void {
    if (!this.kitContext) {
      return;
    }
    this.value.value = context.parameters.value.raw ?? null;

    // contextInfo carries the hosting table's logical name on field controls.
    const contextInfo = (
      context.mode as unknown as { contextInfo?: { entityTypeName?: string } }
    ).contextInfo;
    const entityLogicalName = contextInfo?.entityTypeName ?? "";
    const attributeLogicalName = context.parameters.value.attributes?.LogicalName ?? "";

    this.root?.render(
      React.createElement(
        FluentProvider,
        { theme: d365Theme },
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(
            ViewModelContextProvider,
            { context: this.kitContext },
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
