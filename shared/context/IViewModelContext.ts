import type { IRetrieveMultipleResult } from "../data/CdsClient";
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

  /** Form access when hosted on (or beside) a record form; undefined otherwise. */
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
}

/** Image/file payloads captured by `device.*` reuse the navigation file shape. */
export interface ICaptureImageOptions {
  allowEdit?: boolean;
  height?: number;
  width?: number;
  quality?: number;
}

export interface IPickFileOptions {
  accept?: string;
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
 * Web API surface, Xrm.WebApi-shaped (logical names in, promises out) so the
 * modern adapter is a thin delegate and other hosts emulate the same shape.
 */
export interface IWebApi {
  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }>;
  updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<void>;
  deleteRecord(entityLogicalName: string, id: string): Promise<void>;
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
   * Follows an `@odata.nextLink` (a full collection URL) for server-side paging
   *. Dataverse paging is forward-cookie based; rides cds-client on every
   * host so an absolute nextLink can be re-issued (Xrm.WebApi can't take one).
   */
  retrieveMultipleByUrl(url: string): Promise<IRetrieveMultipleResult>;
  /**
   * Executes a custom action. Unbound by default; pass `boundTo` for an
   * action bound to a record. Rides cds-client on every host, so
   * production never touches `Xrm.WebApi.online.execute`'s request-object
   * contract. Returns the action's response body (or undefined when empty).
   */
  executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityLogicalName: string; id: string }
  ): Promise<unknown>;
  /** Runs an on-demand classic workflow against one record by id. */
  executeWorkflow(workflowId: string, recordId: string): Promise<unknown>;
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
 * the idiomatic CRM error surface. When `details` is set the dialog shows a
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
   * Shows the native CRM error dialog, the idiomatic error surface.
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
   * Allowed status-reason transitions for a state, mirroring
   * `Xrm.Utility.getAllowedStatusTransitions`. Rejects clearly where unsupported.
   */
  getAllowedStatusTransitions(entityLogicalName: string, stateCode: number): Promise<unknown>;
  /**
   * Refreshes the host grid after a ribbon action, mirroring
   * `Xrm.Utility.refreshParentGrid`. No-op where unsupported.
   */
  refreshParentGrid(lookupValue: unknown): void;
}

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
  /** Option list for optionset / multioptionset / boolean kinds. */
  options?: IOptionItem[];
  /** Lookup target entity logical names. */
  targets?: string[];
  maxLength?: number;
  precision?: number;
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
