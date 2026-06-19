import type { IExecuteResponse, IWebApiRequest } from "../context/IViewModelContext";
import { LibraryUtils } from "../utils/LibraryUtils";
import { normalizeGuid } from "../utils/EntityModel";

/**
 * cds-client, lightweight XHR-based OData client for the Dataverse Web API.
 *
 * Use it when native `Xrm.WebApi` is unavailable (CRM 8.x hosts) or when code
 * must target a different Dataverse environment than the hosting session.
 * Inside a webresource/PCF against the current org, prefer `context.webAPI`.
 *
 * AUTH SCOPE (v1): ambient credentials only, the same-origin CRM
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
  /**
   * Total matching rows for FetchXML `returntotalrecordcount='true'` requests
   *. Capped (default 5,000), see {@link totalRecordCountLimitExceeded}.
   */
  totalRecordCount?: number;
  /** True when the real total exceeds the count cap, so the total is unreliable. */
  totalRecordCountLimitExceeded?: boolean;
  /** FetchXML `morerecords` flag, another page exists after this one. */
  moreRecords?: boolean;
  /** FetchXML `pagingcookie` for efficient sequential paging. */
  pagingCookie?: string;
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

  //#region CRUD

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
  async retrieveMultiple(
    entitySet: string,
    query?: string,
    maxPageSize?: number
  ): Promise<IRetrieveMultipleResult> {
    // Server-side paging is driven by the odata.maxpagesize preference, NOT by
    // $top (which caps the result and suppresses @odata.nextLink). Send the page
    // size as a Prefer directive so the response carries the next page's link.
    const extraHeaders =
      maxPageSize !== undefined ? { Prefer: `odata.maxpagesize=${maxPageSize}` } : undefined;
    return this.retrieveMultipleByUrl(`${this.apiUrl}${entitySet}${query ?? ""}`, extraHeaders);
  }

  /** Follows an @odata.nextLink (or any absolute Web API collection URL). */
  async retrieveMultipleByUrl(
    url: string,
    extraHeaders?: Record<string, string>
  ): Promise<IRetrieveMultipleResult> {
    const response = await this.request("GET", url, undefined, extraHeaders);
    return parseCollection(response.responseText);
  }

  /**
   * Raw GET for paths the typed helpers don't cover (metadata endpoints like
   * "EntityDefinitions(LogicalName='account')/Attributes(...)"). `path` is
   * appended to the API root unless it is already absolute.
   */
  async get(path: string): Promise<Record<string, unknown>> {
    const url = /^https?:\/\//.test(path) ? path : `${this.apiUrl}${path}`;
    const response = await this.request("GET", url);
    return JSON.parse(response.responseText) as Record<string, unknown>;
  }

  //#endregion

  //#region FetchXML

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
    const boundary = LibraryUtils.newBatchBoundary();
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

  //#endregion

  //#region Actions and workflows

  /**
   * Executes a custom action, the ergonomic action-only path: positional args
   * in, parsed response body out. For functions or a pre-built Xrm request
   * object use {@link execute}, the standard generic path. Both hit the same
   * action endpoint; this one stays separate because its `boundTo` is already an
   * entity set (execute takes a logical name and pluralizes it itself).
   *
   * Unbound by default; pass `boundTo` for an action bound to a record. Action
   * names without a namespace are used verbatim for unbound calls and prefixed
   * with "Microsoft.Dynamics.CRM." for bound calls.
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

  /** Runs an on-demand classic workflow against one record (legacy scenarios). */
  async executeWorkflow(workflowId: string, recordId: string): Promise<unknown> {
    return this.executeAction(
      "ExecuteWorkflow",
      { EntityId: normalizeGuid(recordId) },
      { entitySet: "workflows", id: workflowId }
    );
  }

  /**
   * Executes a request object that mirrors the `Xrm.WebApi.online.execute`
   * contract (parameter values as own properties plus a `getMetadata()`), the
   * standard generic path. Returns a fetch-like response (call `.json()` for the
   * body) that resolves with `ok: false` on an HTTP error and rejects only on a
   * network failure, the same flow control as the modern host's native execute.
   * For the common "just run this action" case, {@link executeAction} is the
   * ergonomic wrapper.
   *
   * Actions POST their parameters; functions GET with parameter aliases; bound
   * operations target the entity set resolved from the bound reference. CRUD
   * requests are rejected with a pointer to the dedicated CRUD methods, which
   * are the kit's CRUD surface on the cds-client hosts.
   */
  async execute(request: IWebApiRequest): Promise<IExecuteResponse> {
    const { method, url, body } = this.buildExecuteRequest(request);
    // Fetch semantics, matching the native online.execute: resolve with
    // ok=false on an HTTP error, reject only on a network failure. Uses send
    // (not request) so a non-2xx status is reported rather than thrown.
    const xhr = await this.send(method, url, body);
    return makeExecuteResponse(xhr.status, xhr.statusText, xhr.responseText);
  }

  /** Executes requests in order, mirroring `executeMultiple`. */
  async executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]> {
    const responses: IExecuteResponse[] = [];
    for (const request of requests) {
      responses.push(await this.execute(request));
    }
    return responses;
  }

  /** Resolves an execute request object into the HTTP method, URL, and body. */
  private buildExecuteRequest(request: IWebApiRequest): {
    method: "GET" | "POST";
    url: string;
    body?: string;
  } {
    const metadata = request.getMetadata();
    const operationName = metadata.operationName;
    if (!operationName) {
      throw new Error("execute requires operationName in the request metadata.");
    }
    const operationType = metadata.operationType ?? 0;
    const parameters = collectExecuteParameters(request);

    // A bound operation carries its target reference under the bound-parameter
    // name; resolve it to an "entityset(id)/" URL prefix and drop it from the
    // body/query parameters.
    let boundPrefix = "";
    const boundParameter = metadata.boundParameter;
    if (boundParameter !== undefined && boundParameter !== null && boundParameter !== "") {
      const target = parameters[boundParameter] as
        | { entityType?: string; id?: string }
        | undefined;
      if (!target?.entityType || !target?.id) {
        throw new Error(
          `execute bound parameter '${boundParameter}' must be a reference with entityType and id.`
        );
      }
      boundPrefix = `${LibraryUtils.entitySetName(target.entityType)}(${normalizeGuid(target.id)})/`;
      delete parameters[boundParameter];
    }

    if (operationType === 2) {
      throw new Error(
        `execute does not run CRUD operations through cds-client; use createRecord, updateRecord, deleteRecord, retrieveRecord, or retrieveMultiple for '${operationName}'.`
      );
    }

    if (operationType === 1) {
      // Function: GET with the OData parameter-alias syntax.
      const qualified = boundPrefix ? qualifyAction(operationName) : operationName;
      return {
        method: "GET",
        url: `${this.apiUrl}${boundPrefix}${qualified}${buildFunctionParameters(parameters)}`,
      };
    }

    // Action: POST the remaining parameters. Unbound names are used verbatim;
    // bound names are namespace-qualified (the executeAction convention).
    const qualified = boundPrefix ? qualifyAction(operationName) : operationName;
    return {
      method: "POST",
      url: `${this.apiUrl}${boundPrefix}${qualified}`,
      body: Object.keys(parameters).length > 0 ? JSON.stringify(parameters) : undefined,
    };
  }

  //#endregion

  //#region plumbing

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>
  ): Promise<XMLHttpRequest> {
    const xhr = await this.send(method, url, body, extraHeaders);
    if (xhr.status >= 200 && xhr.status < 300) {
      return xhr;
    }
    throw new CdsClientError(xhr.status, extractErrorMessage(xhr), xhr.responseText);
  }

  /**
   * Sends the request and resolves with the XHR on ANY HTTP status, rejecting
   * only on a network-level failure. `request` layers the 2xx check on top; the
   * fetch-like `execute` keeps non-2xx responses so it can report `ok: false`
   * rather than throwing, matching the native online.execute.
   */
  private send(
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
      // Compose a single Prefer header: annotations on every GET, plus any
      // caller-supplied directive (for example odata.maxpagesize). Setting it
      // once avoids relying on the transport's header-combining behavior.
      const preferParts: string[] = [];
      if (method === "GET") {
        preferParts.push('odata.include-annotations="*"');
      }
      if (extraHeaders?.["Prefer"]) {
        preferParts.push(extraHeaders["Prefer"]);
      }
      if (preferParts.length > 0) {
        xhr.setRequestHeader("Prefer", preferParts.join(","));
      }
      if (body !== undefined && !extraHeaders?.["Content-Type"]) {
        xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
      }
      for (const [name, value] of Object.entries(extraHeaders ?? {})) {
        if (name === "Prefer") {
          continue;
        }
        xhr.setRequestHeader(name, value);
      }
      xhr.onload = () => resolve(xhr);
      xhr.onerror = () =>
        reject(new CdsClientError(0, `Network error calling ${url}`, xhr.responseText));
      xhr.send(body);
    });
  }
  //#endregion
}

function qualifyAction(actionName: string): string {
  return actionName.includes(".") ? actionName : `Microsoft.Dynamics.CRM.${actionName}`;
}

/** Collects an execute request's own parameter values, excluding getMetadata. */
function collectExecuteParameters(request: IWebApiRequest): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const key of Object.keys(request)) {
    if (key === "getMetadata") {
      continue;
    }
    parameters[key] = (request as Record<string, unknown>)[key];
  }
  return parameters;
}

/** Serializes a function parameter value for the OData alias query syntax. */
function formatFunctionParameterValue(value: unknown): string {
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Builds the OData function-call suffix: a parameter signature plus alias
 * values, for example "(Name=@p1)?@p1='Contoso'". Empty params yield "()".
 */
function buildFunctionParameters(parameters: Record<string, unknown>): string {
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return "()";
  }
  const signature = names.map((name, index) => `${name}=@p${index + 1}`).join(",");
  const query = names
    .map(
      (name, index) =>
        `@p${index + 1}=${encodeURIComponent(formatFunctionParameterValue(parameters[name]))}`
    )
    .join("&");
  return `(${signature})?${query}`;
}

/**
 * Builds the kit IExecuteResponse from a raw status and body. Shared by the
 * cds-client path and the modern adapter (which reads the native Response body
 * once and feeds it here), so every host returns an identical response object:
 * re-callable json/text, and ok=false on an HTTP error rather than a throw.
 */
export function makeExecuteResponse(
  status: number,
  statusText: string,
  text: string
): IExecuteResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => (text ? (JSON.parse(text) as unknown) : undefined),
    text: async () => text,
  };
}

function parseCollection(json: string): IRetrieveMultipleResult {
  const payload = JSON.parse(json) as {
    value?: Array<Record<string, unknown>>;
    "@odata.nextLink"?: string;
    "@odata.count"?: number;
    "@Microsoft.Dynamics.CRM.totalrecordcount"?: number;
    "@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded"?: boolean;
    "@Microsoft.Dynamics.CRM.morerecords"?: boolean;
    "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"?: string;
  };
  const result: IRetrieveMultipleResult = {
    entities: payload.value ?? [],
    nextLink: payload["@odata.nextLink"],
  };
  // FetchXML paging annotations, total via returntotalrecordcount, or
  // OData $count; more-records + cookie for sequential paging.
  const total =
    payload["@Microsoft.Dynamics.CRM.totalrecordcount"] ?? payload["@odata.count"];
  if (typeof total === "number" && total >= 0) {
    result.totalRecordCount = total;
  }
  if (payload["@Microsoft.Dynamics.CRM.totalrecordcountlimitexceeded"]) {
    result.totalRecordCountLimitExceeded = true;
  }
  if (payload["@Microsoft.Dynamics.CRM.morerecords"] !== undefined) {
    result.moreRecords = !!payload["@Microsoft.Dynamics.CRM.morerecords"];
  }
  if (payload["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"]) {
    result.pagingCookie = payload["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"];
  }
  return result;
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
