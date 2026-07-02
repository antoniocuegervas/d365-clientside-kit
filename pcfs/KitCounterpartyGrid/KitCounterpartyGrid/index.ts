import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider, SearchBox } from "@fluentui/react-components";
import { kitStrings } from "../../../shared/localization/kitStrings";
import { pcfProviderProps } from "../../../shared/theme/d365Theme";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { hostRecord } from "../../../shared/context/pcfHostReads";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
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
    // Runtime floor probe. The manifest declares Fluent 9.46.2 (the highest
    // version an import may declare), but the grid's search bar needs the
    // SearchBox export that first ships in platform Fluent 9.61, which current
    // waves serve. An org trailing that wave (sovereign clouds trail the
    // commercial one) would import this solution cleanly and then break at
    // first render, so state the requirement readably instead. The required
    // export is named in platform-floor.json; keep the two in step.
    if (typeof SearchBox === "undefined") {
      return React.createElement(
        "div",
        // Plain element on purpose: the message must render on exactly the
        // hosts whose Fluent delivery falls short.
        { role: "alert", style: { padding: "8px", fontFamily: "Segoe UI, sans-serif" } },
        kitStrings().platformWaveTooOld
      );
    }
    return React.createElement(
      FluentProvider,
      // Shared root props (theme + the full-width style the platform's flex
      // mount point requires). The width matters doubly here: the grid
      // measures its own width to pick the table or the card layout, so the
      // root must stretch to the space the subgrid actually has.
      pcfProviderProps(context),
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
