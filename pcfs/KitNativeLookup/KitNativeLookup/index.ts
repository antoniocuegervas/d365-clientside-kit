import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { d365Theme } from "../../../shared/theme/d365Theme";
import { PCFContext, type IPcfContextLike } from "../../../shared/context/PCFContext";
import { ViewModelContextProvider } from "../../../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../../../shared/controls/presentational/ErrorBoundary";
import { Observable } from "../../../shared/reactivity/Observable";
import { normalizeGuid, type IEntityReference } from "../../../shared/utils/EntityModel";
import { NativeLookupApp } from "./App";

/**
 * KitNativeLookup root, a standard control that BUNDLES React 18 + Fluent v9 and
 * renders the kit's native-parity lookup (SmartNativeLookup) over a field-bound
 * lookup column. It reuses one PCFContext (the same IViewModelContext the
 * webresource and form-script hosts use), so the search, view, and metadata
 * resolution are identical to the rest of the kit. The bundled Fluent is pinned
 * to the host platform-library version (see package.json) so the single tabster
 * instance the form shares on the window stays compatible.
 *
 * A field-bound PCF does not expose its own attribute name, and the smart control
 * resolves the targets, lookup view, and icon from the entity + attribute
 * metadata, so the entity comes from the form (contextInfo) and the attribute
 * logical name is a maker-supplied property.
 */
export class KitNativeLookup implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root: Root | undefined;
  private kitContext: PCFContext | undefined;
  private notifyOutputChanged: (() => void) | undefined;
  // Host-owned value bridging the bound lookup column to the control. The control
  // writes the user's pick into it; getOutputs reads it back for the platform.
  private readonly value = new Observable<IEntityReference | null>(null);

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.kitContext = new PCFContext(context as unknown as IPcfContextLike);
    this.notifyOutputChanged = notifyOutputChanged;
    this.root = createRoot(container);
    this.syncValue(context);
    this.render(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.syncValue(context);
    this.render(context);
  }

  /**
   * Mirrors the bound lookup value into the observable, only when it actually
   * changed (compared by id + entity), so the host pushing a re-render never
   * re-triggers the control through a value it already holds.
   */
  private syncValue(context: ComponentFramework.Context<IInputs>): void {
    const raw = context.parameters.value.raw ?? [];
    const next: IEntityReference | null =
      raw.length > 0
        ? { id: normalizeGuid(raw[0].id), logicalName: raw[0].entityType, name: raw[0].name }
        : null;
    const current = this.value.value;
    const changed =
      (next?.id ?? null) !== (current?.id ?? null) ||
      (next?.logicalName ?? null) !== (current?.logicalName ?? null);
    if (changed) {
      this.value.value = next;
    }
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
          ErrorBoundary,
          null,
          React.createElement(
            ViewModelContextProvider,
            { context: this.kitContext },
            React.createElement(NativeLookupApp, {
              entity: hostEntity(context),
              attribute: context.parameters.attribute.raw ?? "",
              viewName: context.parameters.viewName.raw ?? undefined,
              showIcons: context.parameters.showIcons.raw === true,
              disabled: context.mode.isControlDisabled,
              value: this.value,
              // The control writes the value observable itself; reflect to the host.
              onChange: () => this.notifyOutputChanged?.(),
            })
          )
        )
      )
    );
  }

  public getOutputs(): IOutputs {
    const reference = this.value.value;
    return {
      value: reference
        ? [{ id: reference.id, name: reference.name ?? "", entityType: reference.logicalName }]
        : [],
    };
  }

  public destroy(): void {
    this.root?.unmount();
  }
}

/**
 * The host record's entity logical name (the form the control sits on), which
 * the smart control needs to resolve the bound lookup's metadata. `contextInfo`
 * is the documented source; `page` is the older fallback.
 */
function hostEntity(context: ComponentFramework.Context<IInputs>): string | undefined {
  const mode = context.mode as unknown as { contextInfo?: { entityTypeName?: string } };
  const page = (context as unknown as { page?: { entityTypeName?: string } }).page;
  return mode.contextInfo?.entityTypeName ?? page?.entityTypeName;
}
