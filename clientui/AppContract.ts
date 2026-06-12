import * as React from "react";
import type { IViewModelContext } from "../shared/context/IViewModelContext";
import type { IWebResourceParams } from "../shared/utils/webResourceParams";

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

/**
 * The one-liner for the 90% case: wire a View component and a props
 * factory (usually `host => ({ viewModel: new XyzViewModel(host.context) })`).
 */
export function createViewApp<P extends object>(
  title: string,
  View: React.ComponentType<P>,
  getProps: (host: IAppHost) => P
): IApp {
  return {
    title,
    render: (host) => React.createElement(View, getProps(host)),
  };
}
