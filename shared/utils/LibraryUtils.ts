/**
 * LibraryUtils holds broad, host-neutral helpers a CRM dev reaches for that
 * aren't form-context manipulation (that's {@link FormContextUtils}). Three
 * families, consolidated here rather than scattered across small files:
 *
 *   - OData formatting for the Dataverse Web API (entity sets, escaping, binds)
 *   - Webresource `data`/`?app=` parameter parsing (the one parser)
 *   - GUID / $batch boundary generation
 *   - Viewport reads (the narrow check and its live tracker)
 *
 * Static methods with no dependencies of their own beyond EntityModel and the
 * reactivity Observable (the viewport tracker hands one out).
 */

import { Observable } from "../reactivity/Observable";
import { normalizeGuid, type IEntityReference } from "./EntityModel";

/**
 * A live narrow-viewport flag with an explicit teardown, returned by
 * {@link LibraryUtils.trackNarrowViewport}.
 */
export interface INarrowViewportTracker {
  /** True while the resolved viewport sits under the narrow breakpoint. */
  readonly narrow: Observable<boolean>;
  /** Stops listening to viewport changes. Safe to call more than once. */
  dispose(): void;
}

/** Parsed webresource parameters. */
export interface IWebResourceParams {
  /** Selected app key, from ?app= or the data payload's "app" property. */
  app?: string;
  /** Parsed data payload: JSON object, plain string, or undefined. */
  data?: unknown;
  /**
   * True when the data payload marks a full-page hosting (the payload's
   * `fullPage: true`). openClientUI's full-page launch, taken automatically on a
   * narrow viewport, sets it so the launched app can render its own back
   * button: the platform gives a full-page webresource no back button.
   */
  fullPage: boolean;
  /** All raw query parameters for app-specific needs. */
  query: Record<string, string>;
}

/** Peels CRM's (sometimes double-)encoded `data` param into JSON or a plain string. */
function parseDataParam(raw: string): unknown {
  let text = raw;
  // CRM can hand the data parameter over still-encoded; peel at most twice.
  for (let i = 0; i < 2 && /%[0-9a-fA-F]{2}/.test(text); i++) {
    try {
      text = decodeURIComponent(text);
    } catch {
      break;
    }
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON after all, fall through to the plain string.
    }
  }
  return text;
}

export class LibraryUtils {
  //#region OData formatting

  /**
   * Authoritative logical-name to entity-set-name mappings learned from
   * metadata. Entity set names are org-stable and immutable, so one
   * process-level cache is safe, and it lets the convention-based
   * {@link entitySetName} return the real set name once an entity's metadata
   * has been loaded, covering the rare custom entity the pluralizer would miss.
   */
  private static readonly entitySetNameCache = new Map<string, string>();

  /**
   * Records an authoritative entity set name (from EntityDefinitions metadata)
   * so later {@link entitySetName} calls return it instead of the pluralization
   * guess. MetadataService calls this as it loads entity metadata.
   */
  static cacheEntitySetName(logicalName: string, entitySetName: string): void {
    if (logicalName && entitySetName) {
      LibraryUtils.entitySetNameCache.set(logicalName.toLowerCase(), entitySetName);
    }
  }

  /** Clears the learned entity-set-name cache. For test isolation. */
  static clearEntitySetNameCache(): void {
    LibraryUtils.entitySetNameCache.clear();
  }

  /**
   * Derives the entity set name from a logical name. Returns the authoritative
   * name when metadata has cached one (see {@link cacheEntitySetName}), else
   * falls back to standard Dataverse pluralization. The cache covers the rare
   * custom entity whose set name breaks the convention; pass an explicit set
   * name where even that is unavailable.
   */
  static entitySetName(logicalName: string): string {
    const lower = logicalName.toLowerCase();
    const known = LibraryUtils.entitySetNameCache.get(lower);
    if (known) {
      return known;
    }
    if (/(s|x|z|ch|sh)$/.test(lower)) {
      return `${lower}es`;
    }
    if (/[^aeiou]y$/.test(lower)) {
      return `${lower.slice(0, -1)}ies`;
    }
    return `${lower}s`;
  }

  /** Escapes a string literal for use inside an OData filter/query. */
  static escapeODataString(value: string): string {
    return value.replace(/'/g, "''");
  }

  /** Escapes a value for interpolation into a FetchXML attribute literal. */
  static escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /** Formats an @odata.bind path for associating a lookup on create/update. */
  static odataBind(reference: IEntityReference, entitySet?: string): string {
    return `/${entitySet ?? LibraryUtils.entitySetName(reference.logicalName)}(${normalizeGuid(reference.id)})`;
  }

  /**
   * Formats a single value for an OData `$filter` literal: strings quoted and
   * `''`-escaped, booleans as true/false, numbers raw.
   */
  static formatODataValue(value: string | number | boolean): string {
    if (typeof value === "string") {
      return `'${LibraryUtils.escapeODataString(value)}'`;
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  }

  /** Reads the formatted-value annotation for an attribute, if present. */
  static formattedValue(
    record: Record<string, unknown>,
    attributeLogicalName: string
  ): string | undefined {
    return record[`${attributeLogicalName}@OData.Community.Display.V1.FormattedValue`] as
      | string
      | undefined;
  }

  //#endregion

  //#region Webresource parameters

  /**
   * The ONE parser for webresource parameters. App selection comes,
   * in priority order, from `?app=<key>` or the `?data=` payload's `app`
   * property (`data` may be JSON or a plain string, possibly double-encoded).
   */
  static parseWebResourceParams(search: string): IWebResourceParams {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const query: Record<string, string> = {};
    params.forEach((value, key) => {
      query[key] = value;
    });

    let data: unknown;
    const rawData = params.get("data");
    if (rawData !== null && rawData !== "") {
      data = parseDataParam(rawData);
    }

    let app = params.get("app") ?? undefined;
    let fullPage = false;
    if (typeof data === "object" && data !== null) {
      const payload = data as Record<string, unknown>;
      if (!app && typeof payload.app === "string") {
        app = payload.app;
      }
      fullPage = payload.fullPage === true;
    }

    return { app, data, fullPage, query };
  }

  /**
   * Builds the `data` parameter value for opening the unified shell with an app
   * key and optional payload, the counterpart of parseWebResourceParams.
   */
  static buildClientUIDataParam(app: string, payload?: Record<string, unknown>): string {
    return JSON.stringify({ app, ...payload });
  }

  /**
   * True when the app viewport is narrow enough that the platform stops hosting
   * webresource dialogs. In its narrow (phone) reflow, Xrm.Navigation.navigateTo
   * to a webresource DIALOG (openClientUI's default dialog launch) opens an
   * empty "No data available." shell with no iframe, so openClientUI launches
   * the shell full page instead on a narrow viewport.
   *
   * Measured on the top-most same-origin window, not the calling window: UCI
   * runs ribbon and command-bar handlers inside a hidden iframe (the
   * ClientApiFrame) whose own viewport is effectively 0x0, where any width
   * query matches, while the dialog capability tracks the APPLICATION
   * viewport, the top window's. A cross-origin or absent top falls back to
   * the calling window. Consequence: an iframe that is itself narrow inside
   * a desktop app does not read as narrow, and narrow-viewport simulation
   * must narrow the top window (device emulation or a window resize), not
   * just an iframe.
   *
   * Viewport-driven ON PURPOSE. getFormFactor() reports the DEVICE, not the
   * reflow: it stays Desktop in a narrow desktop window or browser device
   * emulation, while the dialog failure tracks viewport width. 768px is the
   * platform's conventional narrow breakpoint.
   *
   * Absent matchMedia (a non-browser host: unit tests, SSR) reads as not narrow,
   * so those paths keep the default dialog launch.
   */
  static isNarrowViewport(win: Window = window): boolean {
    const viewport = LibraryUtils.resolveViewportWindow(win);
    return (
      typeof viewport.matchMedia === "function" &&
      viewport.matchMedia(LibraryUtils.NARROW_QUERY).matches
    );
  }

  /**
   * A LIVE narrow-viewport flag: the initial value is {@link isNarrowViewport}
   * and the returned Observable updates whenever the resolved window crosses the
   * breakpoint (a device rotation or window resize). Measured on the same
   * top-most same-origin window as isNarrowViewport, so a hidden ribbon frame
   * never reads narrow. Absent matchMedia (a non-browser host: unit tests, SSR)
   * yields a false flag that never changes, and dispose is then a no-op. Call
   * dispose from a host that has an explicit teardown (a smart control's
   * onUnmount, a PCF's destroy) to stop listening.
   *
   * The presentational tier never calls this (the lint boundary forbids it a
   * LibraryUtils import); a smart wrapper or PCF root resolves the flag and
   * passes the Observable down.
   */
  static trackNarrowViewport(win: Window = window): INarrowViewportTracker {
    const viewport = LibraryUtils.resolveViewportWindow(win);
    const narrow = new Observable<boolean>(LibraryUtils.isNarrowViewport(win));
    const mql =
      typeof viewport.matchMedia === "function"
        ? viewport.matchMedia(LibraryUtils.NARROW_QUERY)
        : undefined;
    if (!mql) {
      return { narrow, dispose: () => undefined };
    }
    const listener = (): void => {
      narrow.value = mql.matches;
    };
    // addEventListener is the modern MediaQueryList API; older engines expose
    // only the deprecated addListener/removeListener pair; a MediaQueryList with
    // neither (a minimal stub) keeps its initial value and disposes to a no-op.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", listener);
      return { narrow, dispose: () => mql.removeEventListener("change", listener) };
    }
    if (typeof mql.addListener === "function") {
      mql.addListener(listener);
      return { narrow, dispose: () => mql.removeListener(listener) };
    }
    return { narrow, dispose: () => undefined };
  }

  /**
   * The narrow breakpoint, shared by isNarrowViewport and trackNarrowViewport so
   * the resting read and the live tracker can never drift. 768px is the
   * platform's conventional narrow (phone) breakpoint.
   */
  private static readonly NARROW_QUERY = "(max-width: 768px)";

  /**
   * Resolves the window whose viewport drives the narrow decision: the top-most
   * same-origin window. UCI runs ribbon and command-bar handlers inside a hidden
   * 0x0 ClientApiFrame, so the application viewport is the top window's, not the
   * caller's. A cross-origin top (member access throws) or an absent top falls
   * back to the calling window.
   */
  private static resolveViewportWindow(win: Window): Window {
    try {
      const top = win.top;
      if (top) {
        // Probing a member here makes a cross-origin top throw inside the
        // guard, leaving the calling window as the fallback.
        void top.matchMedia;
        return top;
      }
    } catch {
      // Cross-origin top: measure the calling window instead.
    }
    return win;
  }

  //#endregion

  //#region GUID / $batch boundaries

  /** RFC-4122 v4 GUID (uses crypto.randomUUID when available). */
  static newGuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback v4 generator for hosts without crypto.randomUUID.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** Boundary token for multipart $batch requests, e.g. "batch_<guid>". */
  static newBatchBoundary(): string {
    return `batch_${LibraryUtils.newGuid()}`;
  }
  //#endregion
}
