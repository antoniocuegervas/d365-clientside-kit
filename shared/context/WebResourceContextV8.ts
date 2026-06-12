import { CdsClient, type IRetrieveMultipleResult } from "../data/CdsClient";
import { MetadataService } from "../metadata/MetadataService";
import { normalizeGuid } from "../utils/EntityModel";
import { entitySetName } from "../utils/odata";
import { buildClientUIDataParam } from "../utils/webResourceParams";
import type {
  IContextUtils,
  IFormAccess,
  IMetadataApi,
  INavigation,
  IUserInfo,
  IViewModelContext,
  IWebApi,
} from "./IViewModelContext";
import { XrmPageFormAccess, type IXrmPageLike } from "./XrmFormAccess";

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
    };
  };
  Utility: {
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
  readonly formAccess?: IFormAccess;

  constructor(xrm: IXrmV8Like) {
    const pageContext = xrm.Page.context;
    this.clientUrl = pageContext.getClientUrl();
    this.user = {
      id: normalizeGuid(pageContext.getUserId()),
      name: pageContext.getUserName(),
    };
    this.orgVersion = pageContext.getVersion?.() ?? "8.2";

    const client = new CdsClient({ clientUrl: this.clientUrl, apiVersion: "8.2" });
    this.webAPI = new CdsWebApi(client);
    this.metadata = new MetadataService(client);
    this.navigation = new V8Navigation(xrm.Utility);
    this.utils = {
      alert: (message: string) => void this.navigation.openAlertDialog(message),
    };

    if (XrmPageFormAccess.hasForm(xrm.Page)) {
      this.formAccess = new XrmPageFormAccess(xrm.Page);
    }
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
    return this.client.createRecord(entitySetName(entityLogicalName), data);
  }

  updateRecord(entityLogicalName: string, id: string, data: Record<string, unknown>): Promise<void> {
    return this.client.updateRecord(entitySetName(entityLogicalName), id, data);
  }

  deleteRecord(entityLogicalName: string, id: string): Promise<void> {
    return this.client.deleteRecord(entitySetName(entityLogicalName), id);
  }

  retrieveRecord(
    entityLogicalName: string,
    id: string,
    options?: string
  ): Promise<Record<string, unknown>> {
    return this.client.retrieveRecord(entitySetName(entityLogicalName), id, options);
  }

  retrieveMultipleRecords(
    entityLogicalName: string,
    options?: string
  ): Promise<IRetrieveMultipleResult> {
    const entitySet = entitySetName(entityLogicalName);
    // Honor the Xrm.WebApi-style "?fetchXml=" channel so call sites stay portable.
    if (options?.startsWith("?fetchXml=")) {
      const fetchXml = decodeURIComponent(options.slice("?fetchXml=".length));
      return this.client.fetch(entitySet, fetchXml);
    }
    return this.client.retrieveMultiple(entitySet, options);
  }

  fetch(entityLogicalName: string, fetchXml: string): Promise<IRetrieveMultipleResult> {
    return this.client.fetch(entitySetName(entityLogicalName), fetchXml);
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
      encodeURIComponent(buildClientUIDataParam(app, payload)),
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
}
