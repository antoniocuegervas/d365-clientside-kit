import type {
  IAttributeMetadata,
  IEntityMetadata,
  IViewDefinition,
  IViewModelContext,
} from "../../shared/context/IViewModelContext";
import type { IRetrieveMultipleResult } from "../../shared/data/CdsClient";

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

  const nextQueryResult = (entity: string): IRetrieveMultipleResult => {
    const queue = queryQueues.get(entity);
    if (queue && queue.length > 0) {
      return queue.length === 1 ? queue[0] : queue.shift()!;
    }
    return { entities: [] };
  };

  const context: IViewModelContext = {
    clientUrl: "https://fake.crm.dynamics.com",
    user: { id: "00000000-0000-0000-0000-0000000000aa", name: "Fake User" },
    orgVersion: "9.2.0.0",
    isLegacy: false,
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
    },
    utils: {
      alert: (message) => record("alert", message),
    },
  };

  return { context, calls };
}
