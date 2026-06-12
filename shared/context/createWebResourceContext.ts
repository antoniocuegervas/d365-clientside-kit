import type { IViewModelContext } from "./IViewModelContext";
import { WebResourceContext } from "./WebResourceContext";
import { WebResourceContextV8, type IXrmV8Like } from "./WebResourceContextV8";

/**
 * Finds the Xrm root for a webresource: the current window first, then the
 * hosting parent (standard for HTML webresources embedded in forms).
 */
export function findXrm(win: Window = window): unknown {
  const candidates: Array<() => unknown> = [
    () => (win as Window & { Xrm?: unknown }).Xrm,
    () => (win.parent as Window & { Xrm?: unknown } | null)?.Xrm,
  ];
  for (const candidate of candidates) {
    try {
      const xrm = candidate();
      if (xrm) {
        return xrm;
      }
    } catch {
      // Cross-origin parent, keep looking.
    }
  }
  return undefined;
}

/**
 * Auto-detecting factory: returns WebResourceContext on modern hosts
 * (native Xrm.WebApi present) and WebResourceContextV8 on CRM 8.x. Used by
 * the clientui bootstrap and the clienthooks bundle alike.
 */
export function createWebResourceContext(win: Window = window): IViewModelContext {
  const xrm = findXrm(win);
  if (!xrm) {
    throw new Error(
      "Xrm is not available in this window or its parent. " +
        "Host this page as a Dynamics 365 webresource, or provide an Xrm mock in tests."
    );
  }
  return createContextFromXrm(xrm);
}

/** Adapter selection given an already-located Xrm root. */
export function createContextFromXrm(xrm: unknown): IViewModelContext {
  const candidate = xrm as {
    WebApi?: unknown;
    Utility?: { getGlobalContext?: unknown };
  };
  const isModern = !!candidate.WebApi && typeof candidate.Utility?.getGlobalContext === "function";
  if (isModern) {
    return new WebResourceContext(xrm as Xrm.XrmStatic);
  }
  return new WebResourceContextV8(xrm as IXrmV8Like);
}
