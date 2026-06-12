import { newBatchBoundary } from "../utils/correlation";
import { normalizeGuid } from "../utils/EntityModel";

/**
 * cds-client, lightweight XHR-based OData client for the Dataverse Web API.
 *
 * Use it when native `Xrm.WebApi` is unavailable (CRM 8.x hosts) or when code
 * must target a different Dataverse environment than the hosting session.
 * Inside a webresource/PCF against the current org, prefer `context.webAPI`.
 *
 * AUTH SCOPE (v1, section 6.1): ambient credentials only, the same-origin CRM
 * session, or integrated Windows auth for on-prem orgs reachable from the
 * browser. There is NO token acquisition; cross-origin cloud orgs are out of
 * scope. Do not assume arbitrary cross-org reach.
 *
 * Known limitation: retrieveMultiple is FetchXML- and raw-OData-query
 * oriented; there is no $filter builder.
 */

export interface ICdsClientOptions {
  /** Org root URL, e.g. "https://org.crm.dynamics.com" (no trailing slash needed). */
  clientUrl: string;
  /** Web API version without the leading "v". Default: "9.2". Legacy on-prem: "8.2". */
  apiVersion?: string;
  /**
   * GET URLs longer than this fall back to a $batch POST (platform/browser
   * URL limits). The default is conservative; override if your gateway allows more.
   */
  maxUrlLength?: number;
}

export interface IRetrieveMultipleResult {
  entities: Array<Record<string, unknown>>;
  /** Present when the server paged the result. Pass to retrieveMultipleByUrl. */
  nextLink?: string;
}

export class CdsClientError extends Error {
  readonly status: number;
  readonly responseText: string;

  constructor(status: number, message: string, responseText: string) {
    super(message);
    this.name = "CdsClientError";
    this.status = status;
    this.responseText = responseText;
  }
}

const DEFAULT_API_VERSION = "9.2";
const DEFAULT_MAX_URL_LENGTH = 2048;

export class CdsClient {
  readonly clientUrl: string;
  readonly apiVersion: string;
  private readonly maxUrlLength: number;

  constructor(options: ICdsClientOptions) {
    this.clientUrl = options.clientUrl.replace(/\/+$/, "");
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.maxUrlLength = options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;
  }

  /** Web API root, e.g. "https://org.crm.dynamics.com/api/data/v9.2/". */
  get apiUrl(): string {
    return `${this.clientUrl}/api/data/v${this.apiVersion}/`;
  }

  // ---------------------------------------------------------------- CRUD

  /** Creates a record. Returns the new record's id. */
  async createRecord(entitySet: string, data: Record<string, unknown>): Promise<{ id: string }> {
    const response = await this.request("POST", `${this.apiUrl}${entitySet}`, JSON.stringify(data));
    const entityIdHeader = response.getResponseHeader("OData-EntityId") ?? "";
    const match = /\(([^)]+)\)/.exec(entityIdHeader);
    return { id: match ? normalizeGuid(match[1]) : "" };
  }

  /** Updates a record (PATCH semantics, only the supplied attributes change). */
  async updateRecord(entitySet: string, id: string, data: Record<string, unknown>): Promise<void> {
    await this.request(
      "PATCH",
      `${this.apiUrl}${entitySet}(${normalizeGuid(id)})`,
      JSON.stringify(data)
    );
  }

  async deleteRecord(entitySet: string, id: string): Promise<void> {
    await this.request("DELETE", `${this.apiUrl}${entitySet}(${normalizeGuid(id)})`);
  }

  /**
   * Retrieves a single record. `query` is a raw OData query string starting
   * with "?", e.g. "?$select=name,revenue".
   */
  async retrieveRecord(
    entitySet: string,
    id: string,
    query?: string
  ): Promise<Record<string, unknown>> {
    const response = await this.request(
      "GET",
      `${this.apiUrl}${entitySet}(${normalizeGuid(id)})${query ?? ""}`
    );
    return JSON.parse(response.responseText) as Record<string, unknown>;
  }

  /**
   * Retrieves multiple records with a raw OData query string ("?$select=...&$top=...").
   * For FetchXML use {@link fetch}, which adds the long-query batch fallback.
   */
  async retrieveMultiple(entitySet: string, query?: string): Promise<IRetrieveMultipleResult> {
    return this.retrieveMultipleByUrl(`${this.apiUrl}${entitySet}${query ?? ""}`);
  }

  /** Follows an @odata.nextLink (or any absolute Web API collection URL). */
  async retrieveMultipleByUrl(url: string): Promise<IRetrieveMultipleResult> {
    const response = await this.request("GET", url);
    return parseCollection(response.responseText);
  }

  // ------------------------------------------------------------- FetchXML

  /**
   * Executes a FetchXML query. Falls back to a $batch POST automatically when
   * the encoded GET URL would exceed the configured URL length limit.
   */
  async fetch(entitySet: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    const url = `${this.apiUrl}${entitySet}?fetchXml=${encodeURIComponent(fetchXml)}`;
    if (url.length <= this.maxUrlLength) {
      return this.retrieveMultipleByUrl(url);
    }
    return this.fetchViaBatch(entitySet, fetchXml);
  }

  /** Long-FetchXML fallback: wraps the GET in a multipart $batch request. */
  private async fetchViaBatch(
    entitySet: string,
    fetchXml: string
  ): Promise<IRetrieveMultipleResult> {
    const boundary = newBatchBoundary();
    const innerUrl = `${this.apiUrl}${entitySet}?fetchXml=${encodeURIComponent(fetchXml)}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/http",
      "Content-Transfer-Encoding: binary",
      "",
      `GET ${innerUrl} HTTP/1.1`,
      "Accept: application/json",
      'Prefer: odata.include-annotations="*"',
      "",
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const response = await this.request("POST", `${this.apiUrl}$batch`, body, {
      "Content-Type": `multipart/mixed;boundary=${boundary}`,
    });
    // The multipart response wraps exactly one JSON payload, slice it out.
    const text = response.responseText;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) {
      throw new CdsClientError(response.status, "Malformed $batch response", text);
    }
    return parseCollection(text.slice(start, end + 1));
  }

  // ------------------------------------------------- Actions and workflows

  /**
   * Executes a custom action. Unbound by default; pass `boundTo` for an action
   * bound to a record. Action names without a namespace are used verbatim for
   * unbound calls and prefixed with "Microsoft.Dynamics.CRM." for bound calls.
   */
  async executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entitySet: string; id: string }
  ): Promise<unknown> {
    const url = boundTo
      ? `${this.apiUrl}${boundTo.entitySet}(${normalizeGuid(boundTo.id)})/${qualifyAction(actionName)}`
      : `${this.apiUrl}${actionName}`;
    const response = await this.request(
      "POST",
      url,
      parameters ? JSON.stringify(parameters) : undefined
    );
    return response.responseText ? JSON.parse(response.responseText) : undefined;
  }

  /** Runs an on-demand classic workflow against one record (legacy scenarios, section 6.2). */
  async executeWorkflow(workflowId: string, recordId: string): Promise<unknown> {
    return this.executeAction(
      "ExecuteWorkflow",
      { EntityId: normalizeGuid(recordId) },
      { entitySet: "workflows", id: workflowId }
    );
  }

  // -------------------------------------------------------------- plumbing

  private request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>
  ): Promise<XMLHttpRequest> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      // Ambient credentials only, cookies / integrated auth.
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.setRequestHeader("OData-MaxVersion", "4.0");
      xhr.setRequestHeader("OData-Version", "4.0");
      if (method === "GET") {
        xhr.setRequestHeader("Prefer", 'odata.include-annotations="*"');
      }
      if (body !== undefined && !extraHeaders?.["Content-Type"]) {
        xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
      }
      for (const [name, value] of Object.entries(extraHeaders ?? {})) {
        xhr.setRequestHeader(name, value);
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr);
        } else {
          reject(new CdsClientError(xhr.status, extractErrorMessage(xhr), xhr.responseText));
        }
      };
      xhr.onerror = () =>
        reject(new CdsClientError(0, `Network error calling ${url}`, xhr.responseText));
      xhr.send(body);
    });
  }
}

function qualifyAction(actionName: string): string {
  return actionName.includes(".") ? actionName : `Microsoft.Dynamics.CRM.${actionName}`;
}

function parseCollection(json: string): IRetrieveMultipleResult {
  const payload = JSON.parse(json) as {
    value?: Array<Record<string, unknown>>;
    "@odata.nextLink"?: string;
  };
  return { entities: payload.value ?? [], nextLink: payload["@odata.nextLink"] };
}

function extractErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const parsed = JSON.parse(xhr.responseText) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // fall through to the generic message
  }
  return `Dataverse request failed with status ${xhr.status}`;
}
