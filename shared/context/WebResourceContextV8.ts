import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";
import type {
  IContextUtils,
  IErrorDialogOptions,
  IFileDetails,
  IFormAccess,
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
import { callLookupObjects, type IXrmUtilityLookup } from "./hostSurface";
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
import { XrmPageFormAccess, type IXrmPageLike } from "./hostSurface";

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
  readonly client: IClientContext;
  readonly device: IDeviceContext;
  readonly formAccess?: IFormAccess;

  private readonly cdsClient: CdsClient;
  private formattingPromise?: Promise<IFormattingInfo>;

  constructor(xrm: IXrmV8Like, formPage?: IXrmPageLike) {
    const pageContext = xrm.Page.context;
    this.clientUrl = pageContext.getClientUrl();
    this.user = {
      id: normalizeGuid(pageContext.getUserId()),
      name: pageContext.getUserName(),
      languageId: pageContext.getUserLcid?.(),
    };
    this.orgVersion = pageContext.getVersion?.() ?? "8.2";

    const client = new CdsClient({ clientUrl: this.clientUrl, apiVersion: "8.2" });
    this.cdsClient = client;
    this.webAPI = new CdsWebApi(client);
    this.metadata = new MetadataService(client);
    this.navigation = new V8Navigation(xrm.Utility);
    // Platform-mirror surface; V8 fidelity is a per-method dial: utility extras degrade
    // (undefined/no-op/reject) and device capture throws "not supported".
    this.utils = utilsFromXrm(
      (message: string) => void this.navigation.openAlertDialog(message),
      xrm.Utility as unknown as IXrmUtilityExtras,
      "CRM 8.x webresource"
    );
    this.client = clientFromSource(
      (pageContext as unknown as { client?: Parameters<typeof clientFromSource>[0] }).client
    );
    this.device = deviceFromSource(undefined, "CRM 8.x webresource");

    // Form access binds to the deepest ancestor form when the factory found
    // one; otherwise this host's own Page.
    const page = formPage ?? xrm.Page;
    if (XrmPageFormAccess.hasForm(page)) {
      this.formAccess = new XrmPageFormAccess(page);
    }
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

  createRecord(entityLogicalName: string, data: Record<string, unknown>): Promise<{ id: string }> {
    return this.client.createRecord(LibraryUtils.entitySetName(entityLogicalName), data);
  }

  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<void> {
    return this.client.updateRecord(LibraryUtils.entitySetName(entityLogicalName), id, data);
  }

  deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    return this.client.deleteRecord(LibraryUtils.entitySetName(entityLogicalName), id);
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
    options?: string
  ): Promise<IRetrieveMultipleResult> {
    const entitySet = LibraryUtils.entitySetName(entityLogicalName);
    // Honor the Xrm.WebApi-style "?fetchXml=" channel so call sites stay portable.
    if (options?.startsWith("?fetchXml=")) {
      const fetchXml = decodeURIComponent(options.slice("?fetchXml=".length));
      return this.client.fetch(entitySet, fetchXml);
    }
    return this.client.retrieveMultiple(entitySet, options);
  }

  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    return this.client.fetch(LibraryUtils.entitySetName(entityLogicalName), fetchXml);
  }

  fetchPage(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    // Already cds-backed; the parsed annotations carry the paging info.
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

class V8Navigation implements INavigation {
  constructor(private readonly utility: IXrmV8Like["Utility"]) {}

  async openForm(entityLogicalName: string, id?: string): Promise<void> {
    this.utility.openEntityForm(entityLogicalName, id ? normalizeGuid(id) : undefined);
  }

  async openClientUI(
    webResourceName: string,
    app: string,
    payload?: Record<string, unknown>,
    size?: { width?: number; height?: number }
  ): Promise<void> {
    this.utility.openWebResource(
      webResourceName,
      encodeURIComponent(LibraryUtils.buildClientUIDataParam(app, payload)),
      size?.width,
      size?.height
    );
  }

  openAlertDialog(text: string, _title?: string): Promise<void> {
    return new Promise((resolve) => this.utility.alertDialog(text, resolve));
  }

  openConfirmDialog(text: string, _title?: string): Promise<boolean> {
    return new Promise((resolve) =>
      this.utility.confirmDialog(
        text,
        () => resolve(true),
        () => resolve(false)
      )
    );
  }

  openUrl(url: string): void {
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
