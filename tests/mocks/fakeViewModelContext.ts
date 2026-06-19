import type {
  IAppProperties,
  IAttributeMetadata,
  ICurrencyInfo,
  IEntityMetadata,
  IExecuteResponse,
  IFileDetails,
  IFormattingInfo,
  IGeoPosition,
  IViewDefinition,
  IViewModelContext,
} from "../../shared/context/IViewModelContext";
import type { IRetrieveMultipleResult } from "../../shared/data/CdsClient";
import type { IEntityReference } from "../../shared/utils/EntityModel";

/**
 * In-memory IViewModelContext stub for smart-control and ViewModel tests , 
 * no Xrm, no XHR. Script attribute metadata and query results per test.
 */
export interface IFakeContextOptions {
  attributes?: Record<string, Partial<IAttributeMetadata>>; // key: "entity.attribute"
  entities?: Record<string, Partial<IEntityMetadata>>;
  views?: Record<string, Partial<IViewDefinition>>; // key: savedQueryId or "default:entity"
  /** Scripted results returned by retrieveMultipleRecords/fetch, FIFO per entity. */
  queryResults?: Record<string, Array<IRetrieveMultipleResult>>;
  /** Scripted pages returned by retrieveMultipleByUrl (nextLink paging), FIFO. */
  pageResults?: Array<IRetrieveMultipleResult>;
  /** Scripted responses returned by executeAction, keyed by action name. */
  actionResults?: Record<string, unknown>;
  /** Scripted bodies returned by execute/executeMultiple, keyed by operationName. */
  executeResults?: Record<string, unknown>;
  /** Records the native lookup dialog resolves with. Default empty. */
  lookupResults?: IEntityReference[];
  /** Locale formatting returned by getFormatting(). Default empty (controls use defaults). */
  formatting?: IFormattingInfo;
  /** User UI language LCID surfaced on context.user.languageId. */
  languageId?: number;
  /** RTL flag surfaced on context.user.isRTL. */
  isRTL?: boolean;
  /** Timezone offset surfaced on context.user.timeZoneOffsetMinutes. */
  timeZoneOffsetMinutes?: number;
  /** Localized strings returned by utils.getResourceString, keyed by key. */
  resourceStrings?: Record<string, string>;
  /** Status codes returned by utils.getAllowedStatusTransitions. */
  allowedStatusTransitions?: number[];
  /** Form factor returned by client.getFormFactor. Default 1 (Desktop). */
  formFactor?: number;
  /** Client kind returned by client.getClient. */
  clientKind?: string;
  /** Offline flag returned by client.isOffline. */
  isOffline?: boolean;
  /** Network-available flag returned by client.isNetworkAvailable. Default true. */
  isNetworkAvailable?: boolean;
  /** File returned by device capture methods. */
  deviceFile?: IFileDetails | null;
  /** Files returned by device.pickFile. */
  pickedFiles?: IFileDetails[];
  /** Barcode returned by device.getBarcodeValue. */
  barcodeValue?: string | null;
  /** Position returned by device.getCurrentPosition. */
  geoPosition?: IGeoPosition | null;
  /** Currency info returned by getCurrencySymbol, keyed by currency id. */
  currencies?: Record<string, ICurrencyInfo>;
  /** Icon URLs returned by getEntityIconUrl, keyed by entity logical name. */
  entityIcons?: Record<string, string>;
  /** Org unique name surfaced on globalContext.organizationSettings. */
  orgUniqueName?: string;
  /** Org id surfaced on globalContext.organizationSettings. */
  organizationId?: string;
  /** Auto-save flag surfaced on globalContext.organizationSettings. Default true. */
  isAutoSaveEnabled?: boolean;
  /** Security role ids surfaced on globalContext.userSettings.securityRoles. */
  securityRoles?: string[];
  /** App properties returned by globalContext.getCurrentAppProperties. */
  appProperties?: IAppProperties;
  /** Artificial async delay (ms) to exercise loading states. */
  delayMs?: number;
}

export interface IFakeContextCall {
  api: string;
  args: unknown[];
}

export function createFakeViewModelContext(options: IFakeContextOptions = {}): {
  context: IViewModelContext;
  calls: IFakeContextCall[];
} {
  const calls: IFakeContextCall[] = [];
  const record = (api: string, ...args: unknown[]) => calls.push({ api, args });
  const maybeDelay = async () => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  };
  const queryQueues = new Map<string, Array<IRetrieveMultipleResult>>(
    Object.entries(options.queryResults ?? {})
  );
  const pageQueue = [...(options.pageResults ?? [])];

  const makeExecuteResponse = (body: unknown): IExecuteResponse => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });

  const nextQueryResult = (entity: string): IRetrieveMultipleResult => {
    const queue = queryQueues.get(entity);
    if (queue && queue.length > 0) {
      return queue.length === 1 ? queue[0] : queue.shift()!;
    }
    return { entities: [] };
  };

  const context: IViewModelContext = {
    clientUrl: "https://fake.crm.dynamics.com",
    user: {
      id: "00000000-0000-0000-0000-0000000000aa",
      name: "Fake User",
      languageId: options.languageId,
      isRTL: options.isRTL,
      timeZoneOffsetMinutes: options.timeZoneOffsetMinutes,
    },
    orgVersion: "9.2.0.0",
    isLegacy: false,
    getFormatting: async () => {
      record("getFormatting");
      await maybeDelay();
      return options.formatting ?? {};
    },
    webAPI: {
      createRecord: async (entity, data) => {
        record("createRecord", entity, data);
        await maybeDelay();
        return { entityType: entity, id: "00000000-0000-0000-0000-0000000000cc" };
      },
      updateRecord: async (entity, id, data) => {
        record("updateRecord", entity, id, data);
        await maybeDelay();
        return { entityType: entity, id };
      },
      deleteRecord: async (entity, id) => {
        record("deleteRecord", entity, id);
        await maybeDelay();
        return { entityType: entity, id };
      },
      retrieveRecord: async (entity, id, opts) => {
        record("retrieveRecord", entity, id, opts);
        await maybeDelay();
        return {};
      },
      retrieveMultipleRecords: async (entity, opts, maxPageSize) => {
        record("retrieveMultipleRecords", entity, opts, maxPageSize);
        await maybeDelay();
        return nextQueryResult(entity);
      },
      fetch: async (entity, fetchXml) => {
        record("fetch", entity, fetchXml);
        await maybeDelay();
        return nextQueryResult(entity);
      },
      fetchPage: async (entity, fetchXml) => {
        record("fetchPage", entity, fetchXml);
        await maybeDelay();
        return nextQueryResult(entity);
      },
      retrieveMultipleByUrl: async (url) => {
        record("retrieveMultipleByUrl", url);
        await maybeDelay();
        return pageQueue.shift() ?? { entities: [] };
      },
      executeAction: async (actionName, parameters, boundTo) => {
        record("executeAction", actionName, parameters, boundTo);
        await maybeDelay();
        return options.actionResults?.[actionName];
      },
      executeWorkflow: async (workflowId, recordId) => {
        record("executeWorkflow", workflowId, recordId);
        await maybeDelay();
        return undefined;
      },
      execute: async (request) => {
        const metadata = request.getMetadata();
        record("execute", metadata);
        await maybeDelay();
        return makeExecuteResponse(options.executeResults?.[metadata.operationName ?? ""]);
      },
      executeMultiple: async (requests) => {
        record("executeMultiple", requests.length);
        await maybeDelay();
        return requests.map((request) =>
          makeExecuteResponse(options.executeResults?.[request.getMetadata().operationName ?? ""])
        );
      },
    },
    metadata: {
      getEntityMetadata: async (entity) => {
        record("getEntityMetadata", entity);
        await maybeDelay();
        const overrides = options.entities?.[entity] ?? {};
        return {
          logicalName: entity,
          displayName: entity,
          entitySetName: `${entity}s`,
          primaryIdAttribute: `${entity}id`,
          primaryNameAttribute: "name",
          ...overrides,
        };
      },
      getAttributeMetadata: async (entity, attribute) => {
        record("getAttributeMetadata", entity, attribute);
        await maybeDelay();
        const overrides = options.attributes?.[`${entity}.${attribute}`];
        if (!overrides) {
          throw new Error(`No fake metadata scripted for ${entity}.${attribute}`);
        }
        return {
          logicalName: attribute,
          displayName: attribute,
          kind: "text",
          required: false,
          ...overrides,
        };
      },
      getView: async (entity, savedQueryId) => {
        record("getView", entity, savedQueryId);
        await maybeDelay();
        const key = savedQueryId ?? `default:${entity}`;
        const overrides = options.views?.[key] ?? {};
        return {
          id: savedQueryId ?? "00000000-0000-0000-0000-0000000000dd",
          name: "Fake View",
          entityLogicalName: entity,
          fetchXml: `<fetch><entity name='${entity}'/></fetch>`,
          layoutXml: "",
          columns: [],
          ...overrides,
        };
      },
      getViewByName: async (entity, viewName) => {
        record("getViewByName", entity, viewName);
        await maybeDelay();
        const overrides = options.views?.[`name:${entity}:${viewName}`] ?? {};
        return {
          id: "00000000-0000-0000-0000-0000000000dd",
          name: viewName,
          entityLogicalName: entity,
          fetchXml: `<fetch><entity name='${entity}'/></fetch>`,
          layoutXml: "",
          columns: [],
          ...overrides,
        };
      },
      getCurrencySymbol: async (transactionCurrencyId) => {
        record("getCurrencySymbol", transactionCurrencyId);
        await maybeDelay();
        return options.currencies?.[transactionCurrencyId] ?? { symbol: "$" };
      },
      getEntityIconUrl: async (entity) => {
        record("getEntityIconUrl", entity);
        await maybeDelay();
        return options.entityIcons?.[entity];
      },
    },
    navigation: {
      openForm: async (...args) => {
        record("openForm", ...args);
      },
      openClientUI: async (...args) => {
        record("openClientUI", ...args);
      },
      openAlertDialog: async (...args) => {
        record("openAlertDialog", ...args);
      },
      openConfirmDialog: async (...args) => {
        record("openConfirmDialog", ...args);
        return true;
      },
      openUrl: (...args) => record("openUrl", ...args),
      lookupObjects: async (lookupOptions) => {
        record("lookupObjects", lookupOptions);
        await maybeDelay();
        return options.lookupResults ?? [];
      },
      openErrorDialog: async (...args) => {
        record("openErrorDialog", ...args);
      },
      openFile: async (...args) => {
        record("openFile", ...args);
      },
      navigateTo: async (...args) => {
        record("navigateTo", ...args);
      },
      openWebResource: (...args) => record("openWebResource", ...args),
    },
    globalContext: {
      clientUrl: "https://fake.crm.dynamics.com",
      organizationSettings: {
        organizationId: options.organizationId ?? "00000000-0000-0000-0000-0000000000ff",
        uniqueName: options.orgUniqueName ?? "fakeorg",
        languageId: options.languageId,
        isAutoSaveEnabled: options.isAutoSaveEnabled ?? true,
      },
      userSettings: {
        userId: "00000000-0000-0000-0000-0000000000aa",
        userName: "Fake User",
        languageId: options.languageId,
        isRTL: options.isRTL,
        roles: [],
        securityRoles: options.securityRoles ?? [],
        getTimeZoneOffsetMinutes: () => options.timeZoneOffsetMinutes ?? 0,
      },
      getVersion: () => "9.2.0.0",
      prependOrgName: (path) => `/${options.orgUniqueName ?? "fakeorg"}${path}`,
      getCurrentAppProperties: async () => {
        record("getCurrentAppProperties");
        return options.appProperties ?? {};
      },
      getCurrentAppName: async () => options.appProperties?.uniqueName ?? "fakeapp",
      getCurrentAppUrl: () => options.appProperties?.url ?? "",
    },
    utils: {
      alert: (message) => record("alert", message),
      getResourceString: (webResourceName, key) => {
        record("getResourceString", webResourceName, key);
        return options.resourceStrings?.[key];
      },
      showProgressIndicator: (message) => record("showProgressIndicator", message),
      closeProgressIndicator: () => record("closeProgressIndicator"),
      getAllowedStatusTransitions: async (entityLogicalName, stateCode) => {
        record("getAllowedStatusTransitions", entityLogicalName, stateCode);
        await maybeDelay();
        return options.allowedStatusTransitions ?? [];
      },
      refreshParentGrid: (lookupValue) => record("refreshParentGrid", lookupValue),
    },
    client: {
      getFormFactor: () => {
        record("getFormFactor");
        return (options.formFactor ?? 1) as 0 | 1 | 2 | 3;
      },
      getClient: () => options.clientKind ?? "Web",
      getClientState: () => "Online",
      isOffline: () => options.isOffline ?? false,
      isNetworkAvailable: () => options.isNetworkAvailable ?? true,
    },
    device: {
      captureImage: async (deviceOptions) => {
        record("captureImage", deviceOptions);
        await maybeDelay();
        return options.deviceFile ?? null;
      },
      captureAudio: async () => {
        record("captureAudio");
        await maybeDelay();
        return options.deviceFile ?? null;
      },
      captureVideo: async () => {
        record("captureVideo");
        await maybeDelay();
        return options.deviceFile ?? null;
      },
      getBarcodeValue: async () => {
        record("getBarcodeValue");
        await maybeDelay();
        return options.barcodeValue ?? null;
      },
      getCurrentPosition: async () => {
        record("getCurrentPosition");
        await maybeDelay();
        return options.geoPosition ?? null;
      },
      pickFile: async (deviceOptions) => {
        record("pickFile", deviceOptions);
        await maybeDelay();
        return options.pickedFiles ?? [];
      },
    },
  };

  return { context, calls };
}
