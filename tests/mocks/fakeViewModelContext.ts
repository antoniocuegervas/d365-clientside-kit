import type {
  IAttributeMetadata,
  ICurrencyInfo,
  IEntityMetadata,
  IFormattingInfo,
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
  /** Records the native lookup dialog resolves with. Default empty. */
  lookupResults?: IEntityReference[];
  /** Locale formatting returned by getFormatting(). Default empty (controls use defaults). */
  formatting?: IFormattingInfo;
  /** User UI language LCID surfaced on context.user.languageId. */
  languageId?: number;
  /** Currency info returned by getCurrencySymbol, keyed by currency id. */
  currencies?: Record<string, ICurrencyInfo>;
  /** Icon URLs returned by getEntityIconUrl, keyed by entity logical name. */
  entityIcons?: Record<string, string>;
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
        return { id: "00000000-0000-0000-0000-0000000000cc" };
      },
      updateRecord: async (entity, id, data) => {
        record("updateRecord", entity, id, data);
        await maybeDelay();
      },
      deleteRecord: async (entity, id) => {
        record("deleteRecord", entity, id);
        await maybeDelay();
      },
      retrieveRecord: async (entity, id, opts) => {
        record("retrieveRecord", entity, id, opts);
        await maybeDelay();
        return {};
      },
      retrieveMultipleRecords: async (entity, opts) => {
        record("retrieveMultipleRecords", entity, opts);
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
    utils: {
      alert: (message) => record("alert", message),
    },
  };

  return { context, calls };
}
