import type { IRetrieveMultipleResult } from "../data/CdsClient";
import type { IEntityReference, IOptionItem } from "../utils/EntityModel";

/**
 * IViewModelContext, everything shared React code may need from its host.
 *
 * Smart controls, ViewModels, client hooks, and PCF roots use this contract
 * for ALL CRM access. They must not reach into global Xrm.Page, raw
 * GetGlobalContext(), or parent.Xrm. Presentational controls never see this
 * interface at all.
 *
 * SHAPE, "option B" (D-014 / G-17): a kit-OWNED interface whose method names
 * and signatures MIRROR `Xrm.WebApi` / `Xrm.Navigation`, so call sites read
 * like the Xrm docs while the fake context stays cast-free and compiler-
 * checked. Reads lean Xrm-faithful (annotated entities + `{ entities,
 * nextLink }`); callers extract values with the LibraryUtils helpers they
 * already know. The normalized MetadataService (D-007) and execute-over-
 * cds-client (D-014) are kept regardless of host. V8 fidelity is a per-method
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

  /** Form access when hosted on (or beside) a record form; undefined otherwise. */
  readonly formAccess?: IFormAccess;

  /**
   * Lazily resolves the user's locale formatting (G-06): date format info
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
  /** User's UI language LCID (e.g. 1033), when the host exposes it (G-06). */
  languageId?: number;
}

/** Localized date-formatting data, normalized to one shape across hosts (G-06). */
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

/** User locale/number formatting resolved from the host (G-06). */
export interface IFormattingInfo {
  /** Decimal separator, e.g. "." or ",". */
  decimalSymbol?: string;
  /** Number group (thousands) separator, e.g. "," or ".". */
  numberSeparator?: string;
  dateFormatInfo?: IDateFormatInfo;
}

/** A transaction currency's display info (G-06b). */
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
  /** `options`: "?fetchXml=<urlencoded>" or a raw OData query string. */
  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string
  ): Promise<IRetrieveMultipleResult>;
  /** Convenience for the kit's dominant query path: plain FetchXML in. */
  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult>;
  /**
   * Follows an `@odata.nextLink` (a full collection URL) for server-side paging
   * (G-01). Dataverse paging is forward-cookie based; rides cds-client on every
   * host so an absolute nextLink can be re-issued (Xrm.WebApi can't take one).
   */
  retrieveMultipleByUrl(url: string): Promise<IRetrieveMultipleResult>;
  /**
   * Executes a custom action (G-08). Unbound by default; pass `boundTo` for an
   * action bound to a record. Rides cds-client on every host (D-014), so
   * production never touches `Xrm.WebApi.online.execute`'s request-object
   * contract. Returns the action's response body (or undefined when empty).
   */
  executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityLogicalName: string; id: string }
  ): Promise<unknown>;
  /** Runs an on-demand classic workflow against one record by id (G-08). */
  executeWorkflow(workflowId: string, recordId: string): Promise<unknown>;
}

/**
 * Options for the native CRM lookup dialog (G-02), shaped to mirror
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

export interface INavigation {
  openForm(entityLogicalName: string, id?: string): Promise<void>;
  /**
   * Opens the unified clientui shell webresource with an app key + payload
   *. `webResourceName` defaults to "<prefix>clientui.html" resolution
   * at the call site, pass the deployed name explicitly from hooks.
   */
  openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    size?: { width?: number; height?: number }
  ): Promise<void>;
  openAlertDialog(text: string, title?: string): Promise<void>;
  /** Resolves true when the user confirmed. */
  openConfirmDialog(text: string, title?: string): Promise<boolean>;
  openUrl(url: string): void;
  /**
   * Opens the native CRM lookup dialog (G-02), the full platform picker
   * (recently used, view switching, cross-entity). Resolves the chosen
   * records (empty array on cancel). Mirrors `Xrm.Utility.lookupObjects`;
   * throws on hosts that cannot summon it.
   */
  lookupObjects(options: ILookupOptions): Promise<IEntityReference[]>;
}

export interface IContextUtils {
  /** Fire-and-forget alert, same as openAlertDialog without awaiting. */
  alert(message: string): void;
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

// ----------------------------------------------------------------- metadata

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
 * One resolved grid column from a saved view's layout (N-01). For a
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
  /** Raw `layoutjson` when the view carries it (N-01); the preferred layout source. */
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
   * Resolves a saved (system) view by its display name for an entity (G-05).
   * Throws a readable error when no active view matches or the name is
   * ambiguous. The near-universal "open this named view in a webresource"
   * pattern that avoids hardcoding savedquery ids.
   */
  getViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition>;
  /**
   * Resolves a transaction currency's symbol/precision by id (G-06b), cached
   * per currency. Money controls supply the result to the `currencySymbol`
   * prop so a record shows its real currency, not a hardcoded glyph.
   */
  getCurrencySymbol(transactionCurrencyId: string): Promise<ICurrencyInfo>;
  /**
   * Resolves an entity's icon URL (G-10): custom entities → their vector
   * webresource; OOTB entities → the platform `svg_<objecttypecode>.svg`.
   * Returns undefined when no icon can be resolved. Cached per entity.
   */
  getEntityIconUrl(entityLogicalName: string): Promise<string | undefined>;
}
