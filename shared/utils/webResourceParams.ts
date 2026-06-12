/**
 * The ONE canonical parser for webresource parameters (no duplicates).
 *
 * The shell accepts app selection two ways, in priority order:
 *   1. `?app=<key>` directly on the query string (developer-friendly)
 *   2. `?data=<urlencoded>`, CRM's standard webresource payload channel.
 *      `data` may be a JSON object (e.g. {"app":"sample","accountId":"..."})
 *      or a plain string, and CRM sometimes double-encodes it.
 */

export interface IWebResourceParams {
  /** Selected app key, from ?app= or the data payload's "app" property. */
  app?: string;
  /** Parsed data payload: JSON object, plain string, or undefined. */
  data?: unknown;
  /** All raw query parameters for app-specific needs. */
  query: Record<string, string>;
}

export function parseWebResourceParams(search: string): IWebResourceParams {
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

/**
 * Builds the `data` parameter value for opening the unified shell with an app
 * key and optional payload, the counterpart of parseWebResourceParams.
 */
export function buildClientUIDataParam(app: string, payload?: Record<string, unknown>): string {
  return JSON.stringify({ app, ...payload });
}
