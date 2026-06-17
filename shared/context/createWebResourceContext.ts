import type { IViewModelContext } from "./IViewModelContext";
import type { IXrmPageLike } from "./hostSurface";
import { XrmPageFormAccess } from "./hostSurface";
import { WebResourceContext } from "./WebResourceContext";
import { WebResourceContextV8, type IXrmV8Like } from "./WebResourceContextV8";

/**
 * Walks from `win` outward through every ancestor frame collecting each
 * window's `Xrm`, ordered deepest-first (self, then parent, then grandparent…).
 *
 * Webresources can be nested several frames deep (dialogs, embedded iframes),
 * so checking only `window` and `window.parent` misses the host Xrm.
 * The walk stops at the top frame and on cross-origin boundaries, both raise
 * or short-circuit gracefully inside the try/catch.
 */
export function collectAncestorXrms(win: Window = window): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<Window>();
  let current: Window | null = win;
  while (current && !seen.has(current)) {
    seen.add(current);
    try {
      const xrm = (current as Window & { Xrm?: unknown }).Xrm;
      if (xrm) {
        found.push(xrm);
      }
    } catch {
      break; // cross-origin window, end the walk gracefully
    }
    let parent: Window | null;
    try {
      parent = current.parent;
    } catch {
      break; // cross-origin parent
    }
    if (!parent || parent === current) {
      break; // reached the top frame
    }
    current = parent;
  }
  return found;
}

function isModernXrm(xrm: unknown): boolean {
  return (
    typeof (xrm as { Utility?: { getGlobalContext?: unknown } } | undefined)?.Utility
      ?.getGlobalContext === "function"
  );
}

/** A legacy (V8) Xrm resolves its global context through `Xrm.Page.context`. */
function canResolveGlobalContext(xrm: unknown): boolean {
  if (isModernXrm(xrm)) {
    return true;
  }
  return (
    typeof (xrm as { Page?: { context?: { getClientUrl?: unknown } } } | undefined)?.Page?.context
      ?.getClientUrl === "function"
  );
}

/**
 * Picks the best Xrm from the collected candidates: a modern Xrm (exposing
 * `Utility.getGlobalContext`) wins; otherwise the first that can resolve a
 * global context at all; otherwise the first found, so the adapter selection
 * still runs (and surfaces a readable error if it can't proceed).
 */
export function chooseXrm(candidates: unknown[]): unknown {
  return (
    candidates.find(isModernXrm) ?? candidates.find(canResolveGlobalContext) ?? candidates[0]
  );
}

/**
 * The deepest ancestor whose `Xrm.Page` actually has a record form behind it,
 * the nearest enclosing form context for a nested webresource. Returns
 * undefined for standalone webresources with no form in any ancestor.
 */
export function findDeepestFormPage(candidates: unknown[]): IXrmPageLike | undefined {
  for (const xrm of candidates) {
    const page = (xrm as { Page?: IXrmPageLike } | undefined)?.Page;
    if (XrmPageFormAccess.hasForm(page)) {
      return page;
    }
  }
  return undefined;
}

/**
 * Finds the Xrm root for a webresource by walking all ancestor frames and
 * choosing the best candidate (modern-preferred).
 */
export function findXrm(win: Window = window): unknown {
  return chooseXrm(collectAncestorXrms(win));
}

/**
 * Auto-detecting factory: returns WebResourceContext on modern hosts
 * (native Xrm.WebApi present) and WebResourceContextV8 on CRM 8.x. Used by
 * the clientui bootstrap and the clienthooks bundle alike. Form access binds
 * to the deepest ancestor form, independent of which Xrm hosts the Web API.
 */
export function createWebResourceContext(win: Window = window): IViewModelContext {
  const candidates = collectAncestorXrms(win);
  const xrm = chooseXrm(candidates);
  if (!xrm) {
    throw new Error(
      "Xrm is not available in this window or any ancestor frame. " +
        "Host this page as a Dynamics 365 webresource, or provide an Xrm mock in tests."
    );
  }
  return createContextFromXrm(xrm, findDeepestFormPage(candidates));
}

/**
 * Adapter selection given an already-located Xrm root. `formPage` overrides the
 * record-form source (the deepest ancestor Page); omit it to use the Xrm's own
 * Page.
 */
export function createContextFromXrm(xrm: unknown, formPage?: IXrmPageLike): IViewModelContext {
  if (isModernXrm(xrm)) {
    return new WebResourceContext(xrm as Xrm.XrmStatic, formPage);
  }
  return new WebResourceContextV8(xrm as IXrmV8Like, formPage);
}
