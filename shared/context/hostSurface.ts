/**
 * Host-surface helpers shared by all three context adapters (modern / V8 / PCF).
 * Consolidated here (rather than four tiny interdependent files) since every
 * adapter pulls the same pieces:
 *
 *   - Form access over an Xrm.Page-shaped object (XrmPageFormAccess)
 *   - The platform-mirror builders: client / device / utils extras
 *   - Locale/user-settings formatting resolution
 *   - Mapping to/from native Xrm.Utility.lookupObjects
 */

import type { CdsClient } from "../data/CdsClient";
import { buildFormContext, type IFormContext, type IHostFormContext } from "./formContextSurface";
import {
  normalizeGuid,
  toLookupValue,
  type IEntityReference,
  type IXrmLookupValue,
} from "../utils/EntityModel";
import {
  ClientFormFactor,
  type IAlertStrings,
  type IAppProperties,
  type IClientContext,
  type IConfirmStrings,
  type IContextUtils,
  type IDateFormatInfo,
  type IDeviceContext,
  type IDialogSizeOptions,
  type IEntityFormOptions,
  type IFileDetails,
  type IFormAccess,
  type IFormattingInfo,
  type IFormParameters,
  type IGeoPosition,
  type IGlobalContext,
  type ILookupOptions,
  type IOrganizationSettings,
  type IUserSettings,
} from "./IViewModelContext";

//#region Form access

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

/** Detects a kit IEntityReference by its shape (vs a plain value or object). */
function isEntityReference(value: unknown): value is IEntityReference {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<IEntityReference>;
  return typeof candidate.id === "string" && typeof candidate.logicalName === "string";
}

/**
 * IFormAccess as a small convenience wrapper over the full {@link IFormContext}
 * mirror: the common id/entity/attribute reads without walking the object
 * model. The `raw` host page stays available for cases the typed surface does
 * not cover.
 */
export class XrmPageFormAccess implements IFormAccess {
  readonly raw: unknown;
  private readonly formContext: IFormContext;

  constructor(formContext: IFormContext, raw: unknown) {
    this.formContext = formContext;
    this.raw = raw;
  }

  /** True when the page actually has a record form behind it. */
  static hasForm(page: IXrmPageLike | undefined): page is IXrmPageLike {
    return !!page?.data?.entity;
  }

  getRecordId(): string | null {
    // The wrapper already normalizes the id and returns "" while unsaved.
    return this.formContext.data.entity.getId() || null;
  }

  getEntityName(): string | null {
    return this.formContext.data.entity.getEntityName() || null;
  }

  getAttributeValue<T = unknown>(attributeLogicalName: string): T | null {
    return this.formContext.getAttribute(attributeLogicalName)?.getValue<T>() ?? null;
  }

  setAttributeValue(attributeLogicalName: string, value: unknown): void {
    // A kit IEntityReference is converted to the Xrm.LookupValue[] write shape
    // (braced GUID + entityType) so apps can push a chosen lookup straight onto
    // a form attribute without hand-rolling the conversion.
    const resolved = isEntityReference(value) ? [toLookupValue(value)] : value;
    this.formContext.getAttribute(attributeLogicalName)?.setValue(resolved);
  }
}

/** A live read of the hosting form page; called again until a form appears. */
export type FormPageSource = () => IXrmPageLike | undefined;

/**
 * The lazy form binding shared by the webresource adapters. The form page is
 * a SOURCE, not a boot-time snapshot: the clienthooks injection arrives
 * through getContentWindow's promise on the form's own schedule, so it can
 * land after the context was already built from the frame walk. The binding
 * re-reads the source on every access until a page with a real form appears,
 * then caches, so formContext/formAccess keep stable identities once
 * resolved. Consumers that poll form access (RecordReady) pick the form up
 * whenever the injection lands; hosts that never receive one just keep
 * reading undefined, exactly as before.
 */
export class LazyFormBinding {
  private binding?: { formContext: IFormContext; formAccess: IFormAccess };
  private readonly source: FormPageSource;
  private readonly hostLabel: string;

  constructor(source: FormPageSource, hostLabel: string) {
    this.source = source;
    this.hostLabel = hostLabel;
  }

  get formContext(): IFormContext | undefined {
    return this.resolve()?.formContext;
  }

  get formAccess(): IFormAccess | undefined {
    return this.resolve()?.formAccess;
  }

  private resolve(): { formContext: IFormContext; formAccess: IFormAccess } | undefined {
    if (!this.binding) {
      const page = this.source();
      if (XrmPageFormAccess.hasForm(page)) {
        const formContext = buildFormContext(page as unknown as IHostFormContext, this.hostLabel);
        this.binding = { formContext, formAccess: new XrmPageFormAccess(formContext, page) };
      }
    }
    return this.binding;
  }
}

//#endregion

//#region Platform-mirror builders: client / device / utils extras

/** Structural slice of `GlobalContext.client` / PCF `context.client`. */
export interface IXrmClientLike {
  getFormFactor?(): number;
  getClient?(): string;
  getClientState?(): string;
  isOffline?(): boolean;
  isNetworkAvailable?(): boolean;
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
  getAllowedStatusTransitions?(entityLogicalName: string, stateCode?: number): PromiseLike<number[]>;
  refreshParentGrid?(lookupValue: unknown): void;
}

/** Builds the kit `client` surface, defaulting members the host doesn't expose. */
export function clientFromSource(source: IXrmClientLike | undefined): IClientContext {
  return {
    getFormFactor: () => (source?.getFormFactor?.() as ClientFormFactor) ?? ClientFormFactor.Unknown,
    getClient: () => source?.getClient?.() ?? "Web",
    getClientState: () => source?.getClientState?.() ?? "Online",
    isOffline: () => source?.isOffline?.() ?? false,
    isNetworkAvailable: () => source?.isNetworkAvailable?.() ?? true,
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
 * undefined, void methods do nothing, and `getAllowedStatusTransitions` rejects.
 * `getEntityMetadata` is deliberately absent: each adapter composes it on top
 * (createGetEntityMetadata) because it needs the host's native read plus the
 * OData fallback, which this builder has no access to.
 */
export function utilsFromXrm(
  alert: (message: string) => void,
  utility: IXrmUtilityExtras | undefined,
  hostLabel: string
): Omit<IContextUtils, "getEntityMetadata"> {
  return {
    alert,
    getResourceString: (webResourceName, key) =>
      utility?.getResourceString?.(webResourceName, key) ?? undefined,
    showProgressIndicator: (message) => utility?.showProgressIndicator?.(message),
    closeProgressIndicator: () => utility?.closeProgressIndicator?.(),
    getAllowedStatusTransitions: (entityLogicalName, stateCode) =>
      utility?.getAllowedStatusTransitions
        ? Promise.resolve(utility.getAllowedStatusTransitions(entityLogicalName, stateCode))
        : Promise.reject<number[]>(
            new Error(`getAllowedStatusTransitions is not available in the ${hostLabel} host.`)
          ),
    refreshParentGrid: (lookupValue) => utility?.refreshParentGrid?.(lookupValue),
  };
}

//#endregion

//#region Locale / user-settings formatting

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
    shortTimePattern: readString(raw, "ShortTimePattern", "shortTimePattern"),
  };
}

/**
 * Fills in the decimal symbol, number separator, currency format code, and
 * short time pattern from the `usersettings` entity when the host did not
 * already provide them. Whatever the caller supplies wins; the query fills only
 * the gaps. Failures are swallowed, so the controls fall back to browser-locale
 * formatting.
 */
export async function resolveFormatting(input: {
  client: CdsClient;
  userId: string;
  dateFormatInfo?: IDateFormatInfo;
  decimalSymbol?: string;
  numberSeparator?: string;
  currencyFormatCode?: number;
  timeFormat?: string;
}): Promise<IFormattingInfo> {
  let { decimalSymbol, numberSeparator, currencyFormatCode, timeFormat } = input;
  if (
    decimalSymbol === undefined ||
    numberSeparator === undefined ||
    currencyFormatCode === undefined ||
    timeFormat === undefined
  ) {
    try {
      const result = await input.client.retrieveMultiple(
        "usersettingscollection",
        `?$select=decimalsymbol,numberseparator,currencyformatcode,timeformatstring&$filter=systemuserid eq ${normalizeGuid(input.userId)}`
      );
      const row = result.entities[0];
      if (row) {
        // currencyformatcode is a number column; timeformatstring a string.
        decimalSymbol = decimalSymbol ?? (row.decimalsymbol as string | undefined);
        numberSeparator = numberSeparator ?? (row.numberseparator as string | undefined);
        currencyFormatCode = currencyFormatCode ?? (row.currencyformatcode as number | undefined);
        timeFormat = timeFormat ?? (row.timeformatstring as string | undefined);
      }
    } catch {
      // leave undefined, controls fall back to defaults
    }
  }
  return {
    decimalSymbol,
    numberSeparator,
    currencyFormatCode,
    timeFormat,
    dateFormatInfo: input.dateFormatInfo,
  };
}

//#endregion

//#region Global context / settings

/** Structural slice of an Xrm `Collection.ItemCollection` (roles, etc.). */
export interface IXrmCollectionLike<T> {
  getAll?(): T[];
}

/** Structural slice of `GlobalContext.userSettings` / PCF `context.userSettings`. */
export interface IXrmUserSettingsLike {
  userId: string;
  userName: string;
  languageId?: number;
  isRTL?: boolean;
  isHighContrastEnabled?: boolean;
  isGuidedHelpEnabled?: boolean;
  defaultDashboardId?: string;
  /** Roles as the native collection or a plain array. */
  roles?: IXrmLookupValue[] | IXrmCollectionLike<IXrmLookupValue>;
  securityRoles?: string[];
  securityRolePrivileges?: string[];
  transactionCurrency?: IXrmLookupValue;
  transactionCurrencyId?: string;
  dateFormattingInfo?: Record<string, unknown>;
  getTimeZoneOffsetMinutes?(): number;
}

/** Structural slice of `GlobalContext.organizationSettings`. */
export interface IXrmOrganizationSettingsLike {
  organizationId?: string;
  uniqueName?: string;
  languageId?: number;
  baseCurrency?: IXrmLookupValue;
  baseCurrencyId?: string;
  isAutoSaveEnabled?: boolean;
  defaultCountryCode?: string;
  useSkypeProtocol?: boolean;
  organizationGeo?: string;
}

/**
 * Structural slice of the native `getGlobalContext()` the builder reads. Modern
 * hosts satisfy it whole; the V8 and PCF adapters pass a shim with the subset
 * their host exposes (the absent members degrade or reject in the builder).
 */
export interface IXrmGlobalContextLike {
  getClientUrl(): string;
  getVersion?(): string;
  prependOrgName?(path: string): string;
  getCurrentAppProperties?(): PromiseLike<IAppProperties>;
  getCurrentAppName?(): PromiseLike<string>;
  getCurrentAppUrl?(): string;
  /** Deprecated org-name getter, the only source on the legacy host. */
  getOrgUniqueName?(): string;
  /** Deprecated org-LCID getter, the only source on the legacy host. */
  getOrgLcid?(): number;
  organizationSettings?: IXrmOrganizationSettingsLike;
  userSettings: IXrmUserSettingsLike;
}

/** Reads a roles-style value that may be a native collection or a plain array. */
function readLookupCollection(
  value: IXrmLookupValue[] | IXrmCollectionLike<IXrmLookupValue> | undefined
): IXrmLookupValue[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : (value.getAll?.() ?? []);
}

/**
 * Builds the kit `globalContext` surface from a host's `getGlobalContext()`,
 * normalizing the user id and roles collection, falling back to the deprecated
 * org getters where the settings objects are absent, and rejecting the
 * app-properties calls on hosts that do not expose business apps.
 */
export function buildGlobalContext(
  source: IXrmGlobalContextLike,
  hostLabel: string
): IGlobalContext {
  const org = source.organizationSettings;
  const user = source.userSettings;

  const organizationSettings: IOrganizationSettings = {
    organizationId: org?.organizationId ?? "",
    uniqueName: org?.uniqueName ?? source.getOrgUniqueName?.() ?? "",
    languageId: org?.languageId ?? source.getOrgLcid?.(),
    baseCurrency: org?.baseCurrency,
    baseCurrencyId: org?.baseCurrencyId,
    isAutoSaveEnabled: org?.isAutoSaveEnabled,
    defaultCountryCode: org?.defaultCountryCode,
    useSkypeProtocol: org?.useSkypeProtocol,
    organizationGeo: org?.organizationGeo,
  };

  const userSettings: IUserSettings = {
    userId: normalizeGuid(user.userId),
    userName: user.userName,
    languageId: user.languageId,
    isRTL: user.isRTL,
    isHighContrastEnabled: user.isHighContrastEnabled,
    isGuidedHelpEnabled: user.isGuidedHelpEnabled,
    defaultDashboardId: user.defaultDashboardId,
    roles: readLookupCollection(user.roles),
    securityRoles: user.securityRoles ?? [],
    securityRolePrivileges: user.securityRolePrivileges,
    transactionCurrency: user.transactionCurrency,
    transactionCurrencyId: user.transactionCurrencyId,
    dateFormattingInfo: user.dateFormattingInfo,
    getTimeZoneOffsetMinutes: () => user.getTimeZoneOffsetMinutes?.() ?? 0,
  };

  const failApp = (capability: string): Promise<never> =>
    Promise.reject(new Error(`${capability} is not available in the ${hostLabel} host.`));

  return {
    clientUrl: source.getClientUrl(),
    organizationSettings,
    userSettings,
    getVersion: () => source.getVersion?.() ?? "",
    prependOrgName: (path) => source.prependOrgName?.(path) ?? path,
    getCurrentAppProperties: () =>
      source.getCurrentAppProperties
        ? Promise.resolve(source.getCurrentAppProperties())
        : failApp("getCurrentAppProperties"),
    getCurrentAppName: () =>
      source.getCurrentAppName
        ? Promise.resolve(source.getCurrentAppName())
        : failApp("getCurrentAppName"),
    getCurrentAppUrl: () => source.getCurrentAppUrl?.() ?? "",
  };
}

//#endregion

//#region Dialog argument normalization

/**
 * Resolves the convenience `(text, title?)` and full `(strings, options?)`
 * overloads of `openAlertDialog` into one native-shaped strings object plus
 * optional size options. The first argument's type decides which form is meant.
 */
export function resolveAlertArgs(
  textOrStrings: string | IAlertStrings,
  titleOrOptions?: string | IDialogSizeOptions
): { strings: IAlertStrings; options?: IDialogSizeOptions } {
  if (typeof textOrStrings === "string") {
    return {
      strings: {
        text: textOrStrings,
        title: typeof titleOrOptions === "string" ? titleOrOptions : undefined,
      },
    };
  }
  return {
    strings: textOrStrings,
    options: typeof titleOrOptions === "object" ? titleOrOptions : undefined,
  };
}

/**
 * Resolves the convenience `(entityLogicalName, id?)` and full
 * `(options, formParameters?)` overloads of `openForm` into one native-shaped
 * options object plus optional form parameters, normalizing `entityId`.
 */
export function resolveOpenFormArgs(
  entityOrOptions: string | IEntityFormOptions,
  idOrParams?: string | IFormParameters
): { options: IEntityFormOptions; formParameters?: IFormParameters } {
  if (typeof entityOrOptions === "string") {
    const id = typeof idOrParams === "string" ? idOrParams : undefined;
    return {
      options: { entityName: entityOrOptions, entityId: id ? normalizeGuid(id) : undefined },
    };
  }
  return {
    options: {
      ...entityOrOptions,
      entityId: entityOrOptions.entityId ? normalizeGuid(entityOrOptions.entityId) : undefined,
    },
    formParameters: typeof idOrParams === "object" ? idOrParams : undefined,
  };
}

/** As {@link resolveAlertArgs}, for `openConfirmDialog`. */
export function resolveConfirmArgs(
  textOrStrings: string | IConfirmStrings,
  titleOrOptions?: string | IDialogSizeOptions
): { strings: IConfirmStrings; options?: IDialogSizeOptions } {
  if (typeof textOrStrings === "string") {
    return {
      strings: {
        text: textOrStrings,
        title: typeof titleOrOptions === "string" ? titleOrOptions : undefined,
      },
    };
  }
  return {
    strings: textOrStrings,
    options: typeof titleOrOptions === "object" ? titleOrOptions : undefined,
  };
}

//#endregion

//#region Native lookup dialog mapping

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
//#endregion
