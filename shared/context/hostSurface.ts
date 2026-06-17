/**
 * Host-surface helpers shared by all three context adapters (modern / V8 / PCF).
 * Consolidated here (rather than four tiny interdependent files) since every
 * adapter pulls the same pieces:
 *
 *   - Form access over an Xrm.Page-shaped object (XrmPageFormAccess)
 *   - The seamless platform-mirror builders: client / device / utils extras
 *   - Locale/user-settings formatting resolution
 *   - Mapping to/from native Xrm.Utility.lookupObjects
 */

import type { CdsClient } from "../data/CdsClient";
import {
  normalizeGuid,
  toLookupValue,
  type IEntityReference,
  type IXrmLookupValue,
} from "../utils/EntityModel";
import {
  ClientFormFactor,
  type IClientContext,
  type IContextUtils,
  type IDateFormatInfo,
  type IDeviceContext,
  type IFileDetails,
  type IFormAccess,
  type IFormattingInfo,
  type IGeoPosition,
  type ILookupOptions,
} from "./IViewModelContext";

// ===========================================================================
// Form access
// ===========================================================================

/**
 * Structural slice of an Xrm.Page / formContext that form access needs. It is
 * identical between modern UCI webresources (parent Xrm.Page) and CRM 8.x.
 */
export interface IXrmPageLike {
  data?: {
    entity?: {
      getId(): string;
      getEntityName(): string;
      attributes: {
        get(name: string): { getValue(): unknown; setValue(value: unknown): void } | null;
      };
    };
  };
}

/** Duck-types a kit IEntityReference (vs a plain primitive/object value). */
function isEntityReference(value: unknown): value is IEntityReference {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<IEntityReference>;
  return typeof candidate.id === "string" && typeof candidate.logicalName === "string";
}

/** IFormAccess over an Xrm.Page-shaped object. */
export class XrmPageFormAccess implements IFormAccess {
  readonly raw: unknown;
  private readonly page: IXrmPageLike;

  constructor(page: IXrmPageLike) {
    this.page = page;
    this.raw = page;
  }

  /** True when the page actually has a record form behind it. */
  static hasForm(page: IXrmPageLike | undefined): page is IXrmPageLike {
    return !!page?.data?.entity;
  }

  getRecordId(): string | null {
    const id = this.page.data?.entity?.getId() ?? "";
    return id ? normalizeGuid(id) : null;
  }

  getEntityName(): string | null {
    return this.page.data?.entity?.getEntityName() ?? null;
  }

  getAttributeValue<T = unknown>(attributeLogicalName: string): T | null {
    const attribute = this.page.data?.entity?.attributes.get(attributeLogicalName);
    return (attribute?.getValue() as T | undefined) ?? null;
  }

  setAttributeValue(attributeLogicalName: string, value: unknown): void {
    // A kit IEntityReference is converted to the Xrm.LookupValue[] write shape
    // (braced GUID + entityType) so apps can push a chosen lookup straight onto
    // a form attribute without hand-rolling the conversion.
    const resolved = isEntityReference(value) ? [toLookupValue(value)] : value;
    this.page.data?.entity?.attributes.get(attributeLogicalName)?.setValue(resolved);
  }
}

// ===========================================================================
// Platform-mirror builders: client / device / utils extras
// ===========================================================================

/** Structural slice of `GlobalContext.client` / PCF `context.client`. */
export interface IXrmClientLike {
  getFormFactor?(): number;
  getClient?(): string;
  getClientState?(): string;
  isOffline?(): boolean;
}

/** Structural slice of `Xrm.Device` / PCF `context.device`. */
export interface IXrmDeviceLike {
  captureImage?(options?: unknown): PromiseLike<unknown>;
  captureAudio?(): PromiseLike<unknown>;
  captureVideo?(): PromiseLike<unknown>;
  getBarcodeValue?(): PromiseLike<unknown>;
  getCurrentPosition?(): PromiseLike<unknown>;
  pickFile?(options?: unknown): PromiseLike<unknown>;
}

/** Structural slice of the `Xrm.Utility` extras the kit mirrors. */
export interface IXrmUtilityExtras {
  getResourceString?(webResourceName: string, key: string): string;
  showProgressIndicator?(message: string): void;
  closeProgressIndicator?(): void;
  getAllowedStatusTransitions?(entityLogicalName: string, stateCode: number): PromiseLike<unknown>;
  refreshParentGrid?(lookupValue: unknown): void;
}

/** Builds the kit `client` surface, defaulting members the host doesn't expose. */
export function clientFromSource(source: IXrmClientLike | undefined): IClientContext {
  return {
    getFormFactor: () => (source?.getFormFactor?.() as ClientFormFactor) ?? ClientFormFactor.Unknown,
    getClient: () => source?.getClient?.() ?? "Web",
    getClientState: () => source?.getClientState?.() ?? "Online",
    isOffline: () => source?.isOffline?.() ?? false,
  };
}

/** Builds the kit `device` surface; each member throws when the host lacks it. */
export function deviceFromSource(
  source: IXrmDeviceLike | undefined,
  hostLabel: string
): IDeviceContext {
  const fail = (capability: string): Promise<never> =>
    Promise.reject(new Error(`device.${capability} is not available in the ${hostLabel} host.`));
  return {
    captureImage: (options) =>
      source?.captureImage
        ? Promise.resolve(source.captureImage(options) as PromiseLike<IFileDetails | null>)
        : fail("captureImage"),
    captureAudio: () =>
      source?.captureAudio
        ? Promise.resolve(source.captureAudio() as PromiseLike<IFileDetails | null>)
        : fail("captureAudio"),
    captureVideo: () =>
      source?.captureVideo
        ? Promise.resolve(source.captureVideo() as PromiseLike<IFileDetails | null>)
        : fail("captureVideo"),
    getBarcodeValue: () =>
      source?.getBarcodeValue
        ? Promise.resolve(source.getBarcodeValue() as PromiseLike<string | null>)
        : fail("getBarcodeValue"),
    getCurrentPosition: () =>
      source?.getCurrentPosition
        ? Promise.resolve(source.getCurrentPosition() as PromiseLike<IGeoPosition | null>)
        : fail("getCurrentPosition"),
    pickFile: (options) =>
      source?.pickFile
        ? Promise.resolve(source.pickFile(options) as PromiseLike<IFileDetails[]>)
        : fail("pickFile"),
  };
}

/**
 * Builds the kit `utils` surface (alert + Xrm.Utility extras) from a structural
 * `Xrm.Utility`. Members the host lacks degrade: string getters return
 * undefined, void methods no-op, and `getAllowedStatusTransitions` rejects.
 */
export function utilsFromXrm(
  alert: (message: string) => void,
  utility: IXrmUtilityExtras | undefined,
  hostLabel: string
): IContextUtils {
  return {
    alert,
    getResourceString: (webResourceName, key) =>
      utility?.getResourceString?.(webResourceName, key) ?? undefined,
    showProgressIndicator: (message) => utility?.showProgressIndicator?.(message),
    closeProgressIndicator: () => utility?.closeProgressIndicator?.(),
    getAllowedStatusTransitions: (entityLogicalName, stateCode) =>
      utility?.getAllowedStatusTransitions
        ? Promise.resolve(utility.getAllowedStatusTransitions(entityLogicalName, stateCode))
        : Promise.reject(
            new Error(`getAllowedStatusTransitions is not available in the ${hostLabel} host.`)
          ),
    refreshParentGrid: (lookupValue) => utility?.refreshParentGrid?.(lookupValue),
  };
}

// ===========================================================================
// Locale / user-settings formatting
// ===========================================================================

/** Loose shape covering both Xrm (PascalCase) and PCF (camelCase) date-format objects. */
type RawDateFormat = Record<string, unknown> | undefined;

function readStringArray(raw: RawDateFormat, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = raw?.[key];
    if (Array.isArray(value)) {
      return value.map((v) => String(v));
    }
  }
  return [];
}

function readNumber(raw: RawDateFormat, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return fallback;
}

function readString(raw: RawDateFormat, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Normalizes a host date-format object (Xrm `dateFormattingInfo` or PCF
 * `dateFormattingInfo`) to the kit's `IDateFormatInfo`. Trims the trailing
 * empty 13th month some hosts include so the arrays are calendar-ready.
 */
export function normalizeDateFormatInfo(raw: RawDateFormat): IDateFormatInfo | undefined {
  if (!raw) {
    return undefined;
  }
  const monthNames = readStringArray(raw, "MonthNames", "monthNames").filter((n) => n).slice(0, 12);
  const abbreviatedMonthNames = readStringArray(raw, "AbbreviatedMonthNames", "abbreviatedMonthNames")
    .filter((n) => n)
    .slice(0, 12);
  const dayNames = readStringArray(raw, "DayNames", "dayNames").slice(0, 7);
  const shortestDayNames = readStringArray(
    raw,
    "ShortestDayNames",
    "shortestDayNames",
    "AbbreviatedDayNames",
    "abbreviatedDayNames"
  ).slice(0, 7);
  if (monthNames.length === 0 && dayNames.length === 0) {
    return undefined; // nothing usable
  }
  return {
    dayNames,
    monthNames,
    shortestDayNames,
    abbreviatedMonthNames,
    firstDayOfWeek: readNumber(raw, 0, "FirstDayOfWeek", "firstDayOfWeek"),
    shortDatePattern: readString(raw, "ShortDatePattern", "shortDatePattern"),
  };
}

/**
 * Fills in the decimal symbol / number separator from the `usersettings`
 * entity when the host did not already provide them. Failures are swallowed, so
 * the controls fall back to browser-locale formatting.
 */
export async function resolveFormatting(input: {
  client: CdsClient;
  userId: string;
  dateFormatInfo?: IDateFormatInfo;
  decimalSymbol?: string;
  numberSeparator?: string;
}): Promise<IFormattingInfo> {
  let { decimalSymbol, numberSeparator } = input;
  if (decimalSymbol === undefined || numberSeparator === undefined) {
    try {
      const result = await input.client.retrieveMultiple(
        "usersettingscollection",
        `?$select=decimalsymbol,numberseparator&$filter=systemuserid eq ${normalizeGuid(input.userId)}`
      );
      const row = result.entities[0];
      if (row) {
        decimalSymbol = decimalSymbol ?? (row.decimalsymbol as string | undefined);
        numberSeparator = numberSeparator ?? (row.numberseparator as string | undefined);
      }
    } catch {
      // leave undefined, controls fall back to defaults
    }
  }
  return { decimalSymbol, numberSeparator, dateFormatInfo: input.dateFormatInfo };
}

// ===========================================================================
// Native lookup dialog mapping
// ===========================================================================

/** Native lookup result row, `Xrm.Utility.lookupObjects` resolves an array of these. */
export type { IXrmLookupValue };

/** Native lookup options object passed to `Xrm.Utility.lookupObjects`. */
export interface IXrmLookupOptions {
  allowMultiSelect?: boolean;
  defaultEntityType?: string;
  entityTypes?: string[];
  disableMru?: boolean;
  filters?: Array<{ filterXml: string; entityLogicalName: string }>;
  viewIds?: string[];
}

/** Structural slice of `Xrm.Utility` the adapters rely on for the lookup dialog. */
export interface IXrmUtilityLookup {
  lookupObjects?(options: IXrmLookupOptions): PromiseLike<IXrmLookupValue[] | undefined>;
}

/** Maps the kit's lookup options to the native object (1:1). */
export function toXrmLookupOptions(options: ILookupOptions): IXrmLookupOptions {
  return {
    allowMultiSelect: options.allowMultiSelect,
    defaultEntityType: options.defaultEntityType,
    entityTypes: options.entityTypes,
    disableMru: options.disableMru,
    filters: options.filters?.map((f) => ({
      filterXml: f.filterXml,
      entityLogicalName: f.entityLogicalName,
    })),
    viewIds: options.viewIds,
  };
}

/** Maps native lookup results to kit entity references (empty on cancel). */
export function toEntityReferences(values: IXrmLookupValue[] | undefined | null): IEntityReference[] {
  return (values ?? []).map((value) => ({
    id: normalizeGuid(value.id),
    logicalName: value.entityType,
    name: value.name,
  }));
}

/** Calls the host lookup dialog or throws a clear error when unavailable. */
export async function callLookupObjects(
  utility: IXrmUtilityLookup | undefined,
  options: ILookupOptions,
  hostLabel: string
): Promise<IEntityReference[]> {
  if (typeof utility?.lookupObjects !== "function") {
    throw new Error(
      `The native lookup dialog (lookupObjects) is not available in the ${hostLabel} host.`
    );
  }
  const result = await utility.lookupObjects(toXrmLookupOptions(options));
  return toEntityReferences(result);
}
