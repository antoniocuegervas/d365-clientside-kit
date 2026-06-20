/**
 * LibraryUtils holds broad, host-neutral helpers a CRM dev reaches for that
 * aren't form-context manipulation (that's {@link FormContextUtils}). Three
 * families, consolidated here rather than scattered across small files:
 *
 *   - OData formatting for the Dataverse Web API (entity sets, escaping, binds)
 *   - Webresource `data`/`?app=` parameter parsing (the one parser)
 *   - GUID / $batch boundary generation
 *
 * Stateless static methods, with no dependencies of their own beyond EntityModel.
 */

import { normalizeGuid, type IEntityReference } from "./EntityModel";

/** Parsed webresource parameters. */
export interface IWebResourceParams {
  /** Selected app key, from ?app= or the data payload's "app" property. */
  app?: string;
  /** Parsed data payload: JSON object, plain string, or undefined. */
  data?: unknown;
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
    if (!app && typeof data === "object" && data !== null) {
      const fromData = (data as Record<string, unknown>).app;
      if (typeof fromData === "string") {
        app = fromData;
      }
    }

    return { app, data, query };
  }

  /**
   * Builds the `data` parameter value for opening the unified shell with an app
   * key and optional payload, the counterpart of parseWebResourceParams.
   */
  static buildClientUIDataParam(app: string, payload?: Record<string, unknown>): string {
    return JSON.stringify({ app, ...payload });
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
