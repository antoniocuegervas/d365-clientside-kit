import type { IRetrieveMultipleResult } from "../data/CdsClient";
import type { IOptionItem } from "../utils/EntityModel";

/**
 * IViewModelContext, everything shared React code may need from its host.
 *
 * Smart controls, ViewModels, client hooks, and PCF roots use this contract
 * for ALL CRM access. They must not reach into global Xrm.Page, raw
 * GetGlobalContext(), or parent.Xrm. Presentational controls never see this
 * interface at all.
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
}

export interface IUserInfo {
  id: string;
  name: string;
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

/** A saved view (savedquery) definition resolved for grid rendering. */
export interface IViewDefinition {
  id: string;
  name: string;
  entityLogicalName: string;
  fetchXml: string;
  layoutXml: string;
  /** Column attribute names + widths parsed from layoutXml, in order. */
  columns: Array<{ name: string; width: number }>;
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
}
