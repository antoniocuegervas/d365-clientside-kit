import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { createContextFromXrm, findInjectedHost, findXrm } from "../shared/context/createWebResourceContext";
import { ViewModelContextProvider } from "../shared/context/ViewModelContextProvider";
import { ErrorBoundary } from "../shared/controls/presentational/ErrorBoundary";
import { FullPageBackBar } from "./FullPageBackBar";
import { resolveKitTheme } from "../shared/theme/d365Theme";
import { LibraryUtils } from "../shared/utils/LibraryUtils";
import { getApp, listApps } from "./registry";
import type { IAppHost } from "./AppContract";

/**
 * The webresource shell boot flow, deliberately linear and readable
 * top to bottom. The whole story:
 *
 *   container → params → wait for Xrm → context → app lookup → render
 *
 * Full-viewport sizing is CSS-driven (html/body/#container at 100% in
 * clientui.html), so window resizing needs no JS handling here.
 */

export interface IBootstrapOptions {
  /** Window to bootstrap against. Default: the global window. */
  window?: Window;
  /** Container element id. Default "container". */
  containerId?: string;
  /** How long to poll for Xrm before failing visibly. Default 10s. */
  xrmTimeoutMs?: number;
  /** Query-string override (tests / programmatic launches). Default location.search. */
  search?: string;
}

export async function bootstrap(options: IBootstrapOptions = {}): Promise<Root | undefined> {
  const win = options.window ?? window;

  // 1. Find the container, without it nothing can even show an error.
  const container = win.document.getElementById(options.containerId ?? "container");
  if (!container) {
    throw new Error(`clientui: container element '#${options.containerId ?? "container"}' not found.`);
  }

  try {
    // 2. Parse app selection: ?app= and/or CRM data payload.
    const params = LibraryUtils.parseWebResourceParams(options.search ?? win.location.search);

    // 3. Wait for Xrm, with a visible failure. A form-hosted shell whose form
    //    registered the clienthooks KitShell.connect hook receives Xrm and the
    //    form context injected through getContentWindow (the supported path);
    //    findXrm prefers that and falls back to the ancestor-frame walk.
    const xrm = await waitForXrm(win, options.xrmTimeoutMs ?? 10_000);

    // 4. Create the host context (modern vs legacy auto-detected). The
    //    injected form context is the form-access source, read LIVE rather
    //    than captured once: KitShell.connect injects through
    //    getContentWindow's promise, which can land after a fast boot has
    //    already found a walked Xrm. Form access adopts the injected page
    //    whenever it appears, so form-embedded consumers that poll form
    //    access resolve either way, and no hosting shape waits on an
    //    injection that may never come.
    const context = createContextFromXrm(xrm, () => findInjectedHost(win)?.formPage);

    // 5. Look the app up in the registry.
    if (!params.app) {
      renderBootError(container, "No app specified", appListHelp());
      return undefined;
    }
    const app = getApp(params.app);
    if (!app) {
      renderBootError(container, `Unknown app '${params.app}'`, appListHelp());
      return undefined;
    }

    // 6. Render inside the kit theme + context provider; React owns the rest.
    //    The theme tracks the user's D365 high-contrast setting when present.
    const host: IAppHost = { context, params, container };
    const theme = resolveKitTheme(context.globalContext.userSettings.isHighContrastEnabled);

    // A full-page launch (openClientUI takes it automatically on a narrow
    // viewport and marks the payload fullPage) gets no platform back chrome on
    // the web client, so the shell renders its own Back above the app. The bar
    // sits above a bounded, scrolling app region, so it never takes the app's
    // scroll space. Every other hosting (dialog, sitemap, non-web client) renders
    // the app bare.
    const appContent = app.render(host);
    const showBackBar = params.fullPage && context.client.getClient() === "Web";
    const body = showBackBar ? (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <FullPageBackBar onBack={() => win.history.back()} />
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>{appContent}</div>
      </div>
    ) : (
      appContent
    );

    const root = createRoot(container);
    root.render(
      <FluentProvider theme={theme} style={{ height: "100%" }}>
        <ErrorBoundary>
          <ViewModelContextProvider context={context}>{body}</ViewModelContextProvider>
        </ErrorBoundary>
      </FluentProvider>
    );

    // 7. Unmount cleanly when the webresource page goes away. pagehide, not
    //    beforeunload: browsers deprioritize beforeunload and it blocks the
    //    back/forward cache; pagehide fires reliably in both cases.
    win.addEventListener("pagehide", () => root.unmount());
    return root;
  } catch (error) {
    renderBootError(
      container,
      "This page could not start",
      error instanceof Error ? error.message : String(error)
    );
    return undefined;
  }
}

/** Polls for Xrm on the window/parent until found or timed out. */
export function waitForXrm(win: Window, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = (): void => {
      const xrm = findXrm(win);
      if (xrm) {
        resolve(xrm);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(
          new Error(
            "Xrm was not found in this window or its parent. " +
              "Open this page as a Dynamics 365 webresource."
          )
        );
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

/** Boot-failure rendering is plain DOM on purpose, it must never depend on the app stack working. */
function renderBootError(container: HTMLElement, title: string, detail: string): void {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "alert");
  wrapper.style.cssText =
    "font-family: 'Segoe UI', sans-serif; padding: 24px; color: #323130; max-width: 640px;";
  const heading = document.createElement("h2");
  heading.style.cssText = "font-size: 18px; margin: 0 0 8px;";
  heading.textContent = title;
  const body = document.createElement("div");
  body.style.cssText = "font-size: 14px; white-space: pre-wrap;";
  body.textContent = detail;
  wrapper.append(heading, body);
  container.replaceChildren(wrapper);
}

function appListHelp(): string {
  const apps = listApps();
  if (apps.length === 0) {
    return "No apps are registered in this bundle.";
  }
  return (
    "Pass ?app=<key> or a data payload like {\"app\":\"<key>\"}.\n\nRegistered apps:\n" +
    apps.map((app) => `  • ${app.key}, ${app.title}`).join("\n")
  );
}
