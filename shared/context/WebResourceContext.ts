import { CdsClient, makeExecuteResponse, type IRetrieveMultipleResult } from "../data/CdsClient";
import { buildFormContext, type IHostFormContext } from "./formContextSurface";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";
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
  type IXrmGlobalContextLike,
  type IXrmUtilityExtras,
} from "./hostSurface";
import type {
  IAlertStrings,
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
  IFormAccess,
  IFormContext,
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
import { XrmPageFormAccess, type IXrmPageLike } from "./hostSurface";

/**
 * WebResourceContext, IViewModelContext over a modern (v9.2+/UCI) host.
 * Thin delegation to native Xrm.WebApi / Xrm.Navigation / getGlobalContext.
 */
export class WebResourceContext implements IViewModelContext {
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
  readonly formContext?: IFormContext;
  readonly formAccess?: IFormAccess;

  private readonly cdsClient: CdsClient;
  private readonly rawDateFormat: Record<string, unknown> | undefined;
  private formattingPromise?: Promise<IFormattingInfo>;

  constructor(xrm: Xrm.XrmStatic, formPage?: IXrmPageLike) {
    const globalContext = xrm.Utility.getGlobalContext();
    this.clientUrl = globalContext.getClientUrl();
    const userSettings = globalContext.userSettings as typeof globalContext.userSettings & {
      languageId?: number;
      dateFormattingInfo?: Record<string, unknown>;
      isRTL?: boolean;
      getTimeZoneOffsetMinutes?(): number;
    };
    this.user = {
      id: normalizeGuid(userSettings.userId),
      name: userSettings.userName,
      languageId: userSettings.languageId,
      isRTL: userSettings.isRTL,
      timeZoneOffsetMinutes: userSettings.getTimeZoneOffsetMinutes?.(),
    };
    this.rawDateFormat = userSettings.dateFormattingInfo;
    this.orgVersion = globalContext.getVersion();
    this.globalContext = buildGlobalContext(
      globalContext as unknown as IXrmGlobalContextLike,
      "modern webresource"
    );

    // One same-origin cds-client backs both metadata and execute*/executeClassicWorkflow
    // so custom actions never touch Xrm.WebApi.execute's request-object API.
    const client = new CdsClient({ clientUrl: this.clientUrl });
    this.cdsClient = client;
    this.webAPI = new ModernWebApi(xrm.WebApi, client);
    this.metadata = new MetadataService(client);
    this.navigation = new ModernNavigation(
      xrm.Navigation,
      (xrm as unknown as { Utility?: IXrmUtilityLookup }).Utility
    );
    // Seamless platform mirror: client/device/utility extras off the
    // global context. Smart tier only.
    this.utils = utilsFromXrm(
      (message: string) => void this.navigation.openAlertDialog(message),
      xrm.Utility as unknown as IXrmUtilityExtras,
      "modern webresource"
    );
    this.client = clientFromSource(
      (globalContext as unknown as { client?: IXrmClientLike }).client
    );
    this.device = deviceFromSource(
      (xrm as unknown as { Device?: IXrmDeviceLike }).Device,
      "modern webresource"
    );

    // Webresources hosted on a form can reach the record through Xrm.Page
    // (deprecated but functional in UCI). `formPage` is the deepest ancestor
    // form resolved by the factory; fall back to this Xrm's own Page.
    const page = formPage ?? (xrm as unknown as { Page?: IXrmPageLike }).Page;
    if (XrmPageFormAccess.hasForm(page)) {
      this.formContext = buildFormContext(
        page as unknown as IHostFormContext,
        "modern webresource"
      );
      this.formAccess = new XrmPageFormAccess(this.formContext, page);
    }
  }

  getFormatting(): Promise<IFormattingInfo> {
    // Date format is sync from the global context; decimal/separator come from
    // the usersettings entity via cds-client (the webresource path). Cached.
    this.formattingPromise ??= resolveFormatting({
      client: this.cdsClient,
      userId: this.user.id,
      dateFormatInfo: normalizeDateFormatInfo(this.rawDateFormat),
    });
    return this.formattingPromise;
  }
}

class ModernWebApi implements IWebApi {
  constructor(
    private readonly api: Xrm.WebApi,
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
    return {
      entities: result.entities as Array<Record<string, unknown>>,
      nextLink: (result as { nextLink?: string }).nextLink,
    };
  }

  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    return this.retrieveMultipleRecords(
      entityLogicalName,
      `?fetchXml=${encodeURIComponent(fetchXml)}`
    );
  }

  fetchPage(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    // Rides cds-client so the FetchXML paging annotations survive.
    return this.client.fetch(LibraryUtils.entitySetName(entityLogicalName), fetchXml);
  }

  retrieveMultipleByUrl(url: string): Promise<IRetrieveMultipleResult> {
    return this.client.retrieveMultipleByUrl(url);
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

  async execute(request: IWebApiRequest): Promise<IExecuteResponse> {
    // The modern host has the native execute (full action/function/CRUD). Read
    // the native Response body once and rewrap, so the returned object matches
    // the cds-client hosts exactly (same shape, re-callable json/text, ok=false
    // on an HTTP error). Native already resolves ok=false rather than throwing.
    const response = await this.api.online.execute(request);
    return makeExecuteResponse(response.status, response.statusText, await response.text());
  }

  async executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]> {
    const responses = await this.api.online.executeMultiple(requests);
    return Promise.all(
      responses.map(async (response) =>
        makeExecuteResponse(response.status, response.statusText, await response.text())
      )
    );
  }
}

class ModernNavigation implements INavigation {
  constructor(
    private readonly navigation: Xrm.Navigation,
    private readonly utility: IXrmUtilityLookup | undefined
  ) {}

  async openForm(entityLogicalName: string, id?: string): Promise<void>;
  async openForm(options: IEntityFormOptions, formParameters?: IFormParameters): Promise<void>;
  async openForm(
    entityOrOptions: string | IEntityFormOptions,
    idOrParams?: string | IFormParameters
  ): Promise<void> {
    const { options, formParameters } = resolveOpenFormArgs(entityOrOptions, idOrParams);
    await this.navigation.openForm(
      options as unknown as Parameters<Xrm.Navigation["openForm"]>[0],
      formParameters as unknown as Parameters<Xrm.Navigation["openForm"]>[1]
    );
  }

  async openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    options?: IClientUILaunchOptions
  ): Promise<void> {
    await this.navigation.navigateTo(
      {
        pageType: "webresource",
        webresourceName: webResourceName,
        data: LibraryUtils.buildClientUIDataParam(app, payload),
      },
      {
        target: 2, // dialog over the current page, the shell's standard launch mode
        position: options?.mode === "side" ? 2 : 1, // 1 center modal, 2 side pane
        width: { value: options?.width ?? 80, unit: options?.width ? "px" : "%" },
        height: { value: options?.height ?? 80, unit: options?.height ? "px" : "%" },
        title: options?.title,
      }
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
    return callLookupObjects(this.utility, options, "modern webresource");
  }

  async openErrorDialog(options: IErrorDialogOptions): Promise<void> {
    await this.navigation.openErrorDialog(options);
  }

  async openFile(file: IFileDetails, options?: IOpenFileOptions): Promise<void> {
    await this.navigation.openFile(file, options);
  }

  async navigateTo(pageInput: INavigateToPageInput, options?: INavigationOptions): Promise<void> {
    await this.navigation.navigateTo(
      pageInput as unknown as Parameters<Xrm.Navigation["navigateTo"]>[0],
      options as unknown as Parameters<Xrm.Navigation["navigateTo"]>[1]
    );
  }

  openWebResource(webResourceName: string, windowOptions?: IWindowOptions, data?: string): void {
    this.navigation.openWebResource(
      webResourceName,
      windowOptions as unknown as Parameters<Xrm.Navigation["openWebResource"]>[1],
      data
    );
  }
}
