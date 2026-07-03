import type {
  IActivityTypeInfo,
  IAppProperties,
  ICurrencyInfo,
  IEntityMetadata,
  IExecuteResponse,
  IFileDetails,
  IFormattingInfo,
  IGeoPosition,
  IViewDefinition,
  IViewModelContext,
} from "../../shared/context/IViewModelContext";
import { makeEntityMetadataMock } from "./XrmMock";
import {
  buildFormContext,
  type IFormContext,
  type IHostFormContext,
} from "../../shared/context/formContextSurface";
import { XrmPageFormAccess } from "../../shared/context/hostSurface";
import type { IFormAccess } from "../../shared/context/IViewModelContext";
import type { IRetrieveMultipleResult } from "../../shared/data/CdsClient";
import type { IEntityReference } from "../../shared/utils/EntityModel";

/**
 * In-memory IViewModelContext stub for smart-control and ViewModel tests , 
 * no Xrm, no XHR. Script attribute metadata and query results per test.
 */
/**
 * A scripted query failure: put one in a query queue and the matching
 * retrieveMultipleRecords/fetch/fetchPage call rejects with this message.
 */
export interface IFakeQueryFailure {
  failWith: string;
}

/** One scripted query outcome: a result to resolve or a failure to reject. */
export type FakeQueryOutcome = IRetrieveMultipleResult | IFakeQueryFailure;

export interface IFakeContextOptions {
  /**
   * Scripted attribute metadata, keyed "entity.attribute". Each value is the
   * PascalCase attributeDescriptor payload the standard shape carries (`Type`,
   * `DisplayName`, `MaxLength`, `OptionSet`, ...), exactly what a real host's
   * getEntityMetadata serves; LogicalName is filled from the key. An attribute
   * a test never scripted is simply absent from the resolved entity metadata,
   * like an attribute that does not exist on the entity.
   */
  attributes?: Record<string, Record<string, unknown>>;
  /** Entity-level overrides for utils.getEntityMetadata, keyed by entity. */
  entities?: Record<
    string,
    Partial<{
      displayName: string;
      entitySetName: string;
      primaryIdAttribute: string;
      primaryNameAttribute: string;
    }>
  >;
  views?: Record<string, Partial<IViewDefinition>>; // key: savedQueryId or "default:entity"
  /** Activity types returned by getActivityTypes. Default empty. */
  activityTypes?: IActivityTypeInfo[];
  /** Scripted results returned by retrieveMultipleRecords/fetch, FIFO per entity. */
  queryResults?: Record<string, Array<FakeQueryOutcome>>;
  /** Scripted pages returned by retrieveMultipleByUrl (nextLink paging), FIFO. */
  pageResults?: Array<IRetrieveMultipleResult>;
  /** Scripted responses returned by executeAction, keyed by action name. */
  actionResults?: Record<string, unknown>;
  /** Scripted bodies returned by execute/executeMultiple, keyed by operationName. */
  executeResults?: Record<string, unknown>;
  /** Scripted created ids returned by executeChangeSet, by request position. */
  changeSetIds?: Array<string | undefined>;
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
  /** Org pricing precision returned by getPricingDecimalPrecision. */
  pricingDecimalPrecision?: number;
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
  /**
   * When set, the fake exposes context.formContext (and the formAccess facade)
   * over a small in-memory record form built through the real builder.
   */
  formRecord?: {
    id?: string;
    entityName?: string;
    attributes?: Record<string, unknown>;
    formType?: number;
  };
  /** Artificial async delay (ms) to exercise loading states. */
  delayMs?: number;
  /**
   * Awaited before each retrieveMultipleRecords/fetch/fetchPage/
   * retrieveMultipleByUrl call returns. Lets a test hold individual responses
   * open (hand each call a deferred keyed by `index`, the 0-based call order)
   * so two requests overlap and resolve in a chosen order, the shape every
   * stale-response race test needs.
   */
  queryGate?: (call: { api: string; entity: string; index: number }) => Promise<void> | void;
}

/** Builds a minimal host form the real buildFormContext can wrap, for the fake. */
function makeFakeHostForm(form: NonNullable<IFakeContextOptions["formRecord"]>): IHostFormContext {
  const values = new Map(Object.entries(form.attributes ?? {}));
  const makeAttribute = (name: string) => ({
    getName: () => name,
    getValue: () => values.get(name) ?? null,
    setValue: (value: unknown) => void values.set(name, value),
    getAttributeType: () => "string",
    getRequiredLevel: () => "none",
    getIsDirty: () => false,
    controls: { get: () => null, getAll: () => [], forEach: () => undefined, getLength: () => 0 },
  });
  const host = {
    data: {
      entity: {
        getId: () => (form.id ? `{${form.id}}` : ""),
        getEntityName: () => form.entityName ?? "",
        getEntityReference: () => ({ id: form.id ?? "", entityType: form.entityName ?? "" }),
        getIsDirty: () => false,
        attributes: {
          get: (nameOrIndex: string | number) =>
            typeof nameOrIndex === "string" && (values.has(nameOrIndex) || form.attributes)
              ? makeAttribute(nameOrIndex)
              : null,
          getAll: () => [...values.keys()].map(makeAttribute),
          forEach: (cb: (item: unknown, index: number) => void) =>
            [...values.keys()].forEach((name, index) => cb(makeAttribute(name), index)),
          getLength: () => values.size,
        },
      },
      getIsDirty: () => false,
    },
    ui: { getFormType: () => form.formType ?? 2 },
  };
  return host as unknown as IHostFormContext;
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
  let queryIndex = 0;
  const maybeGate = async (api: string, entity: string) => {
    await options.queryGate?.({ api, entity, index: queryIndex++ });
  };
  const queryQueues = new Map<string, Array<FakeQueryOutcome>>(
    Object.entries(options.queryResults ?? {})
  );
  const pageQueue = [...(options.pageResults ?? [])];

  const formContext: IFormContext | undefined = options.formRecord
    ? buildFormContext(makeFakeHostForm(options.formRecord), "fake")
    : undefined;
  const formAccess: IFormAccess | undefined = formContext
    ? new XrmPageFormAccess(formContext, formContext)
    : undefined;

  const makeExecuteResponse = (body: unknown): IExecuteResponse => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });

  // The outcome is taken from the queue when the call DEPARTS (not when it
  // resolves), so a gated test that releases responses out of order still gets
  // each call's own scripted outcome, which is the whole point of overlapping.
  const takeQueryOutcome = (entity: string): FakeQueryOutcome => {
    const queue = queryQueues.get(entity);
    return queue && queue.length > 0
      ? queue.length === 1
        ? queue[0]
        : queue.shift()!
      : { entities: [] };
  };

  const settleQueryOutcome = (outcome: FakeQueryOutcome): IRetrieveMultipleResult => {
    if ("failWith" in outcome) {
      throw new Error(outcome.failWith);
    }
    return outcome;
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
    formContext,
    formAccess,
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
        const outcome = takeQueryOutcome(entity);
        await maybeDelay();
        await maybeGate("retrieveMultipleRecords", entity);
        return settleQueryOutcome(outcome);
      },
      fetch: async (entity, fetchXml) => {
        record("fetch", entity, fetchXml);
        const outcome = takeQueryOutcome(entity);
        await maybeDelay();
        await maybeGate("fetch", entity);
        return settleQueryOutcome(outcome);
      },
      fetchPage: async (entity, fetchXml) => {
        record("fetchPage", entity, fetchXml);
        const outcome = takeQueryOutcome(entity);
        await maybeDelay();
        await maybeGate("fetchPage", entity);
        return settleQueryOutcome(outcome);
      },
      retrieveMultipleByUrl: async (url, maxPageSize) => {
        record("retrieveMultipleByUrl", url, maxPageSize);
        await maybeDelay();
        await maybeGate("retrieveMultipleByUrl", "");
        return pageQueue.shift() ?? { entities: [] };
      },
      executeAction: async (actionName, parameters, boundTo) => {
        record("executeAction", actionName, parameters, boundTo);
        await maybeDelay();
        return options.actionResults?.[actionName];
      },
      executeClassicWorkflow: async (workflowId, recordId) => {
        record("executeClassicWorkflow", workflowId, recordId);
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
      executeChangeSet: async (requests) => {
        record("executeChangeSet", requests);
        await maybeDelay();
        // Mirror the platform's content-id behavior: each create yields a new id
        // a later request can have referenced. Scripted ids fall back to a stable
        // per-position guid so callers get a deterministic created id back.
        return requests.map((request, index) => ({
          entityType: request.entityLogicalName,
          id:
            request.method === "POST"
              ? options.changeSetIds?.[index] ??
                `00000000-0000-0000-0000-0000000000${String(index + 1).padStart(2, "0")}`
              : undefined,
        }));
      },
    },
    metadata: {
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
      getLookupView: async (entity) => {
        record("getLookupView", entity);
        await maybeDelay();
        const overrides = options.views?.[`lookup:${entity}`] ?? {};
        return {
          id: "00000000-0000-0000-0000-0000000000ee",
          name: "Lookup View",
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
      getActivityTypes: async () => {
        record("getActivityTypes");
        await maybeDelay();
        return options.activityTypes ?? [];
      },
      getCurrencySymbol: async (transactionCurrencyId) => {
        record("getCurrencySymbol", transactionCurrencyId);
        await maybeDelay();
        return options.currencies?.[transactionCurrencyId] ?? { symbol: "$" };
      },
      getPricingDecimalPrecision: async () => {
        record("getPricingDecimalPrecision");
        await maybeDelay();
        return options.pricingDecimalPrecision;
      },
      getEntityIconUrl: async (entity) => {
        record("getEntityIconUrl", entity);
        await maybeDelay();
        return options.entityIcons?.[entity];
      },
      clearCache: () => {
        record("metadata.clearCache");
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
      getEntityMetadata: async (entityName, attributes) => {
        record("utils.getEntityMetadata", entityName, attributes);
        await maybeDelay();
        // Assemble the standard shape from the scripted descriptors, exactly
        // what a real host serves: entity fields plus an ItemCollection of
        // attributeDescriptor items. Every descriptor scripted for the entity
        // is included (get() finds the requested ones), and an unscripted
        // attribute is simply absent, like a column that does not exist.
        const prefix = `${entityName}.`;
        const descriptors = Object.entries(options.attributes ?? {})
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, payload]) => ({
            LogicalName: key.slice(prefix.length),
            ...payload,
          }));
        return makeEntityMetadataMock({
          logicalName: entityName,
          ...options.entities?.[entityName],
          attributes: descriptors,
        }) as IEntityMetadata;
      },
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
