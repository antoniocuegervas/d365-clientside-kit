import * as React from "react";
import { ObserverComponent } from "../reactivity/ObserverComponent";
import type { IViewModelContext } from "./IViewModelContext";

/**
 * React bridge for IViewModelContext. Wrap app and PCF render trees:
 *
 *   <ViewModelContextProvider context={context}>
 *     <MyAppView viewModel={vm} />
 *   </ViewModelContextProvider>
 *
 * Class components consume it with the standard contextType pattern, or by
 * extending SmartComponent below. ViewModels usually receive the context via
 * constructor instead, both patterns coexist intentionally.
 */
export const ViewModelReactContext = React.createContext<IViewModelContext | undefined>(undefined);
ViewModelReactContext.displayName = "ViewModelContext";

export class ViewModelContextProvider extends React.Component<{
  context: IViewModelContext;
  children?: React.ReactNode;
}> {
  override render(): React.ReactNode {
    return (
      <ViewModelReactContext.Provider value={this.props.context}>
        {this.props.children}
      </ViewModelReactContext.Provider>
    );
  }
}

/**
 * Base class for metadata-aware ("smart") controls: ObserverComponent's
 * subscription safety plus typed access to the host context.
 *
 * Subclasses read `this.vmContext`, it throws a developer-readable error
 * when the control is rendered outside a ViewModelContextProvider.
 */
export abstract class SmartComponent<P = object, S = object> extends ObserverComponent<P, S> {
  static override contextType = ViewModelReactContext;
  declare context: IViewModelContext | undefined;

  protected get vmContext(): IViewModelContext {
    if (!this.context) {
      throw new Error(
        `${this.constructor.name} requires a ViewModelContextProvider above it in the tree. ` +
          "Wrap your app root (the clientui shell and PCF roots do this for you)."
      );
    }
    return this.context;
  }
}
