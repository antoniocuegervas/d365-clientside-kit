import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { CdsEntityMetadataProvider } from "../metadata/CdsEntityMetadataProvider";
import { KitMetadataSource } from "../metadata/KitMetadataSource";
import { createGetEntityMetadata } from "../metadata/createGetEntityMetadata";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";
import type {
  IAlertStrings,
  IChangeSetRequest,
  IChangeSetResponse,
  IClientUILaunchOptions,
  IConfirmStrings,
  IContextUtils,
  IDialogSizeOptions,
  IEntityFormOptions,
  IErrorDialogOptions,
  IExecuteResponse,
  IFileDetails,
  IFormAccess,
  IFormContext,
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
import {
  buildGlobalContext,
  callLookupObjects,
  resolveAlertArgs,
  resolveConfirmArgs,
  resolveOpenFormArgs,
  type IXrmUtilityLookup,
} from "./hostSurface";
import { resolveFormatting } from "./hostSurface";
import {
  clientFromSource,
  deviceFromSource,
  utilsFromXrm,
  type IXrmUtilityExtras,
} from "./hostSurface";
import type {
  IClientContext,
  IDeviceContext,
  IFormattingInfo,
} from "./IViewModelContext";
import { LazyFormBinding, type FormPageSource, type IXrmPageLike } from "./hostSurface";

/**
 * Structural shape of the CRM 8.x client API surface this adapter relies on.
 * @types/xrm describes modern v9, the deprecated v8 calls are typed here.
 */
export interface IXrmV8Like {
  Page: IXrmPageLike & {
    context: {
      getClientUrl(): string;
      getUserId(): string;
      getUserName(): string;
      getVersion?(): string;
      getUserLcid?(): number;
      getOrgUniqueName?(): string;
      getOrgLcid?(): number;
    };
  };
  Utility: IXrmUtilityLookup & {
    openEntityForm(name: string, id?: string): void;
    alertDialog(message: string, onCloseCallback?: () => void): void;
    confirmDialog(message: string, yesCallback?: () => void, noCallback?: () => void): void;
    openWebResource(webResourceName: string, webResourceData?: string, width?: number, height?: number): void;
  };
}

/**
 * WebResourceContextV8, same IViewModelContext contract against a CRM 8.x
 * server. Navigation maps to the deprecated v8 Xrm.Utility calls;
 * Web API and metadata ride cds-client because native Xrm.WebApi does not
 * exist before v9. "Legacy" means old SERVER APIs, browsers are modern.
 */
export class WebResourceContextV8 implements IViewModelContext {
  readonly clientUrl: string;
  readonly user: IUserInfo;
  readonly orgVersion: string;
  readonly isLegacy = true;
  readonly webAPI: IWebApi;
  readonly metadata: IMetadataApi;
  readonly navigation: INavigation;
  readonly utils: IContextUtils;
  readonly globalContext: IGlobalContext;
  readonly client: IClientContext;
  readonly device: IDeviceContext;
  private readonly cdsClient: CdsClient;
  private readonly formBinding: LazyFormBinding;
  private formattingPromise?: Promise<IFormattingInfo>;

  constructor(xrm: IXrmV8Like, formPage?: IXrmPageLike | FormPageSource) {
    const pageContext = xrm.Page.context;
    this.clientUrl = pageContext.getClientUrl();
    this.user = {
      id: normalizeGuid(pageContext.getUserId()),
      name: pageContext.getUserName(),
      languageId: pageContext.getUserLcid?.(),
    };
    this.orgVersion = pageContext.getVersion?.() ?? "8.2";
    // 8.x exposes a subset through Page.context: client URL, version, org name
    // and lcid via the deprecated getters, and the current user. Business-app
    // properties do not exist on 8.x and reject.
    this.globalContext = buildGlobalContext(
      {
        getClientUrl: () => pageContext.getClientUrl(),
        getVersion: pageContext.getVersion ? () => pageContext.getVersion!() : undefined,
        getOrgUniqueName: pageContext.getOrgUniqueName
          ? () => pageContext.getOrgUniqueName!()
          : undefined,
        getOrgLcid: pageContext.getOrgLcid ? () => pageContext.getOrgLcid!() : undefined,
        userSettings: {
          userId: pageContext.getUserId(),
          userName: pageContext.getUserName(),
          languageId: pageContext.getUserLcid?.(),
        },
      },
      "CRM 8.x webresource"
    );

    // Derive the endpoint version from the org's real version (its first two
    // segments); a hardcoded 8.2 would 404 every call on an 8.0/8.1 org whose
    // version string sits one line above.
    const apiVersion = /^\d+\.\d+/.exec(this.orgVersion)?.[0] ?? "8.2";
    const client = new CdsClient({ clientUrl: this.clientUrl, apiVersion });
    this.cdsClient = client;
    this.webAPI = new CdsWebApi(client);
    // The kit metadata helpers ride cds-client, the only path this host has
    // (this.webAPI is itself the cds-backed emulation here).
    const metadataProvider = new CdsEntityMetadataProvider(client);
    this.metadata = new MetadataService(
      new KitMetadataSource({ dataReads: this.webAPI, client }),
      [metadataProvider]
    );
    this.navigation = new V8Navigation(xrm.Utility);
    // Platform-mirror surface; V8 fidelity is a per-method dial: utility extras degrade
    // (undefined / do nothing / reject) and device capture throws "not supported".
    this.utils = {
      ...utilsFromXrm(
        (message: string) => void this.navigation.openAlertDialog(message),
        xrm.Utility as unknown as IXrmUtilityExtras,
        "CRM 8.x webresource"
      ),
      // Pre-v9 has no native metadata store, so the OData synthesis is not a
      // fallback here, it is the whole standard-shaped surface for this host.
      getEntityMetadata: createGetEntityMetadata({ provider: metadataProvider }),
    };
    this.client = clientFromSource(
      (pageContext as unknown as { client?: Parameters<typeof clientFromSource>[0] }).client
    );
    this.device = deviceFromSource(undefined, "CRM 8.x webresource");

    // Form access binds to the deepest ancestor form when the factory found
    // one; otherwise this host's own Page. A function form is read again on
    // every access until a form appears, because the clienthooks injection
    // can land after this constructor already ran; form access then adopts
    // it late instead of staying empty for the page's whole life.
    const suppliedPage = typeof formPage === "function" ? formPage : () => formPage;
    this.formBinding = new LazyFormBinding(() => suppliedPage() ?? xrm.Page, "CRM 8.x webresource");
  }

  get formContext(): IFormContext | undefined {
    return this.formBinding.formContext;
  }

  get formAccess(): IFormAccess | undefined {
    return this.formBinding.formAccess;
  }

  getFormatting(): Promise<IFormattingInfo> {
    // 8.x doesn't reliably expose date-format names; decimal/separator come
    // from the usersettings entity. Cached.
    this.formattingPromise ??= resolveFormatting({ client: this.cdsClient, userId: this.user.id });
    return this.formattingPromise;
  }
}

/**
 * IWebApi emulated over cds-client, the v8 Web API fallback. Logical
 * names are converted to entity sets by convention (entitySetName), keeping
 * call sites identical between modern and legacy hosts.
 */
export class CdsWebApi implements IWebApi {
  constructor(private readonly client: CdsClient) {}

  async createRecord(
    entityLogicalName: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult> {
    const result = await this.client.createRecord(
      LibraryUtils.entitySetName(entityLogicalName),
      data
    );
    return { entityType: entityLogicalName, id: result.id };
  }

  async updateRecord(
    entityLogicalName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<IRecordWriteResult> {
    await this.client.updateRecord(LibraryUtils.entitySetName(entityLogicalName), id, data);
    return { entityType: entityLogicalName, id: normalizeGuid(id) };
  }

  async deleteRecord(entityLogicalName: string, id: string): Promise<IRecordWriteResult> {
    await this.client.deleteRecord(LibraryUtils.entitySetName(entityLogicalName), id);
    return { entityType: entityLogicalName, id: normalizeGuid(id) };
  }

  retrieveRecord(
    entityLogicalName: string,
    id: string,
    options?: string
  ): Promise<Record<string, unknown>> {
    return this.client.retrieveRecord(LibraryUtils.entitySetName(entityLogicalName), id, options);
  }

  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string,
    maxPageSize?: number
  ): Promise<IRetrieveMultipleResult> {
    const entitySet = LibraryUtils.entitySetName(entityLogicalName);
    // Honor the Xrm.WebApi-style "?fetchXml=" channel so call sites stay portable.
    if (options?.startsWith("?fetchXml=")) {
      const fetchXml = decodeURIComponent(options.slice("?fetchXml=".length));
      return this.client.fetch(entitySet, fetchXml);
    }
    return this.client.retrieveMultiple(entitySet, options, maxPageSize);
  }

  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    return this.client.fetch(LibraryUtils.entitySetName(entityLogicalName), fetchXml);
  }

  fetchPage(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    // Already cds-backed; the parsed annotations carry the paging info.
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
    // No native Xrm.WebApi on 8.x; ride cds-client (actions/functions).
    return this.client.execute(request);
  }

  executeMultiple(requests: IWebApiRequest[]): Promise<IExecuteResponse[]> {
    return this.client.executeMultiple(requests);
  }

  executeChangeSet(requests: IChangeSetRequest[]): Promise<IChangeSetResponse[]> {
    return this.client.executeChangeSet(requests);
  }
}

class V8Navigation implements INavigation {
  constructor(private readonly utility: IXrmV8Like["Utility"]) {}

  async openForm(entityLogicalName: string, id?: string): Promise<void>;
  async openForm(options: IEntityFormOptions, formParameters?: IFormParameters): Promise<void>;
  async openForm(
    entityOrOptions: string | IEntityFormOptions,
    idOrParams?: string | IFormParameters
  ): Promise<void> {
    // 8.x maps the entityName/entityId subset; form/quick-create/BPF options and
    // formParameters are not expressible through the deprecated openEntityForm.
    const { options } = resolveOpenFormArgs(entityOrOptions, idOrParams);
    this.utility.openEntityForm(options.entityName, options.entityId);
  }

  async openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    options?: IClientUILaunchOptions
  ): Promise<void> {
    // The legacy host has no navigateTo dialog, side pane, or full page, so it
    // opens a popup window; every mode (including the modern narrow-reflow
    // "fullpage"/"auto") resolves to that one popup, title does not apply,
    // width/height size the window. The narrow-dialog failure "fullpage" works
    // around is a modern-UCI reflow, so the payload is not marked fullPage here.
    this.utility.openWebResource(
      webResourceName,
      encodeURIComponent(LibraryUtils.buildClientUIDataParam(app, payload)),
      options?.width,
      options?.height
    );
  }

  openAlertDialog(text: string, title?: string): Promise<void>;
  openAlertDialog(strings: IAlertStrings, options?: IDialogSizeOptions): Promise<void>;
  openAlertDialog(
    textOrStrings: string | IAlertStrings,
    titleOrOptions?: string | IDialogSizeOptions
  ): Promise<void> {
    // Text-only on 8.x: the callback dialog has no title, button labels, or size.
    const { strings } = resolveAlertArgs(textOrStrings, titleOrOptions);
    return new Promise((resolve) => this.utility.alertDialog(strings.text, resolve));
  }

  openConfirmDialog(text: string, title?: string): Promise<boolean>;
  openConfirmDialog(strings: IConfirmStrings, options?: IDialogSizeOptions): Promise<boolean>;
  openConfirmDialog(
    textOrStrings: string | IConfirmStrings,
    titleOrOptions?: string | IDialogSizeOptions
  ): Promise<boolean> {
    const { strings } = resolveConfirmArgs(textOrStrings, titleOrOptions);
    return new Promise((resolve) =>
      this.utility.confirmDialog(
        strings.text,
        () => resolve(true),
        () => resolve(false)
      )
    );
  }

  openUrl(url: string, _options?: IDialogSizeOptions): void {
    // The popup window cannot be sized through window.open's portable subset here.
    window.open(url, "_blank");
  }

  lookupObjects(options: ILookupOptions): Promise<IEntityReference[]> {
    // 8.x exposes Xrm.Utility.lookupObjects on newer builds; throws clearly otherwise.
    return callLookupObjects(this.utility, options, "CRM 8.x webresource");
  }

  openErrorDialog(options: IErrorDialogOptions): Promise<void> {
    // No native error dialog on 8.x, route message+details to the v8 alert,
    // the way the legacy shim did.
    const parts = [options.message, options.details].filter((part): part is string => !!part);
    const text =
      parts.join("\n\n") ||
      (options.errorCode !== undefined ? `Error code: ${options.errorCode}` : "An error occurred.");
    return this.openAlertDialog(text);
  }

  openFile(_file: IFileDetails, _options?: IOpenFileOptions): Promise<void> {
    return Promise.reject(
      new Error("openFile is not supported on the CRM 8.x host.")
    );
  }

  async navigateTo(pageInput: INavigateToPageInput, _options?: INavigationOptions): Promise<void> {
    // 8.x has no navigateTo, map the cases the v8 Utility can express.
    if (pageInput.pageType === "webresource") {
      this.utility.openWebResource(pageInput.webresourceName, pageInput.data);
      return;
    }
    if (pageInput.pageType === "entityrecord") {
      this.utility.openEntityForm(
        pageInput.entityName,
        pageInput.entityId ? normalizeGuid(pageInput.entityId) : undefined
      );
      return;
    }
    throw new Error(
      `navigateTo pageType '${pageInput.pageType}' is not supported on the CRM 8.x host.`
    );
  }

  openWebResource(webResourceName: string, windowOptions?: IWindowOptions, data?: string): void {
    this.utility.openWebResource(webResourceName, data, windowOptions?.width, windowOptions?.height);
  }
}
