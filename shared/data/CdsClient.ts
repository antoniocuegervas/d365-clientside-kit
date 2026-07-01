import type {
  IChangeSetRequest,
  IChangeSetResponse,
  IExecuteResponse,
  IWebApiRequest,
} from "../context/IViewModelContext";
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
  async updateRecord(
    entitySet: string,
    id: string,
    data: Record<string, unknown>,
    ifMatch?: string
  ): Promise<void> {
    await this.request(
      "PATCH",
      `${this.apiUrl}${entitySet}(${normalizeGuid(id)})`,
      JSON.stringify(data),
      ifMatch ? { "If-Match": ifMatch } : undefined
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
    return this.retrieveMultipleByUrl(`${this.apiUrl}${entitySet}${query ?? ""}`, maxPageSize);
  }

  /**
   * Follows an @odata.nextLink (or any absolute Web API collection URL). Pass the
   * same `maxPageSize` used for the first page. Server-side paging is driven by
   * the odata.maxpagesize preference, NOT by $top (which caps the result and
   * suppresses @odata.nextLink), and the nextLink carries only the position
   * cookie, not the page size. The preference has to be re-sent on every page;
   * skip it and the server falls back to its default page size and returns far
   * more rows than the page asked for.
   */
  async retrieveMultipleByUrl(
    url: string,
    maxPageSize?: number
  ): Promise<IRetrieveMultipleResult> {
    const extraHeaders =
      maxPageSize !== undefined ? { Prefer: `odata.maxpagesize=${maxPageSize}` } : undefined;
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
    // The multipart response wraps exactly one part: parse it and read its body.
    const [part] = parseBatchResponse(response.responseText);
    if (!part) {
      throw new CdsClientError(response.status, "Malformed $batch response", response.responseText);
    }
    return parseCollection(part.body);
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
  async executeClassicWorkflow(workflowId: string, recordId: string): Promise<unknown> {
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

  /**
   * Executes several requests in one round-trip, mirroring `executeMultiple`.
   * Each operation is sent as an independent top-level part of a single $batch,
   * so one failing does not roll the others back. This matches native
   * `Xrm.WebApi.online.executeMultiple` given a flat array of requests; the
   * native transactional form (a change set that rolls back as a unit) takes a
   * nested array, which the kit's flat `IWebApiRequest[]` does not express.
   * Responses come back in request order, each with its own `ok`/status.
   */
  async executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]> {
    if (requests.length === 0) {
      return [];
    }
    const boundary = LibraryUtils.newBatchBoundary();
    const body = this.buildBatchBody(requests, boundary);
    // send (not request): the $batch envelope returns 200 even when individual
    // operations fail, so a non-2xx here is a transport/protocol failure, while
    // each operation's real outcome rides its own part status.
    const response = await this.send("POST", `${this.apiUrl}$batch`, body, {
      "Content-Type": `multipart/mixed;boundary=${boundary}`,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new CdsClientError(response.status, extractErrorMessage(response), response.responseText);
    }
    return parseBatchResponse(response.responseText).map((part) =>
      makeExecuteResponse(part.status, part.statusText, part.body)
    );
  }

  /**
   * Commits several writes as ONE transactional change set, the transactional
   * counterpart to the flat {@link executeMultiple}. Emits a single $batch with a
   * single change-set boundary, so every operation commits together or rolls
   * back together. Content-id references ("$1", the 1-based request position) let
   * a later operation bind to a record created earlier in the same change set,
   * either as the PATCH/DELETE target or inside an `@odata.bind` value. Returns
   * one result per request in order, carrying the new id for each create.
   *
   * Unlike the flat batch (which returns 200 even when an operation fails), a
   * failing change set comes back non-2xx, so a single status check is the
   * all-or-nothing signal; on success every part is parsed for its created id.
   */
  async executeChangeSet(requests: IChangeSetRequest[]): Promise<IChangeSetResponse[]> {
    if (requests.length === 0) {
      return [];
    }
    const batchBoundary = LibraryUtils.newBatchBoundary();
    // A distinct, conventionally-prefixed boundary for the nested change set.
    const changeSetBoundary = LibraryUtils.newBatchBoundary().replace(/^batch_/, "changeset_");
    const body = this.buildChangeSetBody(requests, batchBoundary, changeSetBoundary);
    // send (not request) so the raw status is inspected directly: a successful
    // change set is 2xx, a rolled-back one is non-2xx with the failing op's error.
    const response = await this.send("POST", `${this.apiUrl}$batch`, body, {
      "Content-Type": `multipart/mixed;boundary=${batchBoundary}`,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new CdsClientError(response.status, extractErrorMessage(response), response.responseText);
    }
    return mapChangeSetResponses(requests, response.responseText);
  }

  /**
   * Encodes a set of change-set requests as a $batch carrying one change set:
   * an outer batch part whose body is a nested multipart/mixed change set, each
   * operation tagged with a 1-based Content-ID so later operations can reference
   * it as "$N".
   */
  private buildChangeSetBody(
    requests: IChangeSetRequest[],
    batchBoundary: string,
    changeSetBoundary: string
  ): string {
    const lines: string[] = [
      `--${batchBoundary}`,
      `Content-Type: multipart/mixed;boundary=${changeSetBoundary}`,
      "",
    ];
    requests.forEach((request, index) => {
      const contentId = index + 1;
      lines.push(
        `--${changeSetBoundary}`,
        "Content-Type: application/http",
        "Content-Transfer-Encoding: binary",
        `Content-ID: ${contentId}`,
        "",
        `${request.method} ${this.changeSetOperationUrl(request)} HTTP/1.1`,
        "Content-Type: application/json;type=entry",
        "",
        request.data !== undefined ? JSON.stringify(request.data) : ""
      );
    });
    lines.push(`--${changeSetBoundary}--`, `--${batchBoundary}--`, "");
    return lines.join("\r\n");
  }

  /**
   * Builds the request URL for one change-set operation. A create targets the
   * entity set; an update/delete targets a record by id, OR, when the id is a
   * content-id reference ("$1"), the prior operation's result directly.
   */
  private changeSetOperationUrl(request: IChangeSetRequest): string {
    const entitySet = LibraryUtils.entitySetName(request.entityLogicalName);
    if (request.method === "POST") {
      return `${this.apiUrl}${entitySet}`;
    }
    const id = request.id ?? "";
    if (id.startsWith("$")) {
      // Reference a record created earlier in the same change set by content id.
      return id;
    }
    return `${this.apiUrl}${entitySet}(${normalizeGuid(id)})`;
  }

  /** Encodes a set of execute requests as a multipart/mixed $batch body. */
  private buildBatchBody(requests: IWebApiRequest[], boundary: string): string {
    const lines: string[] = [];
    for (const request of requests) {
      const { method, url, body } = this.buildExecuteRequest(request);
      lines.push(
        `--${boundary}`,
        "Content-Type: application/http",
        "Content-Transfer-Encoding: binary",
        "",
        `${method} ${url} HTTP/1.1`,
        "Accept: application/json"
      );
      if (body !== undefined) {
        lines.push("Content-Type: application/json; charset=utf-8");
      }
      lines.push("", body ?? "");
    }
    lines.push(`--${boundary}--`, "");
    return lines.join("\r\n");
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
    // Single quotes are doubled per OData string-literal rules so a value
    // containing one cannot break out of (or inject into) the query.
    return `'${LibraryUtils.escapeODataString(value)}'`;
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

/** One operation's outcome, parsed from a multipart/mixed $batch response. */
interface IBatchResponsePart {
  status: number;
  statusText: string;
  body: string;
}

/**
 * Parses a multipart/mixed $batch response into its parts, in request order.
 * The boundary is read from the response's own opening delimiter (its first
 * line), so this needs no Content-Type header and serves both the single-GET
 * FetchXML fallback and the multi-operation executeMultiple batch. Each part
 * wraps an application/http response: a status line, inner headers, a blank
 * line, then the body. Segments without a status line (preamble, the closing
 * `--boundary--`) are skipped.
 */
function parseBatchResponse(responseText: string): IBatchResponsePart[] {
  const text = responseText.replace(/^\s+/, "");
  const delimiter = /^(--\S+?)(?:--)?\s*$/m.exec(text.split(/\r?\n/, 1)[0] ?? "")?.[1];
  if (!delimiter) {
    return [];
  }
  const parts: IBatchResponsePart[] = [];
  for (const segment of text.split(delimiter)) {
    const status = /HTTP\/[\d.]+ (\d{3})([^\r\n]*)/.exec(segment);
    if (!status) {
      continue;
    }
    parts.push({
      status: Number(status[1]),
      statusText: status[2].trim(),
      body: bodyAfterHeaders(segment.slice(status.index)),
    });
  }
  return parts;
}

/**
 * Maps a successful change-set response back to one result per request. The
 * response is a nested multipart (the change set inside the batch); each
 * operation part carries its Content-ID and, for a create, an OData-EntityId
 * header with the new record's URL. Results are returned in request order, with
 * the created id filled in for each POST.
 */
function mapChangeSetResponses(
  requests: IChangeSetRequest[],
  responseText: string
): IChangeSetResponse[] {
  const idByContentId = new Map<number, string>();
  // Split on every boundary delimiter (outer batch and inner change set); a
  // segment is an operation only when it carries a status line.
  for (const segment of responseText.split(/\r?\n--/)) {
    if (!/HTTP\/[\d.]+\s+\d{3}/.test(segment)) {
      continue;
    }
    const contentId = /Content-ID:\s*(\d+)/i.exec(segment)?.[1];
    const entityId = /OData-EntityId:\s*(\S+)/i.exec(segment)?.[1];
    if (contentId && entityId) {
      const guid = /\(([^)]+)\)/.exec(entityId)?.[1];
      if (guid) {
        idByContentId.set(Number(contentId), normalizeGuid(guid));
      }
    }
  }
  return requests.map((request, index) => ({
    entityType: request.entityLogicalName,
    id: idByContentId.get(index + 1),
  }));
}

/** Returns the body after the blank line that ends an HTTP part's headers. */
function bodyAfterHeaders(httpResponse: string): string {
  const separator = /\r?\n\r?\n/.exec(httpResponse);
  return separator ? httpResponse.slice(separator.index + separator[0].length).trim() : "";
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
