import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid, type IEntityReference } from "../utils/EntityModel";
import { entitySetName } from "../utils/odata";
import { buildClientUIDataParam } from "../utils/webResourceParams";
import { callLookupObjects, type IXrmUtilityLookup } from "./lookupObjects";
import type {
  IContextUtils,
  ILookupOptions,
  IMetadataApi,
  INavigation,
  IUserInfo,
  IViewModelContext,
  IWebApi,
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
  userSettings: { userId: string; userName: string };
  navigation: {
    openForm(options: { entityName: string; entityId?: string }): PromiseLike<unknown>;
    openAlertDialog(strings: { text: string; title?: string }): PromiseLike<unknown>;
    openConfirmDialog(strings: { text: string; title?: string }): PromiseLike<{ confirmed: boolean }>;
    openUrl(url: string): void;
    openWebResource(name: string, options?: unknown, data?: string): void;
  };
  /** Undocumented but stable, the only client-url source inside PCF. */
  page?: { getClientUrl?(): string };
  /** Optional native lookup dialog, when the PCF host surfaces one (G-02). */
  utils?: IXrmUtilityLookup;
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

  constructor(source: IPcfContextLike, options?: { clientUrl?: string }) {
    // Same-origin relative URLs work when no client url is resolvable.
    this.clientUrl = options?.clientUrl ?? source.page?.getClientUrl?.() ?? "";
    this.user = {
      id: normalizeGuid(source.userSettings.userId),
      name: source.userSettings.userName,
    };
    this.orgVersion = "9.2"; // PCF hosts are modern; the framework hides the build number

    const client = new CdsClient({ clientUrl: this.clientUrl });
    this.webAPI = new PcfWebApi(source.webAPI, client);
    this.metadata = new MetadataService(client);
    this.navigation = new PcfNavigation(source.navigation, source.utils);
    this.utils = {
      alert: (message: string) => void this.navigation.openAlertDialog(message),
    };
  }
}

class PcfWebApi implements IWebApi {
  constructor(
    private readonly api: IPcfContextLike["webAPI"],
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
    return { entities: result.entities, nextLink: result.nextLink };
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

class PcfNavigation implements INavigation {
  constructor(
    private readonly navigation: IPcfContextLike["navigation"],
    private readonly utils: IXrmUtilityLookup | undefined
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
    this.navigation.openWebResource(
      webResourceName,
      size ? { width: size.width, height: size.height, openInNewWindow: false } : undefined,
      encodeURIComponent(buildClientUIDataParam(app, payload))
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
    return callLookupObjects(this.utils, options, "PCF");
  }
}
