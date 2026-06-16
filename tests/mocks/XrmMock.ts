/**
 * Reusable Xrm mocks for unit and smoke tests, modern (v9.2+/UCI) and
 * legacy CRM 8.x shapes. Plain recording arrays, no jest dependency, so the
 * same mocks drive Jest unit tests and jsdom bundle smoke tests.
 */

export interface IXrmMockCall {
  api: string;
  args: unknown[];
}

export interface IMockFormRecord {
  id: string;
  entityName: string;
  attributes?: Record<string, unknown>;
}

interface ICommonMockOptions {
  clientUrl?: string;
  userId?: string;
  userName?: string;
  version?: string;
  /** When present, the mock exposes an Xrm.Page with this record behind it. */
  formRecord?: IMockFormRecord;
  /** What openConfirmDialog/confirmDialog should answer. Default true. */
  confirmResult?: boolean;
  /** Records the native lookup dialog (Xrm.Utility.lookupObjects) resolves with. */
  lookupResult?: Array<{ id: string; name?: string; entityType: string }>;
  /** User UI language LCID surfaced on userSettings (G-06). */
  languageId?: number;
  /** Raw host date-format object surfaced on userSettings.dateFormattingInfo (G-06). */
  dateFormattingInfo?: Record<string, unknown>;
}

export interface IModernXrmMockOptions extends ICommonMockOptions {
  /** Scripted Web API responses; defaults return empty results. */
  webApi?: Partial<IMockWebApi>;
}

export interface IMockWebApi {
  createRecord(entity: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<unknown>;
  deleteRecord(entity: string, id: string): Promise<unknown>;
  retrieveRecord(entity: string, id: string, options?: string): Promise<Record<string, unknown>>;
  retrieveMultipleRecords(
    entity: string,
    options?: string
  ): Promise<{ entities: Array<Record<string, unknown>>; nextLink?: string }>;
}

function makePageMock(formRecord: IMockFormRecord | undefined, calls: IXrmMockCall[]) {
  if (!formRecord) {
    return undefined;
  }
  const values = new Map(Object.entries(formRecord.attributes ?? {}));
  return {
    data: {
      entity: {
        getId: () => `{${formRecord.id.toUpperCase()}}`,
        getEntityName: () => formRecord.entityName,
        attributes: {
          get: (name: string) =>
            values.has(name) || formRecord.attributes
              ? {
                  getValue: () => values.get(name) ?? null,
                  setValue: (value: unknown) => {
                    calls.push({ api: `attribute.setValue:${name}`, args: [value] });
                    values.set(name, value);
                  },
                }
              : null,
        },
      },
    },
  };
}

/** Modern UCI host: Xrm.WebApi + Xrm.Navigation + getGlobalContext. */
export function createModernXrmMock(options: IModernXrmMockOptions = {}) {
  const calls: IXrmMockCall[] = [];
  const record = (api: string, ...args: unknown[]) => calls.push({ api, args });

  const clientUrl = options.clientUrl ?? "https://mock.crm.dynamics.com";
  const defaults: IMockWebApi = {
    createRecord: async () => ({ id: "00000000-0000-0000-0000-000000000001" }),
    updateRecord: async () => ({}),
    deleteRecord: async () => ({}),
    retrieveRecord: async () => ({}),
    retrieveMultipleRecords: async () => ({ entities: [] }),
  };
  const webApi = { ...defaults, ...options.webApi };

  const xrm = {
    WebApi: {
      createRecord: (entity: string, data: Record<string, unknown>) => {
        record("WebApi.createRecord", entity, data);
        return webApi.createRecord(entity, data);
      },
      updateRecord: (entity: string, id: string, data: Record<string, unknown>) => {
        record("WebApi.updateRecord", entity, id, data);
        return webApi.updateRecord(entity, id, data);
      },
      deleteRecord: (entity: string, id: string) => {
        record("WebApi.deleteRecord", entity, id);
        return webApi.deleteRecord(entity, id);
      },
      retrieveRecord: (entity: string, id: string, opts?: string) => {
        record("WebApi.retrieveRecord", entity, id, opts);
        return webApi.retrieveRecord(entity, id, opts);
      },
      retrieveMultipleRecords: (entity: string, opts?: string) => {
        record("WebApi.retrieveMultipleRecords", entity, opts);
        return webApi.retrieveMultipleRecords(entity, opts);
      },
    },
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => clientUrl,
        getVersion: () => options.version ?? "9.2.24.100",
        userSettings: {
          userId: `{${(options.userId ?? "aaaaaaaa-0000-0000-0000-000000000001").toUpperCase()}}`,
          userName: options.userName ?? "Mock User",
          languageId: options.languageId,
          dateFormattingInfo: options.dateFormattingInfo,
        },
      }),
      lookupObjects: async (lookupOptions: unknown) => {
        record("Utility.lookupObjects", lookupOptions);
        return options.lookupResult ?? [];
      },
    },
    Navigation: {
      openForm: async (formOptions: unknown) => {
        record("Navigation.openForm", formOptions);
        return {};
      },
      navigateTo: async (pageInput: unknown, navigationOptions: unknown) => {
        record("Navigation.navigateTo", pageInput, navigationOptions);
        return {};
      },
      openAlertDialog: async (strings: unknown) => {
        record("Navigation.openAlertDialog", strings);
        return {};
      },
      openConfirmDialog: async (strings: unknown) => {
        record("Navigation.openConfirmDialog", strings);
        return { confirmed: options.confirmResult ?? true };
      },
      openUrl: (url: string) => record("Navigation.openUrl", url),
    },
    Page: makePageMock(options.formRecord, calls),
  };

  return { xrm, calls };
}

/** Legacy CRM 8.x host: no Xrm.WebApi; deprecated Xrm.Utility navigation. */
export function createV8XrmMock(options: ICommonMockOptions = {}) {
  const calls: IXrmMockCall[] = [];
  const record = (api: string, ...args: unknown[]) => calls.push({ api, args });

  const xrm = {
    Page: {
      context: {
        getClientUrl: () => options.clientUrl ?? "https://crm.onprem.contoso.com/org",
        getUserId: () => `{${(options.userId ?? "bbbbbbbb-0000-0000-0000-000000000002").toUpperCase()}}`,
        getUserName: () => options.userName ?? "Legacy User",
        getVersion: options.version ? () => options.version! : undefined,
      },
      ...makePageMock(options.formRecord, calls),
    },
    Utility: {
      openEntityForm: (name: string, id?: string) => record("Utility.openEntityForm", name, id),
      alertDialog: (message: string, onClose?: () => void) => {
        record("Utility.alertDialog", message);
        onClose?.();
      },
      confirmDialog: (message: string, yes?: () => void, no?: () => void) => {
        record("Utility.confirmDialog", message);
        if (options.confirmResult ?? true) {
          yes?.();
        } else {
          no?.();
        }
      },
      openWebResource: (name: string, data?: string, width?: number, height?: number) =>
        record("Utility.openWebResource", name, data, width, height),
      lookupObjects: async (lookupOptions: unknown) => {
        record("Utility.lookupObjects", lookupOptions);
        return options.lookupResult ?? [];
      },
    },
  };

  return { xrm, calls };
}
