import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { entitySetName } from "../utils/odata";
import { buildClientUIDataParam } from "../utils/webResourceParams";
import { callLookupObjects, type IXrmUtilityLookup } from "./lookupObjects";
import type {
  IContextUtils,
  IFormAccess,
  ILookupOptions,
  IMetadataApi,
  INavigation,
  IUserInfo,
  IViewModelContext,
  IWebApi,
} from "./IViewModelContext";
import { XrmPageFormAccess, type IXrmPageLike } from "./XrmFormAccess";

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
  readonly formAccess?: IFormAccess;

  constructor(xrm: Xrm.XrmStatic, formPage?: IXrmPageLike) {
    const globalContext = xrm.Utility.getGlobalContext();
    this.clientUrl = globalContext.getClientUrl();
    this.user = {
      id: normalizeGuid(globalContext.userSettings.userId),
      name: globalContext.userSettings.userName,
    };
    this.orgVersion = globalContext.getVersion();

    // One same-origin cds-client backs both metadata and execute*/executeWorkflow
    // (D-014) so custom actions never touch Xrm.WebApi.execute's request-object API.
    const client = new CdsClient({ clientUrl: this.clientUrl });
    this.webAPI = new ModernWebApi(xrm.WebApi, client);
    this.metadata = new MetadataService(client);
    this.navigation = new ModernNavigation(
      xrm.Navigation,
      (xrm as unknown as { Utility?: IXrmUtilityLookup }).Utility
    );
    this.utils = {
      alert: (message: string) => void this.navigation.openAlertDialog(message),
    };

    // Webresources hosted on a form can reach the record through Xrm.Page
    // (deprecated but functional in UCI). `formPage` is the deepest ancestor
    // form resolved by the factory (G-09); fall back to this Xrm's own Page.
    const page = formPage ?? (xrm as unknown as { Page?: IXrmPageLike }).Page;
    if (XrmPageFormAccess.hasForm(page)) {
      this.formAccess = new XrmPageFormAccess(page);
    }
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

  executeAction(
    actionName: string,
    parameters?: Record<string, unknown>,
    boundTo?: { entityLogicalName: string; id: string }
  ): Promise<unknown> {
    return this.client.executeAction(
      actionName,
      parameters,
      boundTo ? { entitySet: entitySetName(boundTo.entityLogicalName), id: boundTo.id } : undefined
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
    size?: { width?: number; height?: number }
  ): Promise<void> {
    await this.navigation.navigateTo(
      {
        pageType: "webresource",
        webresourceName: webResourceName,
        data: buildClientUIDataParam(app, payload),
      },
      {
        target: 2, // dialog over the current page, the shell's standard launch mode
        width: { value: size?.width ?? 80, unit: size?.width ? "px" : "%" },
        height: { value: size?.height ?? 80, unit: size?.height ? "px" : "%" },
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
}
