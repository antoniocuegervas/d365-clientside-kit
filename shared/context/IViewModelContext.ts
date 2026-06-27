import type { IRetrieveMultipleResult } from "../data/CdsClient";
import type { IFormContext } from "./formContextSurface";
import type { IEntityReference, IOptionItem, IXrmLookupValue } from "../utils/EntityModel";

/**
 * IViewModelContext, everything shared React code may need from its host.
 *
 * Smart controls, ViewModels, client hooks, and PCF roots use this contract
 * for ALL CRM access. They must not reach into global Xrm.Page, raw
 * GetGlobalContext(), or parent.Xrm. Presentational controls never see this
 * interface at all.
 *
 * SHAPE, "option B": a kit-OWNED interface whose method names
 * and signatures MIRROR `Xrm.WebApi` / `Xrm.Navigation`, so call sites read
 * like the Xrm docs while the fake context stays cast-free and compiler-
 * checked. Reads lean Xrm-faithful (annotated entities + `{ entities,
 * nextLink }`); callers extract values with the LibraryUtils helpers they
 * already know. The normalized MetadataService and execute-over-
 * cds-client are kept regardless of host. V8 fidelity is a per-method
 * dial, the cheap, familiar methods are mirrored cheaply.
 */
export interface IViewModelContext {
  /** Org root URL, e.g. "https://org.crm.dynamics.com". */
  readonly clientUrl: string;
  /** Current user, normalized guid + display name. */
  readonly user: IUserInfo;
  /** Server version string when the host exposes it (e.g. "9.2.x", "8.2.x"). */
  readonly orgVersion: string;
  /** True when running against a legacy CRM 8.x server through the V8 adapter. */
  readonly isLegacy: boolean;

  readonly webAPI: IWebApi;
  readonly metadata: IMetadataApi;
  readonly navigation: INavigation;
  readonly utils: IContextUtils;
  /**
   * Organization and user settings plus app/version helpers, mirroring the
   * native `getGlobalContext()`. The top-level `clientUrl`, `orgVersion`, and
   * `user` stay as the common-path convenience reads; this exposes the full
   * surface (base currency, security roles, transaction currency, app
   * properties, prependOrgName). The legacy V8 host fills the subset 8.x
   * exposes and rejects the app-properties calls.
   */
  readonly globalContext: IGlobalContext;
  /**
   * Client/form-factor surface mirroring `GlobalContext.client`, for
   * responsive smart controls (e.g. grid → cards on phone). Smart tier only.
   */
  readonly client: IClientContext;
  /**
   * Device capture surface mirroring `Xrm.Device`, mobile-capable smart
   * controls. Presentational controls never see it. Hosts that lack a capability
   * throw a clear "not supported" error.
   */
  readonly device: IDeviceContext;

  /**
   * Full form object-model mirror (data, ui, attributes, controls, tabs,
   * sections, BPF process) when hosted on (or beside) a record form; undefined
   * otherwise. Mirrors the native `formContext`. The V8 host fills the classic
   * Xrm.Page subset and rejects members 8.x lacks.
   */
  readonly formContext?: IFormContext;
  /**
   * Form access when hosted on (or beside) a record form; undefined otherwise.
   * A small convenience wrapper over {@link formContext} for the common
   * id/entity/attribute reads.
   */
  readonly formAccess?: IFormAccess;

  /**
   * Lazily resolves the user's locale formatting: date format info
   * (localized day/month names + first day of week), decimal symbol, and
   * number group separator. Cached per context. Smart controls read this and
   * thread the values into presentational props; the boundary stays clean.
   * Missing pieces resolve to undefined and controls fall back to defaults.
   */
  getFormatting(): Promise<IFormattingInfo>;
}

export interface IUserInfo {
  id: string;
  name: string;
  /** User's UI language LCID (e.g. 1033), when the host exposes it. */
  languageId?: number;
  /** Right-to-left UI direction, drives RTL layout where the host exposes it. */
  isRTL?: boolean;
  /** Minutes offset from UTC for the user's timezone, when the host exposes it. */
  timeZoneOffsetMinutes?: number;
}

/** Client form factor, mirroring the platform `ClientFormFactor` enum. */
export const ClientFormFactor = {
  Unknown: 0,
  Desktop: 1,
  Tablet: 2,
  Phone: 3,
} as const;
export type ClientFormFactor = (typeof ClientFormFactor)[keyof typeof ClientFormFactor];

/** Client/form-factor surface mirroring `GlobalContext.client`. */
export interface IClientContext {
  /** Unknown=0, Desktop=1, Tablet=2, Phone=3, for responsive controls. */
  getFormFactor(): ClientFormFactor;
  /** Host kind, e.g. "Web" | "Outlook" | "Mobile". */
  getClient(): string;
  /** "Online" | "Offline" | "OfflineError". */
  getClientState(): string;
  isOffline(): boolean;
  /** True when the network is reachable, mirroring `client.isNetworkAvailable`. */
  isNetworkAvailable(): boolean;
}

/**
 * Options for `device.captureImage`, mirroring `Xrm.Device.CaptureImageOptions`
 * field for field.
 */
export interface ICaptureImageOptions {
  allowEdit?: boolean;
  height?: number;
  /** Capture using the device's front camera. */
  preferFrontCamera?: boolean;
  quality?: number;
  width?: number;
}

/** File-type categories for `device.pickFile`, mirroring `Xrm.Device.PickFileTypes`. */
export type PickFileType = "audio" | "video" | "image";

/** Options for `device.pickFile`, mirroring `Xrm.Device.PickFileOptions`. */
export interface IPickFileOptions {
  accept?: PickFileType;
  allowMultipleFiles?: boolean;
  maximumAllowedFileSize?: number;
}

/** Geolocation result for `device.getCurrentPosition`. */
export interface IGeoPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

/** Device capture surface mirroring `Xrm.Device`, all Promise-returning. */
export interface IDeviceContext {
  captureImage(options?: ICaptureImageOptions): Promise<IFileDetails | null>;
  captureAudio(): Promise<IFileDetails | null>;
  captureVideo(): Promise<IFileDetails | null>;
  getBarcodeValue(): Promise<string | null>;
  getCurrentPosition(): Promise<IGeoPosition | null>;
  pickFile(options?: IPickFileOptions): Promise<IFileDetails[]>;
}

/** Localized date-formatting data, normalized to one shape across hosts. */
export interface IDateFormatInfo {
  /** Full weekday names, Sunday first (length 7). */
  dayNames: string[];
  /** Full month names (length 12). */
  monthNames: string[];
  /** Shortest weekday names, Sunday first (length 7). */
  shortestDayNames: string[];
  /** Abbreviated month names (length 12). */
  abbreviatedMonthNames: string[];
  /** First day of the week: 0 = Sunday … 6 = Saturday. */
  firstDayOfWeek: number;
  /** Short date pattern, e.g. "M/d/yyyy" or "dd/MM/yyyy", when known. */
  shortDatePattern?: string;
}

/** User locale/number formatting resolved from the host. */
export interface IFormattingInfo {
  /** Decimal separator, e.g. "." or ",". */
  decimalSymbol?: string;
  /** Number group (thousands) separator, e.g. "," or ".". */
  numberSeparator?: string;
  dateFormatInfo?: IDateFormatInfo;
}

/** A transaction currency's display info. */
export interface ICurrencyInfo {
  /** Currency symbol glyph, e.g. "$", "€". */
  symbol: string;
  /** Currency-specific precision, when the field uses pricing decimal precision. */
  precision?: number;
}

/**
 * Result of a record write, mirroring Xrm's `CreateResponse`/`UpdateResponse`:
 * the affected record's entity logical name (`entityType`) and id.
 */
export interface IRecordWriteResult {
  /** Entity logical name of the affected record. */
  entityType: string;
  /** Normalized record id. */
  id: string;
}

/**
 * One operation in a transactional change set, for {@link IWebApi.executeChangeSet}:
 * a create (POST), update (PATCH), or delete (DELETE). Every operation in one
 * change set commits together or rolls back together.
 */
export interface IChangeSetRequest {
  /** POST to create, PATCH to update, DELETE to delete. */
  method: "POST" | "PATCH" | "DELETE";
  /** Target entity logical name (e.g. "account"); resolved to its entity set. */
  entityLogicalName: string;
  /**
   * Target record id for PATCH/DELETE. May be a content-id reference ("$1",
   * "$2", ...) to a record CREATED earlier in the SAME change set, addressed by
   * its 1-based position in the requests array. Omit for a create.
   */
  id?: string;
  /**
   * Attribute values for create/update. An `@odata.bind` value may itself be a
   * content-id reference ("$1") to bind to a record created earlier in the same
   * change set, for example `"primarycontactid@odata.bind": "$2"`.
   */
  data?: Record<string, unknown>;
}

/** One operation's result from {@link IWebApi.executeChangeSet}, in request order. */
export interface IChangeSetResponse {
  /** Affected entity logical name (echoed from the request). */
  entityType: string;
  /** New record id for a create (POST); undefined for an update or delete. */
  id?: string;
}

/** Operation type for a Web API request: action, function, or CRUD. */
export const WebApiOperationType = {
  Action: 0,
  Function: 1,
  CRUD: 2,
} as const;
export type WebApiOperationType =
  (typeof WebApiOperationType)[keyof typeof WebApiOperationType];

/** Parameter type metadata for an execute request, mirroring the native shape. */
export interface IWebApiParameterType {
  /** 0 Unknown, 1 PrimitiveType, 2 ComplexType, 3 EnumerationType, 4 Collection, 5 EntityType. */
  structuralProperty: number;
  /** Fully qualified parameter type name. */
  typeName: string;
  /** Enum metadata when the parameter is an enumeration type. */
  enumProperties?: Array<{ name: string; value: string }>;
}

/**
 * Operation metadata returned by an execute request's `getMetadata()`,
 * mirroring `Xrm.WebApi.online.execute`'s request contract.
 */
export interface IWebApiRequestMetadata {
  /**
   * The bound parameter name when the operation is bound to a record (the
   * request carries the bound reference under this property). `null` or omitted
   * for an unbound operation.
   */
  boundParameter?: string | null;
  /** Action/function name, or one of Create/Retrieve/RetrieveMultiple/Update/Delete for CRUD. */
  operationName?: string;
  /** 0 Action, 1 Function, 2 CRUD. */
  operationType?: WebApiOperationType;
  parameterTypes?: Record<string, IWebApiParameterType>;
}

/**
 * A Web API request object, mirroring the shape `Xrm.WebApi.online.execute`
 * accepts: parameter values as own properties plus a `getMetadata()` describing
 * the action, function, or CRUD operation. The same object passed to Xrm works
 * unchanged on every host.
 */
export interface IWebApiRequest {
  getMetadata(): IWebApiRequestMetadata;
  [parameterName: string]: unknown;
}

/**
 * Response from `execute`, mirroring the fetch-like `Xrm` ExecuteResponse.
 * `json()` parses the body; `ok`/`status` describe the HTTP result.
 */
export interface IExecuteResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

//#region global context / settings

/**
 * Organization settings mirroring `GlobalContext.organizationSettings`.
 * Members the host does not expose resolve to undefined.
 */
export interface IOrganizationSettings {
  /** Org id. */
  organizationId: string;
  /** Org unique (schema) name. */
  uniqueName: string;
  /** Org preferred language LCID. */
  languageId?: number;
  /** Base currency reference (id, name, entity type). */
  baseCurrency?: IXrmLookupValue;
  /** Base currency id (the v9.0 deprecated scalar). */
  baseCurrencyId?: string;
  /** Whether auto-save is enabled for the org. */
  isAutoSaveEnabled?: boolean;
  /** Default phone country/region code. */
  defaultCountryCode?: string;
  /** Whether the Skype protocol is used. */
  useSkypeProtocol?: boolean;
  /** Org region/geo. */
  organizationGeo?: string;
}

/**
 * User settings mirroring `GlobalContext.userSettings`. Members the host does
 * not expose resolve to undefined; `roles`/`securityRoles` default to empty.
 */
export interface IUserSettings {
  userId: string;
  userName: string;
  /** User UI language LCID. */
  languageId?: number;
  /** Right-to-left UI direction. */
  isRTL?: boolean;
  isHighContrastEnabled?: boolean;
  isGuidedHelpEnabled?: boolean;
  /** Default dashboard id for the user. */
  defaultDashboardId?: string;
  /** Security roles / teams the user belongs to (id, name, entity type). */
  roles: IXrmLookupValue[];
  /** Security role ids the user belongs to (the v9.0 deprecated scalars). */
  securityRoles: string[];
  /** Security role privilege ids. */
  securityRolePrivileges?: string[];
  /** Transaction currency reference for the user. */
  transactionCurrency?: IXrmLookupValue;
  /** Transaction currency id (the v9.0 deprecated scalar). */
  transactionCurrencyId?: string;
  /**
   * Raw host date-formatting object (Xrm `DateFormattingInfo`). Use
   * `context.getFormatting()` for the normalized, kit-shaped view.
   */
  dateFormattingInfo?: Record<string, unknown>;
  /** Minutes offset from UTC for the user's timezone. */
  getTimeZoneOffsetMinutes(): number;
}

/** Current business-app properties, mirroring `Xrm.AppProperties`. */
export interface IAppProperties {
  appId?: string;
  displayName?: string;
  uniqueName?: string;
  url?: string;
  webResourceId?: string;
  webResourceName?: string;
  welcomePageId?: string;
  welcomePageName?: string;
}

/**
 * Global context surface mirroring the native `getGlobalContext()`: client URL,
 * organization/user settings, version, org-name path helper, and the current
 * app metadata.
 */
export interface IGlobalContext {
  readonly clientUrl: string;
  readonly organizationSettings: IOrganizationSettings;
  readonly userSettings: IUserSettings;
  /** Server version string, e.g. "9.2.x". */
  getVersion(): string;
  /** Prepends the org name to a path, mirroring `prependOrgName`. */
  prependOrgName(path: string): string;
  /**
   * Resolves the current app's properties. Rejects on hosts that do not expose
   * apps (the legacy V8 host and PCF).
   */
  getCurrentAppProperties(): Promise<IAppProperties>;
  /** Resolves the current app's unique name. Rejects where apps are unavailable. */
  getCurrentAppName(): Promise<string>;
  /** The current app's URL, or "" on hosts that do not expose it. */
  getCurrentAppUrl(): string;
}

//#endregion

/**
 * Web API surface, Xrm.WebApi-shaped (logical names in, promises out) so the
 * modern adapter is a thin delegate and other hosts emulate the same shape.
 */
export interface IWebApi {
  /** Creates a record. Returns the new record's `{ entityType, id }`. */
  createRecord(
    entityLogicalName: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult>;
  /** Updates a record (PATCH). Returns the affected `{ entityType, id }`. */
  updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult>;
  /** Deletes a record. Returns the deleted `{ entityType, id }`. */
  deleteRecord(entityLogicalName: string, id: string): Promise<IRecordWriteResult>;
  /** `options` is a raw OData query string starting with "?". */
  retrieveRecord(
    entityLogicalName: string,
    id: string,
    options?: string
  ): Promise<Record<string, unknown>>;
  /**
   * `options`: "?fetchXml=<urlencoded>" or a raw OData query string.
   * `maxPageSize` sets the odata.maxpagesize preference for server-side paging.
   * Do not page with $top: it caps the result and suppresses the
   * `@odata.nextLink` paging relies on. The result's nextLink follows to the
   * next page.
   */
  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
    maxPageSize?: number
  ): Promise<IRetrieveMultipleResult>;
  /** Convenience for the kit's dominant query path: plain FetchXML in. */
  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult>;
  /**
   * FetchXML query that surfaces the paging annotations, total record
   * count, more-records, paging cookie. Rides cds-client on every host (Xrm.WebApi
   * drops these annotations), so rich server-side `page`/`count` paging works
   * uniformly. Use for jump-to-page / total-count; `fetch` stays the plain path.
   */
  fetchPage(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult>;
  /**
   * Follows an `@odata.nextLink` (a full collection URL) for server-side paging.
   * Dataverse paging is forward-cookie based; rides cds-client on every host so
   * an absolute nextLink can be re-issued (Xrm.WebApi can't take one). Pass the
   * same `maxPageSize` used for the first page: the nextLink carries only the
   * position cookie, so the page size has to be re-sent or the server returns
   * its default page size instead.
   */
  retrieveMultipleByUrl(url: string, maxPageSize?: number): Promise<IRetrieveMultipleResult>;
  /**
   * Runs a custom action, the ergonomic action-only path: name plus optional
   * parameters in, the parsed response body out (undefined when empty). Unbound
   * by default; pass `boundTo` for a bound action. Rides cds-client on every
   * host (even modern), so app code never hand-builds the request-object
   * contract. For functions or a pre-built request object, use {@link execute}.
   * This is also how you run a Power Automate cloud flow or a Copilot Studio
   * workflow on demand: wrap it in a Dataverse Custom API and call this.
   */
  executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityLogicalName: string; id: string }
  ): Promise<unknown>;
  /**
   * Runs an on-demand classic (Dataverse background/real-time) workflow against
   * one record by id. Named "classic" to distinguish it from Copilot Studio
   * workflows, which are unrelated. Ergonomic, built on executeAction.
   */
  executeClassicWorkflow(workflowId: string, recordId: string): Promise<unknown>;
  /**
   * Runs a single action, function, or CRUD request object, the standard generic
   * path mirroring `Xrm.WebApi.online.execute`. Returns a fetch-like response
   * (call `.json()` for the body) that resolves with `ok: false` on an HTTP error
   * and rejects only on a network failure, identically on every host. The modern
   * host delegates to the native
   * execute (full action/function/CRUD); PCF and the legacy host ride cds-client,
   * which supports actions and functions and rejects CRUD requests with a pointer
   * to the dedicated create/update/delete/retrieve methods. For the common action
   * case prefer the ergonomic {@link executeAction}.
   */
  execute(request: IWebApiRequest): Promise<IExecuteResponse>;
  /**
   * Executes multiple requests in one round-trip, mirroring
   * `Xrm.WebApi.online.executeMultiple`. The modern host delegates natively; the
   * cds-client hosts send a single $batch. Operations are independent (one
   * failing does not roll back the others), matching native's flat-array form;
   * the responses come back in request order, each with its own `ok`/status.
   */
  executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]>;
  /**
   * Commits several writes as ONE transactional change set: a single `$batch`
   * with a single change-set boundary, so the operations all commit or all roll
   * back. This is the transactional counterpart to {@link executeMultiple}, whose
   * flat form is deliberately NON-transactional (one failing does not roll back
   * the others). A later operation can bind to a record created earlier in the
   * same change set through a content-id reference ("$1", the 1-based position),
   * either as the PATCH/DELETE target id or inside an `@odata.bind` value, so a
   * multi-entity create-and-link commits with no server code. Returns one result
   * per request in order, carrying the new id for each create. Rides cds-client
   * on every host (the native execute surface cannot express content-id refs).
   *
   * Limits, by design of the OData change set: one organization, no GETs inside
   * the change set, all-or-nothing within the one change set, and the platform's
   * change-set message restrictions. For commits needing real server logic or
   * ordering beyond content-id, reach for a plugin or a Custom API instead.
   */
  executeChangeSet(requests: IChangeSetRequest[]): Promise<IChangeSetResponse[]>;
}

/**
 * Options for the native CRM lookup dialog, shaped to mirror
 * `Xrm.Utility.lookupObjects` (which is not in the public typings). Each
 * member maps 1:1 to the host call.
 */
export interface ILookupOptions {
  /** Allow selecting more than one record. Default false. */
  allowMultiSelect?: boolean;
  /** Entity pre-selected in the entity-type switcher. */
  defaultEntityType?: string;
  /** Entities offered in the dialog. Single-entity when length 1. */
  entityTypes?: string[];
  /** Hide the recently-used (MRU) list. */
  disableMru?: boolean;
  /** Per-entity FetchXML `<filter>` applied to the dialog's view. */
  filters?: Array<{ entityLogicalName: string; filterXml: string }>;
  /** View ids offered in the view switcher (first is the default). */
  viewIds?: string[];
}

/**
 * Error-dialog options mirroring `Xrm.Navigation.ErrorDialogOptions`.
 * the standard CRM error surface. When `details` is set the dialog shows a
 * "Download Log File" button; when only `errorCode` is set the platform looks
 * up the message server-side.
 */
export interface IErrorDialogOptions {
  message?: string;
  details?: string;
  errorCode?: number;
}

/** File payload for `openFile`, mirroring `Xrm.Navigation.FileDetails`. */
export interface IFileDetails {
  /** Base64-encoded file contents. */
  fileContent: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/** `openFile` options, `openMode` 1 = open in-browser, 2 = save. */
export interface IOpenFileOptions {
  openMode?: 1 | 2;
}

/** A size value for navigation dialogs, a percentage by default. */
export interface INavigationSize {
  value: number;
  unit?: "%" | "px";
}

/**
 * Height/width (pixels) for the alert/confirm dialogs and `openUrl`, mirroring
 * `Xrm.Navigation.DialogSizeOptions`.
 */
export interface IDialogSizeOptions {
  height: number;
  width: number;
}

/**
 * Strings for the native alert dialog, mirroring `Xrm.Navigation.AlertStrings`.
 * The convenience `openAlertDialog(text, title?)` overload covers the common
 * call; pass this object when you also need a custom confirm button label.
 */
export interface IAlertStrings {
  text: string;
  title?: string;
  confirmButtonLabel?: string;
}

/**
 * Strings for the native confirm dialog, mirroring
 * `Xrm.Navigation.ConfirmStrings`. Adds `subtitle` and both button labels over
 * the convenience `openConfirmDialog(text, title?)` overload.
 */
export interface IConfirmStrings {
  text: string;
  title?: string;
  subtitle?: string;
  confirmButtonLabel?: string;
  cancelButtonLabel?: string;
}

/**
 * Full form-open options mirroring `Xrm.Navigation.EntityFormOptions`. Every
 * field maps 1:1 to the native object. The convenience
 * `openForm(entityLogicalName, id?)` overload covers the common open; pass this
 * object for quick-create, a specific form, BPF stage, or a new-window open.
 * The legacy (V8) host maps `entityName`/`entityId` only.
 */
export interface IEntityFormOptions {
  entityName: string;
  entityId?: string;
  /** Open a specific form instance by id. */
  formId?: string;
  /** Open the quick-create form instead of the main form. */
  useQuickCreateForm?: boolean;
  openInNewWindow?: boolean;
  /** 1 center, 2 side. */
  windowPosition?: 1 | 2;
  height?: number;
  width?: number;
  /** Show the command bar (default true when omitted). */
  cmdbar?: boolean;
  /** "on" | "off" | "entity", controls the navigation bar. */
  navBar?: "on" | "off" | "entity";
  /** Seed default values from a mapped record (a lookup reference). */
  createFromEntity?: IXrmLookupValue;
  /** Business process flow to display. */
  processId?: string;
  /** Business process flow instance to display. */
  processInstanceId?: string;
  /** Selected BPF stage id. */
  selectedStageId?: string;
  isCrossEntityNavigate?: boolean;
}

/** Field prefill / custom form parameters, mirroring `Xrm.Utility.OpenParameters`. */
export type IFormParameters = Record<string, string>;

/**
 * Navigation options mirroring `Xrm.Navigation.NavigationOptions`.
 * `target` 1 = inline (full page), 2 = dialog.
 */
export interface INavigationOptions {
  target?: 1 | 2;
  width?: number | INavigationSize;
  height?: number | INavigationSize;
  position?: 1 | 2;
  title?: string;
}

/**
 * Launch options for opening the clientui shell as a dialog from a ribbon,
 * command bar, or form. `mode` picks a centered modal (default) or a right-hand
 * side pane; `width`/`height` are pixels (omit for the 80% default); `title`
 * sets the dialog header. The legacy (V8) host opens a popup window and honors
 * only width/height.
 */
export interface IClientUILaunchOptions {
  mode?: "modal" | "side";
  width?: number;
  height?: number;
  title?: string;
}

/**
 * Page inputs for the general `navigateTo`, mirroring the platform's
 * `PageInput` union. Covers the navigable page types a webresource/PCF reaches
 * for; the adapter passes them straight to the host.
 */
export type INavigateToPageInput =
  | {
      pageType: "entityrecord";
      entityName: string;
      entityId?: string;
      /** Seed default values from a mapped record. */
      createFromEntity?: IXrmLookupValue;
      /** Extra parameters passed to the form. */
      data?: Record<string, unknown>;
      /** Open a specific form instance by id. */
      formId?: string;
      isCrossEntityNavigate?: boolean;
      isOfflineSyncError?: boolean;
      processId?: string;
      processInstanceId?: string;
      selectedStageId?: string;
      relationship?: INavigationRelationship;
      /** Focus a tab of the form on open. */
      tabName?: string;
    }
  | {
      pageType: "entitylist";
      entityName: string;
      viewId?: string;
      /** "savedquery" (system view) or "userquery" (personal view). */
      viewType?: "savedquery" | "userquery";
    }
  | { pageType: "custom"; name: string; entityName?: string; recordId?: string }
  | { pageType: "dashboard"; dashboardId?: string }
  | { pageType: "webresource"; webresourceName: string; data?: string };

/**
 * Relationship descriptor for an `entityrecord` navigation, mirroring
 * `Xrm.Navigation.Relationship`, used to show related records on the target form.
 */
export interface INavigationRelationship {
  attributeName: string;
  name: string;
  navigationPropertyName?: string;
  /** 0 OneToMany, 1 ManyToMany. */
  relationshipType?: 0 | 1;
  /** 1 Referencing, 2 AssociationEntity. */
  roleType?: 1 | 2;
}

/**
 * Window options for raw `openWebResource`, mirroring
 * `Xrm.Navigation.OpenWebresourceOptions`.
 */
export interface IWindowOptions {
  height?: number;
  width?: number;
  /** Open the web resource in a new browser window. */
  openInNewWindow?: boolean;
}

export interface INavigation {
  /** Convenience open: main form for an entity, optionally a record by id. */
  openForm(entityLogicalName: string, id?: string): Promise<void>;
  /**
   * Full form open mirroring `Xrm.Navigation.openForm`: quick-create, a
   * specific form, BPF stage, new-window, plus `formParameters` field prefill.
   * The legacy (V8) host maps `entityName`/`entityId` only.
   */
  openForm(options: IEntityFormOptions, formParameters?: IFormParameters): Promise<void>;
  /**
   * Opens the unified clientui shell webresource with an app key + payload,
   * as a centered modal dialog (default) or a side pane. Pass the deployed
   * `webResourceName` explicitly from hooks (the publisher prefix varies).
   * Modern hosts use Xrm.Navigation.navigateTo (dialog / side pane); the
   * legacy host falls back to a popup window.
   */
  openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    options?: IClientUILaunchOptions
  ): Promise<void>;
  /** Convenience alert: a message and optional title. */
  openAlertDialog(text: string, title?: string): Promise<void>;
  /**
   * Full alert mirroring `Xrm.Navigation.openAlertDialog`: custom confirm
   * button label plus dialog size. V8 keeps text-only (size/labels ignored).
   */
  openAlertDialog(strings: IAlertStrings, options?: IDialogSizeOptions): Promise<void>;
  /** Convenience confirm: resolves true when the user confirmed. */
  openConfirmDialog(text: string, title?: string): Promise<boolean>;
  /**
   * Full confirm mirroring `Xrm.Navigation.openConfirmDialog`: subtitle, both
   * button labels, dialog size. V8 keeps text-only (size/labels ignored).
   */
  openConfirmDialog(strings: IConfirmStrings, options?: IDialogSizeOptions): Promise<boolean>;
  /** Opens a URL. `options` sizes the window where the host honors it. */
  openUrl(url: string, options?: IDialogSizeOptions): void;
  /**
   * Opens the native CRM lookup dialog, the full platform picker
   * (recently used, view switching, cross-entity). Resolves the chosen
   * records (empty array on cancel). Mirrors `Xrm.Utility.lookupObjects`;
   * throws on hosts that cannot summon it.
   */
  lookupObjects(options: ILookupOptions): Promise<IEntityReference[]>;
  /**
   * Shows the native CRM error dialog, the standard error surface.
   * Mirrors `Xrm.Navigation.openErrorDialog`. Modern/PCF delegate natively; V8
   * routes `message`+`details` to the v8 alert.
   */
  openErrorDialog(options: IErrorDialogOptions): Promise<void>;
  /**
   * Opens or downloads a file blob. Mirrors `Xrm.Navigation.openFile`.
   * Throws a clear "not supported" on hosts (V8) that lack it.
   */
  openFile(file: IFileDetails, options?: IOpenFileOptions): Promise<void>;
  /**
   * General platform navigation, entityrecord / entitylist / custom
   * page / dashboard / webresource. Mirrors `Xrm.Navigation.navigateTo`.
   * `openClientUI` is the kit's opinionated webresource subset; this is the
   * rest. V8 maps the cases it can and throws clearly for the rest.
   */
  navigateTo(pageInput: INavigateToPageInput, options?: INavigationOptions): Promise<void>;
  /**
   * Raw webresource open, distinct from the opinionated `openClientUI`.
   * Mirrors `Xrm.Navigation.openWebResource`.
   */
  openWebResource(webResourceName: string, windowOptions?: IWindowOptions, data?: string): void;
}

export interface IContextUtils {
  /** Fire-and-forget alert, same as openAlertDialog without awaiting. */
  alert(message: string): void;
  /**
   * Localized UI string from a RESX webresource, mirroring
   * `Xrm.Utility.getResourceString`, the platform's string-localization
   * mechanism. Returns undefined on hosts without resx access.
   */
  getResourceString(webResourceName: string, key: string): string | undefined;
  /** Global busy overlay during long ViewModel operations. No-op where unsupported. */
  showProgressIndicator(message: string): void;
  closeProgressIndicator(): void;
  /**
   * Allowed status-reason transitions (status codes) for an entity, optionally
   * scoped to a state, mirroring `Xrm.Utility.getAllowedStatusTransitions`.
   * `stateCode` is optional, as on the native call. Rejects clearly where
   * unsupported.
   */
  getAllowedStatusTransitions(entityLogicalName: string, stateCode?: number): Promise<number[]>;
  /**
   * Refreshes the host grid after a ribbon action, mirroring
   * `Xrm.Utility.refreshParentGrid`. No-op where unsupported.
   */
  refreshParentGrid(lookupValue: unknown): void;
}

/**
 * Form object-model mirror, re-exported from formContextSurface so the full
 * contract is discoverable here alongside the rest of IViewModelContext.
 */
export type {
  FormEventHandler,
  IAttribute,
  IControl,
  IFormCollection,
  IFormContext,
  IFormData,
  IFormEntity,
  IFormProcess,
  IFormUi,
  IProcess,
  IProcessStage,
  IProcessStep,
  ISection,
  ITab,
} from "./formContextSurface";

/** Read/write access to the hosting record form, when present. */
export interface IFormAccess {
  /** Normalized record id, or null while the record is unsaved. */
  getRecordId(): string | null;
  getEntityName(): string | null;
  getAttributeValue<T = unknown>(attributeLogicalName: string): T | null;
  setAttributeValue(attributeLogicalName: string, value: unknown): void;
  /** Raw host form context for cases the typed surface doesn't cover. */
  readonly raw: unknown;
}

//#region metadata

/** Kit-level attribute classification used to pick presentational controls. */
export type AttributeKind =
  | "text"
  | "memo"
  | "optionset"
  | "multioptionset"
  | "lookup"
  | "datetime"
  | "date"
  | "integer"
  | "decimal"
  | "double"
  | "money"
  | "boolean"
  | "other";

export interface IAttributeMetadata {
  logicalName: string;
  displayName: string;
  /** Attribute description label, when authored, tooltips surface this. */
  description?: string;
  kind: AttributeKind;
  /** True for ApplicationRequired/SystemRequired. */
  required: boolean;
  /**
   * True when the column has field-level (column) security enabled. The kit
   * renders a secured column read-only by default; it cannot resolve this user's
   * effective column access off a form (see docs/gotchas.md). A host that knows
   * the user may edit it can override with `readOnly={false}`.
   */
  isSecured?: boolean;
  /** Option list for optionset / multioptionset / boolean kinds. */
  options?: IOptionItem[];
  /** Lookup target entity logical names. */
  targets?: string[];
  maxLength?: number;
  precision?: number;
  /**
   * Money PrecisionSource: 0 = use the attribute `precision`, 1 = use the record
   * currency's precision, 2 = use the org pricing precision. Only set for money
   * attributes; undefined elsewhere.
   */
  precisionSource?: number;
  minValue?: number;
  maxValue?: number;
}

export interface IEntityMetadata {
  logicalName: string;
  displayName: string;
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
}

/** One activity-enabled entity type, for a "create new activity" picker. */
export interface IActivityTypeInfo {
  logicalName: string;
  displayName: string;
  /** Activity type code, the value behind activitytypecode. */
  objectTypeCode: number;
}

/**
 * One resolved grid column from a saved view's layout. For a
 * link-entity/aliased column, `name` is the aliased `alias.attr` key and
 * `relatedEntity` names the column's OWNING entity (so headers/types resolve
 * against the related entity, not the view's root).
 */
export interface IViewColumn {
  /** Column key, the (possibly aliased `alias.attr`) attribute logical name. */
  name: string;
  /** Pixel width. */
  width: number;
  /**
   * Owning entity for a related-entity (link-entity/aliased) column, from the
   * layoutjson `Cell.RelatedEntityName`. Undefined for root-entity columns.
   */
  relatedEntity?: string;
  /** True when the cell opts out of sorting (`DisableSorting`). */
  disableSorting?: boolean;
}

/** A saved view (savedquery) definition resolved for grid rendering. */
export interface IViewDefinition {
  id: string;
  name: string;
  entityLogicalName: string;
  fetchXml: string;
  layoutXml: string;
  /** Raw `layoutjson` when the view carries it; the preferred layout source. */
  layoutJson?: string;
  /**
   * Columns in cell order. Preferred from `layoutjson` (carries related-entity
   * info cleanly) and falling back to `layoutxml`. Hidden cells are dropped.
   */
  columns: IViewColumn[];
}

export interface IMetadataApi {
  getEntityMetadata(entityLogicalName: string): Promise<IEntityMetadata>;
  getAttributeMetadata(
    entityLogicalName: string,
    attributeLogicalName: string
  ): Promise<IAttributeMetadata>;
  /** Loads a saved view by id, or the entity's default grid view when omitted. */
  getView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition>;
  /**
   * Lists the directly-creatable activity types, for a "create new activity"
   * picker, ordered by display name. Cached for the session. Filtered to the
   * out-of-box activities a native New menu shows (activitypointer itself and
   * system-only types like recurring master and untracked email are excluded).
   */
  getActivityTypes(): Promise<IActivityTypeInfo[]>;
  /**
   * Resolves a saved (system) view by its display name for an entity.
   * Throws a readable error when no active view matches or the name is
   * ambiguous. The near-universal "open this named view in a webresource"
   * pattern that avoids hardcoding savedquery ids.
   */
  getViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition>;
  /**
   * Resolves a transaction currency's symbol/precision by id, cached
   * per currency. Money controls supply the result to the `currencySymbol`
   * prop so a record shows its real currency, not a hardcoded glyph.
   */
  getCurrencySymbol(transactionCurrencyId: string): Promise<ICurrencyInfo>;
  /**
   * Resolves an entity's icon URL: custom entities → their vector
   * webresource; OOTB entities → the platform `svg_<objecttypecode>.svg`.
   * Returns undefined when no icon can be resolved. Cached per entity.
   */
  getEntityIconUrl(entityLogicalName: string): Promise<string | undefined>;
}
//#endregion
