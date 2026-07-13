import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { CdsEntityMetadataProvider } from "../metadata/CdsEntityMetadataProvider";
import { KitMetadataSource } from "../metadata/KitMetadataSource";
import { createGetEntityMetadata } from "../metadata/createGetEntityMetadata";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";
import { setKitStringsLanguage } from "../localization/kitStrings";
import { callLookupObjects, type IXrmUtilityLookup } from "./hostSurface";
import { normalizeDateFormatInfo, resolveFormatting } from "./hostSurface";
import {
  buildGlobalContext,
  clientFromSource,
  deviceFromSource,
  resolveAlertArgs,
  resolveConfirmArgs,
  resolveOpenFormArgs,
  utilsFromXrm,
  type IXrmClientLike,
  type IXrmDeviceLike,
} from "./hostSurface";
import type {
  IAlertStrings,
  IChangeSetRequest,
  IChangeSetResponse,
  IClientContext,
  IClientUILaunchOptions,
  IConfirmStrings,
  IContextUtils,
  IDeviceContext,
  IDialogSizeOptions,
  IEntityFormOptions,
  IErrorDialogOptions,
  IExecuteResponse,
  IFileDetails,
  IFormattingInfo,
  IFormParameters,
  IGlobalContext,
  ILookupOptions,
  IMetadataApi,
  INavigateToPageInput,
  INavigation,
  INavigationOptions,
  IOpenFileOptions,
  IRecordWriteResult,
  IUserInfo,
  IViewModelContext,
  IWebApi,
  IWebApiRequest,
  IWindowOptions,
} from "./IViewModelContext";

/**
 * Structural slice of ComponentFramework.Context that PCFContext consumes.
 * Declared structurally so shared/ compiles without the PCF type package;
 * a real `ComponentFramework.Context<TInputs>` satisfies it as-is.
 */
export interface IPcfContextLike {
  webAPI: {
    createRecord(
      entityType: string,
      data: Record<string, unknown>
    ): PromiseLike<{ id: string }>;
    updateRecord(entityType: string, id: string, data: Record<string, unknown>): PromiseLike<unknown>;
    deleteRecord(entityType: string, id: string): PromiseLike<unknown>;
    retrieveRecord(entityType: string, id: string, options?: string): PromiseLike<unknown>;
    retrieveMultipleRecords(
      entityType: string,
      options?: string,
      maxPageSize?: number
    ): PromiseLike<{ entities: Array<Record<string, unknown>>; nextLink?: string }>;
  };
  userSettings: {
    userId: string;
    userName: string;
    languageId?: number;
    dateFormattingInfo?: Record<string, unknown>;
    numberFormattingInfo?: Record<string, unknown>;
    isRTL?: boolean;
    getTimeZoneOffsetMinutes?(): number;
  };
  navigation: {
    openForm(options: IEntityFormOptions, formParameters?: IFormParameters): PromiseLike<unknown>;
    openAlertDialog(strings: IAlertStrings, options?: IDialogSizeOptions): PromiseLike<unknown>;
    openConfirmDialog(
      strings: IConfirmStrings,
      options?: IDialogSizeOptions
    ): PromiseLike<{ confirmed: boolean }>;
    openUrl(url: string, options?: IDialogSizeOptions): void;
    openWebResource(name: string, options?: unknown, data?: string): void;
    openErrorDialog(options: IErrorDialogOptions): PromiseLike<unknown>;
    openFile(file: IFileDetails, options?: IOpenFileOptions): PromiseLike<unknown>;
    navigateTo(pageInput: unknown, options?: unknown): PromiseLike<unknown>;
  };
  /** Undocumented but stable, the only client-url source inside PCF. */
  page?: { getClientUrl?(): string };
  /** Optional native lookup dialog and metadata store, when the PCF host surfaces them. */
  utils?: IXrmUtilityLookup & {
    /** The platform metadata store read; present on real PCF hosts. */
    getEntityMetadata?(entityName: string, attributes?: string[]): PromiseLike<unknown>;
  };
  /** Client/form-factor surface. */
  client?: IXrmClientLike;
  /** Device capture surface. */
  device?: IXrmDeviceLike;
  /** Control resources for localized strings. */
  resources?: { getString?(id: string): string };
}

/**
 * PCFContext, IViewModelContext over a ComponentFramework.Context.
 * Construct once in the PCF root's init() and keep for the control lifetime.
 */
export class PCFContext implements IViewModelContext {
  readonly clientUrl: string;
  readonly user: IUserInfo;
  readonly orgVersion: string;
  readonly isLegacy = false;
  readonly webAPI: IWebApi;
  readonly metadata: IMetadataApi;
  readonly navigation: INavigation;
  readonly utils: IContextUtils;
  readonly globalContext: IGlobalContext;
  readonly client: IClientContext;
  readonly device: IDeviceContext;

  private readonly cdsClient: CdsClient;
  private readonly rawDateFormat: Record<string, unknown> | undefined;
  private readonly rawNumberFormat: Record<string, unknown> | undefined;
  private formattingPromise?: Promise<IFormattingInfo>;

  constructor(source: IPcfContextLike, options?: { clientUrl?: string }) {
    // Same-origin relative URLs work when no client url is resolvable.
    this.clientUrl = options?.clientUrl ?? source.page?.getClientUrl?.() ?? "";
    if (!this.clientUrl) {
      // Not fatal (relative same-origin URLs are correct in the embedded
      // host), but say so: in a harness or a host without page.getClientUrl,
      // "every smart field shows Unavailable" starts here.
      console.warn(
        "PCFContext: no client URL is resolvable; metadata and cds-client calls use relative same-origin URLs."
      );
    }
    this.user = {
      id: normalizeGuid(source.userSettings.userId),
      name: source.userSettings.userName,
      languageId: source.userSettings.languageId,
      isRTL: source.userSettings.isRTL,
      timeZoneOffsetMinutes: source.userSettings.getTimeZoneOffsetMinutes?.(),
    };
    // The kit chrome follows the user language; configureKitStrings overrides.
    if (this.user.languageId !== undefined) {
      setKitStringsLanguage(this.user.languageId);
    }
    this.rawDateFormat = source.userSettings.dateFormattingInfo;
    this.rawNumberFormat = source.userSettings.numberFormattingInfo;
    this.orgVersion = "9.2"; // PCF hosts are modern; the framework hides the build number
    // PCF exposes userSettings but no full global context; build the subset and
    // let the app-properties calls reject.
    this.globalContext = buildGlobalContext(
      {
        getClientUrl: () => this.clientUrl,
        getVersion: () => this.orgVersion,
        userSettings: source.userSettings,
      },
      "PCF"
    );

    const client = new CdsClient({ clientUrl: this.clientUrl });
    this.cdsClient = client;
    this.webAPI = new PcfWebApi(source.webAPI, client);
    // The kit metadata helpers: views and currency are data reads and ride
    // the PCF webAPI (offline-capable) through this.webAPI; activity types
    // and icons are EntityDefinitions queries and stay on cds-client.
    // Entity/attribute metadata mirrors the standard API below.
    const metadataProvider = new CdsEntityMetadataProvider(client);
    this.metadata = new MetadataService(
      new KitMetadataSource({ dataReads: this.webAPI, client }),
      [metadataProvider]
    );
    this.navigation = new PcfNavigation(source.navigation, source.utils);
    // Platform-mirror surface: client/device native to PCF; resource strings via the
    // control's resources; the Xrm.Utility progress/status extras have no PCF
    // equivalent and degrade (do nothing / reject).
    const resources = source.resources;
    const nativeGetEntityMetadata = source.utils?.getEntityMetadata;
    this.utils = {
      ...utilsFromXrm(
        (message: string) => void this.navigation.openAlertDialog(message),
        undefined,
        "PCF"
      ),
      getResourceString: (_webResourceName, key) => resources?.getString?.(key) ?? undefined,
      // Standard-mirrored metadata: context.utils.getEntityMetadata passes
      // through untouched (platform-cached, offline-capable); the OData
      // synthesis is the fallback, and the whole path when the host surface
      // is absent (a harness, or a stripped embedded host).
      getEntityMetadata: createGetEntityMetadata({
        native:
          typeof nativeGetEntityMetadata === "function"
            ? (entityName, attributes) => source.utils!.getEntityMetadata!(entityName, attributes)
            : undefined,
        provider: metadataProvider,
      }),
    };
    this.client = clientFromSource(source.client);
    this.device = deviceFromSource(source.device, "PCF");
  }

  getFormatting(): Promise<IFormattingInfo> {
    // PCF carries both date and number formatting on userSettings: separators
    // and the currency pattern come off numberFormattingInfo, the short time
    // pattern off dateFormattingInfo. Fall back to the usersettings entity for
    // anything the host didn't supply. Cached.
    const dateFormatInfo = normalizeDateFormatInfo(this.rawDateFormat);
    this.formattingPromise ??= resolveFormatting({
      client: this.cdsClient,
      userId: this.user.id,
      dateFormatInfo,
      decimalSymbol: readNumberFormat(this.rawNumberFormat, "numberDecimalSeparator", "NumberDecimalSeparator"),
      numberSeparator: readNumberFormat(this.rawNumberFormat, "numberGroupSeparator", "NumberGroupSeparator"),
      currencyFormatCode: readNumberFormatCode(
        this.rawNumberFormat,
        "currencyPositivePattern",
        "CurrencyPositivePattern"
      ),
      timeFormat: dateFormatInfo?.shortTimePattern,
    });
    return this.formattingPromise;
  }
}

function readNumberFormat(
  raw: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return undefined;
}

/** Reads a numeric number-format member, tolerating a numeric string (Number()d). */
function readNumberFormatCode(
  raw: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

class PcfWebApi implements IWebApi {
  constructor(
    private readonly api: IPcfContextLike["webAPI"],
    private readonly client: CdsClient
  ) {}

  async createRecord(
    entityLogicalName: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult> {
    const result = await this.api.createRecord(entityLogicalName, data);
    return { entityType: entityLogicalName, id: normalizeGuid(result.id) };
  }

  async updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult> {
    const normalizedId = normalizeGuid(id);
    await this.api.updateRecord(entityLogicalName, normalizedId, data);
    return { entityType: entityLogicalName, id: normalizedId };
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<IRecordWriteResult> {
    const normalizedId = normalizeGuid(id);
    await this.api.deleteRecord(entityLogicalName, normalizedId);
    return { entityType: entityLogicalName, id: normalizedId };
  }

  async retrieveRecord(
    entityLogicalName: string,
    id: string,
    options?: string
  ): Promise<Record<string, unknown>> {
    return (await this.api.retrieveRecord(entityLogicalName, normalizeGuid(id), options)) as Record<
      string,
      unknown
    >;
  }

  async retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
    maxPageSize?: number
  ): Promise<IRetrieveMultipleResult> {
    const result = await this.api.retrieveMultipleRecords(entityLogicalName, options, maxPageSize);
    return { entities: result.entities, nextLink: result.nextLink };
  }

  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    // Ride cds-client, like fetchPage, so the FetchXML annotations survive. The
    // native ComponentFramework Web API drops them, which would differ from the
    // other hosts and break paging labels driven by the result annotations.
    return this.client.fetch(LibraryUtils.entitySetName(entityLogicalName), fetchXml);
  }

  fetchPage(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    // Rides cds-client so the FetchXML paging annotations survive.
    return this.client.fetch(LibraryUtils.entitySetName(entityLogicalName), fetchXml);
  }

  retrieveMultipleByUrl(url: string, maxPageSize?: number): Promise<IRetrieveMultipleResult> {
    return this.client.retrieveMultipleByUrl(url, maxPageSize);
  }

  executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityLogicalName: string; id: string }
  ): Promise<unknown> {
    return this.client.executeAction(
      actionName,
      parameters,
      boundTo ? { entitySet: LibraryUtils.entitySetName(boundTo.entityLogicalName), id: boundTo.id } : undefined
    );
  }

  executeClassicWorkflow(workflowId: string, recordId: string): Promise<unknown> {
    return this.client.executeClassicWorkflow(workflowId, recordId);
  }

  execute(request: IWebApiRequest): Promise<IExecuteResponse> {
    // The PCF webAPI surface has no execute; ride cds-client (actions/functions).
    return this.client.execute(request);
  }

  executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]> {
    return this.client.executeMultiple(requests);
  }

  executeChangeSet(requests: IChangeSetRequest[]): Promise<IChangeSetResponse[]> {
    return this.client.executeChangeSet(requests);
  }
}

class PcfNavigation implements INavigation {
  constructor(
    private readonly navigation: IPcfContextLike["navigation"],
    private readonly utils: IXrmUtilityLookup | undefined
  ) {}

  async openForm(entityLogicalName: string, id?: string): Promise<void>;
  async openForm(options: IEntityFormOptions, formParameters?: IFormParameters): Promise<void>;
  async openForm(
    entityOrOptions: string | IEntityFormOptions,
    idOrParams?: string | IFormParameters
  ): Promise<void> {
    const { options, formParameters } = resolveOpenFormArgs(entityOrOptions, idOrParams);
    await this.navigation.openForm(options, formParameters);
  }

  async openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    options?: IClientUILaunchOptions
  ): Promise<void> {
    // The PCF navigation surface opens a webresource window; every mode
    // (including the modern narrow-reflow "fullpage"/"auto") resolves to that
    // one window, title does not apply, width/height size it. The narrow-dialog
    // failure "fullpage" works around is a modern-UCI reflow, so the payload is
    // not marked fullPage here.
    this.navigation.openWebResource(
      webResourceName,
      options ? { width: options.width, height: options.height, openInNewWindow: false } : undefined,
      encodeURIComponent(LibraryUtils.buildClientUIDataParam(app, payload))
    );
  }

  async openAlertDialog(text: string, title?: string): Promise<void>;
  async openAlertDialog(strings: IAlertStrings, options?: IDialogSizeOptions): Promise<void>;
  async openAlertDialog(
    textOrStrings: string | IAlertStrings,
    titleOrOptions?: string | IDialogSizeOptions
  ): Promise<void> {
    const { strings, options } = resolveAlertArgs(textOrStrings, titleOrOptions);
    await this.navigation.openAlertDialog(strings, options);
  }

  async openConfirmDialog(text: string, title?: string): Promise<boolean>;
  async openConfirmDialog(strings: IConfirmStrings, options?: IDialogSizeOptions): Promise<boolean>;
  async openConfirmDialog(
    textOrStrings: string | IConfirmStrings,
    titleOrOptions?: string | IDialogSizeOptions
  ): Promise<boolean> {
    const { strings, options } = resolveConfirmArgs(textOrStrings, titleOrOptions);
    const result = await this.navigation.openConfirmDialog(strings, options);
    return !!result.confirmed;
  }

  openUrl(url: string, options?: IDialogSizeOptions): void {
    this.navigation.openUrl(url, options);
  }

  lookupObjects(options: ILookupOptions): Promise<IEntityReference[]> {
    return callLookupObjects(this.utils, options, "PCF");
  }

  async openErrorDialog(options: IErrorDialogOptions): Promise<void> {
    await this.navigation.openErrorDialog(options);
  }

  async openFile(file: IFileDetails, options?: IOpenFileOptions): Promise<void> {
    await this.navigation.openFile(file, options);
  }

  async navigateTo(pageInput: INavigateToPageInput, options?: INavigationOptions): Promise<void> {
    await this.navigation.navigateTo(pageInput, options);
  }

  openWebResource(webResourceName: string, windowOptions?: IWindowOptions, data?: string): void {
    this.navigation.openWebResource(
      webResourceName,
      windowOptions ? { width: windowOptions.width, height: windowOptions.height } : undefined,
      data
    );
  }
}
