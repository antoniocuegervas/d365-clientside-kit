import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";
import { callLookupObjects, type IXrmUtilityLookup } from "./hostSurface";
import { normalizeDateFormatInfo, resolveFormatting } from "./hostSurface";
import {
  clientFromSource,
  deviceFromSource,
  utilsFromXrm,
  type IXrmClientLike,
  type IXrmDeviceLike,
  type IXrmUtilityExtras,
} from "./hostSurface";
import type {
  IClientContext,
  IClientUILaunchOptions,
  IContextUtils,
  IDeviceContext,
  IErrorDialogOptions,
  IFileDetails,
  IFormAccess,
  IFormattingInfo,
  ILookupOptions,
  IMetadataApi,
  INavigateToPageInput,
  INavigation,
  INavigationOptions,
  IOpenFileOptions,
  IUserInfo,
  IViewModelContext,
  IWebApi,
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
  readonly client: IClientContext;
  readonly device: IDeviceContext;
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

    // One same-origin cds-client backs both metadata and execute*/executeWorkflow
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
      this.formAccess = new XrmPageFormAccess(page);
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
  ): Promise<{ id: string }> {
    const result = await this.api.createRecord(entityLogicalName, data);
    return { id: normalizeGuid(result.id) };
  }

  async updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.api.updateRecord(entityLogicalName, normalizeGuid(id), data);
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    await this.api.deleteRecord(entityLogicalName, normalizeGuid(id));
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
    options?: string
  ): Promise<IRetrieveMultipleResult> {
    const result = await this.api.retrieveMultipleRecords(entityLogicalName, options);
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

  executeWorkflow(workflowId: string, recordId: string): Promise<unknown> {
    return this.client.executeWorkflow(workflowId, recordId);
  }
}

class ModernNavigation implements INavigation {
  constructor(
    private readonly navigation: Xrm.Navigation,
    private readonly utility: IXrmUtilityLookup | undefined
  ) {}

  async openForm(entityLogicalName: string, id?: string): Promise<void> {
    await this.navigation.openForm({
      entityName: entityLogicalName,
      entityId: id ? normalizeGuid(id) : undefined,
    });
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

  async openAlertDialog(text: string, title?: string): Promise<void> {
    await this.navigation.openAlertDialog({ text, title });
  }

  async openConfirmDialog(text: string, title?: string): Promise<boolean> {
    const result = await this.navigation.openConfirmDialog({ text, title });
    return !!result.confirmed;
  }

  openUrl(url: string): void {
    this.navigation.openUrl(url);
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
