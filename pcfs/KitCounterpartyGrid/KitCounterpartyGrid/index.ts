import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { resolvePcfTheme } from "../../../shared/theme/d365Theme";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
import { normalizeGuid, type IXrmLookupValue } from "../../../shared/utils/EntityModel";
import { CounterpartyGridApp } from "./App";

/**
 * KitCounterpartyGrid root, a virtual dataset control: the platform hands it
 * the host's own React and Fluent at runtime and owns the React root
 * (updateView RETURNS the element). With the platform providing Fluent there
 * is exactly one focus-management instance on the page, the host's, so the
 * grid's popovers cannot hit the shared-instance version skew a bundled
 * Fluent risked. One PCFContext is built in init and reused, the same
 * IViewModelContext the webresource and form-script hosts use, so the
 * control's data access is identical to the rest of the kit.
 */
export class KitCounterpartyGrid
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  private kitContext: PCFContext | undefined;

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    return React.createElement(
      FluentProvider,
      // The platform mounts a virtual control's tree inside a flex container,
      // where a plain div shrinks to its content. The grid measures its own
      // width to pick the table or the card layout, so the root must stretch
      // to the space the subgrid actually has.
      // The platform theme (fluentDesignLanguage.tokenTheme) wins when the new
      // look serves one; the kit default covers the rest.
      { theme: resolvePcfTheme(context), style: { width: "100%" } },
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(
          ViewModelContextProvider,
          // init always runs before the first updateView, so the context exists.
          { context: this.kitContext as PCFContext },
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
    // The platform owns the React root for a virtual control.
  }
}

/**
 * The host form's record (the account the subgrid sits on), so new activities
 * are filed against it. Neither source is documented: `mode.contextInfo` is
 * undocumented but stable (absent from the published Mode interface, hence
 * the cast) and `page` is the older equally-undocumented fallback. Returns
 * undefined off a record form, or if the platform ever removes both.
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
