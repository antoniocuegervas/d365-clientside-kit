import * as React from "react";
import type { IViewModelContext } from "../shared/context/IViewModelContext";
import type { IWebResourceParams } from "../shared/utils/LibraryUtils";

/**
 * App adapter contract: apps are RENDER-ONLY. The shell calls
 * render(host) once and React owns the lifecycle from there. No mount/unmount
 * hooks on the adapter.
 */
export interface IAppHost {
  context: IViewModelContext;
  params: IWebResourceParams;
  /** Root element, for apps that need to measure the viewport. */
  container: HTMLElement;
}

export interface IApp {
  /** Human title shown by the samples hub and error pages. */
  title: string;
  render(host: IAppHost): React.ReactNode;
}

/** A props object that may carry a disposable ViewModel. */
type IMaybeViewModel = { viewModel?: { dispose?: () => void } };

/**
 * Wraps an app's element so its `viewModel` is disposed when the app unmounts.
 * Keeps disposal in one place (the factory owns the ViewModel's whole
 * lifecycle) instead of every View hand-wiring componentWillUnmount.
 */
class AppDisposer extends React.Component<{ onUnmount: () => void; children?: React.ReactNode }> {
  override componentWillUnmount(): void {
    this.props.onUnmount();
  }

  override render(): React.ReactNode {
    return this.props.children;
  }
}

/**
 * The one-liner for the 90% case: wire a View component and a props factory
 * (usually `host => ({ viewModel: new XyzViewModel(host.context) })`). When the
 * props carry a `viewModel` with a `dispose()` method, it is disposed on
 * unmount, so app Views stay render-only and never leak their ViewModel.
 */
export function createViewApp<P extends object>(
  title: string,
  View: React.ComponentType<P>,
  getProps: (host: IAppHost) => P
): IApp {
  return {
    title,
    render: (host) => {
      const props = getProps(host);
      return React.createElement(
        AppDisposer,
        { onUnmount: () => (props as IMaybeViewModel).viewModel?.dispose?.() },
        React.createElement(View, props)
      );
    },
  };
}
