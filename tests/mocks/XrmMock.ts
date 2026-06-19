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
  /** User UI language LCID surfaced on userSettings. */
  languageId?: number;
  /** Raw host date-format object surfaced on userSettings.dateFormattingInfo. */
  dateFormattingInfo?: Record<string, unknown>;
  /** RTL flag on userSettings. */
  isRTL?: boolean;
  /** Timezone offset returned by userSettings.getTimeZoneOffsetMinutes. */
  timeZoneOffsetMinutes?: number;
  /** Form factor returned by client.getFormFactor. Default 1 (Desktop). */
  formFactor?: number;
  /** Client kind returned by client.getClient. */
  clientKind?: string;
  /** Offline flag returned by client.isOffline. */
  isOffline?: boolean;
  /** Network-available flag returned by client.isNetworkAvailable. Default true. */
  isNetworkAvailable?: boolean;
  /** Localized strings returned by Utility.getResourceString. */
  resourceStrings?: Record<string, string>;
  /** Status codes returned by Utility.getAllowedStatusTransitions. */
  allowedStatusTransitions?: number[];
  /** Barcode returned by Device.getBarcodeValue. */
  barcodeValue?: string;
  /** File returned by Device.captureImage. */
  deviceFile?: unknown;
  /** Org unique name (modern organizationSettings / legacy getOrgUniqueName). */
  orgUniqueName?: string;
  /** Org LCID (legacy getOrgLcid). */
  orgLcid?: number;
}

export interface IModernXrmMockOptions extends ICommonMockOptions {
  /** Scripted Web API responses; defaults return empty results. */
  webApi?: Partial<IMockWebApi>;
  /** Body returned by online.execute's response.json()/text(). */
  executeResponseBody?: unknown;
  /** HTTP status for online.execute's response. Default 200. */
  executeResponseStatus?: number;
  /** Org id surfaced on organizationSettings. */
  organizationId?: string;
  /** Auto-save flag surfaced on organizationSettings. */
  isAutoSaveEnabled?: boolean;
  /** Security role ids surfaced on userSettings.securityRoles. */
  securityRoles?: string[];
  /** Roles collection surfaced on userSettings.roles. */
  userRoles?: Array<{ id: string; name?: string; entityType: string }>;
  /** Properties returned by getCurrentAppProperties / getCurrentAppName / getCurrentAppUrl. */
  appProperties?: { appId?: string; uniqueName?: string; url?: string; displayName?: string };
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

/** A fetch-like ExecuteResponse stand-in for online.execute. */
function makeExecuteResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => body,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
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
      online: {
        execute: async (request: unknown) => {
          record("WebApi.online.execute", request);
          return makeExecuteResponse(options.executeResponseBody, options.executeResponseStatus);
        },
        executeMultiple: async (requests: unknown[]) => {
          record("WebApi.online.executeMultiple", requests);
          return (requests ?? []).map(() =>
            makeExecuteResponse(options.executeResponseBody, options.executeResponseStatus)
          );
        },
      },
    },
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => clientUrl,
        getVersion: () => options.version ?? "9.2.24.100",
        prependOrgName: (path: string) => `/${options.orgUniqueName ?? "mockorg"}${path}`,
        getCurrentAppProperties: async () => options.appProperties ?? {},
        getCurrentAppName: async () => options.appProperties?.uniqueName ?? "mockapp",
        getCurrentAppUrl: () => options.appProperties?.url ?? "",
        organizationSettings: {
          organizationId: options.organizationId ?? "00000000-0000-0000-0000-0000000000ff",
          uniqueName: options.orgUniqueName ?? "mockorg",
          languageId: options.languageId ?? 1033,
          isAutoSaveEnabled: options.isAutoSaveEnabled ?? true,
        },
        userSettings: {
          userId: `{${(options.userId ?? "aaaaaaaa-0000-0000-0000-000000000001").toUpperCase()}}`,
          userName: options.userName ?? "Mock User",
          languageId: options.languageId,
          dateFormattingInfo: options.dateFormattingInfo,
          isRTL: options.isRTL,
          securityRoles: options.securityRoles ?? [],
          roles: { getAll: () => options.userRoles ?? [] },
          getTimeZoneOffsetMinutes: () => options.timeZoneOffsetMinutes ?? 0,
        },
        // client/form-factor surface.
        client: {
          getFormFactor: () => options.formFactor ?? 1,
          getClient: () => options.clientKind ?? "Web",
          getClientState: () => "Online",
          isOffline: () => options.isOffline ?? false,
          isNetworkAvailable: () => options.isNetworkAvailable ?? true,
        },
      }),
      lookupObjects: async (lookupOptions: unknown) => {
        record("Utility.lookupObjects", lookupOptions);
        return options.lookupResult ?? [];
      },
      // utility extras.
      getResourceString: (webResourceName: string, key: string) => {
        record("Utility.getResourceString", webResourceName, key);
        return options.resourceStrings?.[key] ?? "";
      },
      showProgressIndicator: (message: string) => record("Utility.showProgressIndicator", message),
      closeProgressIndicator: () => record("Utility.closeProgressIndicator"),
      getAllowedStatusTransitions: async (entity: string, stateCode?: number) => {
        record("Utility.getAllowedStatusTransitions", entity, stateCode);
        return options.allowedStatusTransitions ?? [];
      },
      refreshParentGrid: (lookupValue: unknown) => record("Utility.refreshParentGrid", lookupValue),
    },
    // device capture surface.
    Device: {
      getBarcodeValue: async () => {
        record("Device.getBarcodeValue");
        return options.barcodeValue ?? "";
      },
      captureImage: async (deviceOptions: unknown) => {
        record("Device.captureImage", deviceOptions);
        return options.deviceFile ?? null;
      },
    },
    Navigation: {
      openForm: async (formOptions: unknown, formParameters?: unknown) => {
        record("Navigation.openForm", formOptions, formParameters);
        return {};
      },
      navigateTo: async (pageInput: unknown, navigationOptions: unknown) => {
        record("Navigation.navigateTo", pageInput, navigationOptions);
        return {};
      },
      openAlertDialog: async (strings: unknown, alertOptions?: unknown) => {
        record("Navigation.openAlertDialog", strings, alertOptions);
        return {};
      },
      openConfirmDialog: async (strings: unknown, confirmOptions?: unknown) => {
        record("Navigation.openConfirmDialog", strings, confirmOptions);
        return { confirmed: options.confirmResult ?? true };
      },
      openUrl: (url: string, openUrlOptions?: unknown) =>
        record("Navigation.openUrl", url, openUrlOptions),
      openErrorDialog: async (errorOptions: unknown) => {
        record("Navigation.openErrorDialog", errorOptions);
        return {};
      },
      openFile: async (file: unknown, fileOptions: unknown) => {
        record("Navigation.openFile", file, fileOptions);
        return {};
      },
      openWebResource: (name: string, windowOptions?: unknown, data?: string) =>
        record("Navigation.openWebResource", name, windowOptions, data),
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
        getOrgUniqueName: options.orgUniqueName ? () => options.orgUniqueName! : undefined,
        getOrgLcid: options.orgLcid ? () => options.orgLcid! : undefined,
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
