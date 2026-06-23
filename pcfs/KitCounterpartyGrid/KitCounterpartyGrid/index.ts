import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../../../shared/theme/d365Theme";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { normalizeGuid, type IXrmLookupValue } from "../../../shared/utils/EntityModel";
import { CounterpartyGridApp } from "./App";

/**
 * KitCounterpartyGrid root, a standard control that BUNDLES React 18 + Fluent v9 (a virtual
 * control renders blank against the platform's own Fluent, as the kit's other PCFs
 * found, so bundling is the working path). The bundled Fluent is pinned to the
 * host platform-library version (see package.json) so the single tabster instance
 * the form shares on the window stays compatible: a newer bundled tabster augments
 * that instance with a shape it lacks and crashes the control. One PCFContext is
 * built in init and reused, the same IViewModelContext the webresource and
 * form-script hosts use, so the control's data access is identical to the rest of
 * the kit.
 */
export class KitCounterpartyGrid
  implements ComponentFramework.StandardControl<IInputs, IOutputs>
{
  private root: Root | undefined;
  private kitContext: PCFContext | undefined;

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
    this.root = createRoot(container);
    this.render(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.render(context);
  }

  private render(context: ComponentFramework.Context<IInputs>): void {
    if (!this.kitContext || !this.root) {
      return;
    }
    this.root.render(
      React.createElement(
        FluentProvider,
        { theme: d365Theme },
        React.createElement(
          ViewModelContextProvider,
          { context: this.kitContext },
          React.createElement(CounterpartyGridApp, {
            dataset: context.parameters.activities,
            host: hostRecord(context),
          })
        )
      )
    );
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    this.root?.unmount();
  }
}

/**
 * The host form's record (the account the subgrid sits on), so new activities are
 * filed against it. `contextInfo` is the documented source; `page` is the older
 * fallback. Returns undefined off a record form.
 */
function hostRecord(context: ComponentFramework.Context<IInputs>): IXrmLookupValue | undefined {
  const mode = context.mode as unknown as {
    contextInfo?: { entityId?: string; entityTypeName?: string; entityRecordName?: string };
  };
  const page = (context as unknown as {
    page?: { entityId?: string; entityTypeName?: string };
  }).page;
  const id = mode.contextInfo?.entityId ?? page?.entityId;
  const entityType = mode.contextInfo?.entityTypeName ?? page?.entityTypeName;
  if (!id || !entityType) {
    return undefined;
  }
  return { id: normalizeGuid(id), entityType, name: mode.contextInfo?.entityRecordName ?? "" };
}
