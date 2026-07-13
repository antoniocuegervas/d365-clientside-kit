import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { FluentProvider } from "@fluentui/react-components";
import { pcfProviderProps } from "../../../shared/theme/d365Theme";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { hostEntity, securedReadOnly } from "../../../shared/context/pcfHostReads";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { Observable } from "../../../shared/reactivity/Observable";
import type { IOptionItem } from "../../../shared/utils/EntityModel";

/**
 * KitOptionSet root: it renders the kit's SmartOptionSet over the bound choice
 * column so the option labels resolve from the entity metadata in the user's
 * language (the kit's metadata path serves the user-localized labels), instead
 * of from the bound parameter's own option list. The bound parameter's option
 * list stays the ALLOWED SET: an option the host does not carry is never
 * presented, so any host- or column-level filtering of the choices is honored.
 * It reuses one PCFContext (the same IViewModelContext the webresource and
 * form-script hosts use, which also resolves the kit chrome language in its
 * constructor), so metadata resolution is identical to the rest of the kit.
 *
 * The host entity comes from the form context (the shared `hostEntity` read,
 * see `shared/context/pcfHostReads.ts`), the bound column's logical name from
 * the documented bound-property surface
 * (`parameters.value.attributes.LogicalName`), and the platform's per-user
 * column security signal (`parameters.value.security`) drives the read-only
 * state.
 *
 * This is a virtual control: the platform hands it the host's own React and
 * Fluent at runtime and owns the React root. updateView RETURNS the element
 * instead of rendering into a container, so there is no createRoot, no root
 * field, and nothing to unmount in destroy.
 */
export class KitOptionSet implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private kitContext: PCFContext | undefined;
  private notifyOutputChanged: (() => void) | undefined;
  // Host-owned value bridging the bound choice column to the control. The
  // control writes the user's pick into it; getOutputs reads it back for the platform.
  private readonly selectedValue = new Observable<number | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary
  ): void {
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
    this.notifyOutputChanged = notifyOutputChanged;
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.selectedValue.value = context.parameters.value.raw ?? null;

    const entity = hostEntity(context);
    const attribute =
      (context.parameters.value.attributes as { LogicalName?: string } | undefined)?.LogicalName ??
      "";
    // The bound parameter's own option list is the allowed set: the metadata
    // options are filtered to these values so a choice the host does not offer
    // is never presented.
    const allowedValues = (context.parameters.value.attributes?.Options ?? []).map(
      (option) => option.Value
    );
    // Built once per updateView. Two constraints: the filter preserves metadata
    // order (the options stay in the order the metadata returns them), and an
    // empty host list means no filtering, so a harness or misconfigured host
    // that hands no options never blanks the control.
    const allowed = new Set(allowedValues);

    const field =
      !entity || !attribute
        ? React.createElement(
            "div",
            null,
            "Set the choice column binding on the control to render the option set."
          )
        : React.createElement(SmartOptionSet, {
            entity,
            attribute,
            value: this.selectedValue,
            disabled: context.mode.isControlDisabled,
            // Per-user column security from the host (parameters.value.security):
            // true forces read-only, false says the user can edit the secured
            // column, undefined (not secured) leaves the shared metadata default
            // in charge.
            readOnly: securedReadOnly(context.parameters.value),
            onChange: (value: number | null) => {
              this.selectedValue.value = value;
              this.notifyOutputChanged?.();
            },
            // Suppress the control's own label: the form field already renders it.
            label: "",
            filterOptions:
              allowedValues.length > 0
                ? (options: IOptionItem[]) =>
                    options.filter((option) => allowed.has(option.value))
                : undefined,
          });

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
          field
        )
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
