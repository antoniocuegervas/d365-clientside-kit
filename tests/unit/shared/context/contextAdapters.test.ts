import {
  createContextFromXrm,
  createWebResourceContext,
  findXrm,
} from "../../../../shared/context/createWebResourceContext";
import { WebResourceContext } from "../../../../shared/context/WebResourceContext";
import { WebResourceContextV8 } from "../../../../shared/context/WebResourceContextV8";
import { PCFContext, type IPcfContextLike } from "../../../../shared/context/PCFContext";
import { FakeXhrServer } from "../../../mocks/FakeXhr";
import { createModernXrmMock, createV8XrmMock } from "../../../mocks/XrmMock";

describe("createWebResourceContext factory", () => {
  it("selects the modern adapter when Xrm.WebApi exists", () => {
    const { xrm } = createModernXrmMock();
    expect(createContextFromXrm(xrm)).toBeInstanceOf(WebResourceContext);
  });

  it("selects the V8 adapter when Xrm.WebApi is missing", () => {
    const { xrm } = createV8XrmMock();
    const context = createContextFromXrm(xrm);
    expect(context).toBeInstanceOf(WebResourceContextV8);
    expect(context.isLegacy).toBe(true);
  });

  it("finds Xrm on the parent window (form-hosted webresource)", () => {
    const { xrm } = createModernXrmMock();
    const fakeWindow = { Xrm: undefined, parent: { Xrm: xrm } } as unknown as Window;
    expect(findXrm(fakeWindow)).toBe(xrm);
    expect(createWebResourceContext(fakeWindow)).toBeInstanceOf(WebResourceContext);
  });

  it("throws a readable error when no Xrm is reachable", () => {
    const fakeWindow = { Xrm: undefined, parent: null } as unknown as Window;
    expect(() => createWebResourceContext(fakeWindow)).toThrow(/Xrm is not available/);
  });

  it("walks past multiple ancestor frames to find Xrm (G-09 deep nesting)", () => {
    const { xrm } = createModernXrmMock();
    // self -> dialog frame -> form frame (carries Xrm) -> top
    const top = { Xrm: xrm } as unknown as Window;
    (top as unknown as { parent: Window }).parent = top; // top is its own parent
    const dialogFrame = { Xrm: undefined, parent: top } as unknown as Window;
    const self = { Xrm: undefined, parent: dialogFrame } as unknown as Window;
    expect(findXrm(self)).toBe(xrm);
    expect(createWebResourceContext(self)).toBeInstanceOf(WebResourceContext);
  });

  it("prefers a modern Xrm over a legacy one found deeper in the walk", () => {
    const modern = createModernXrmMock().xrm;
    const legacy = createV8XrmMock().xrm;
    // self carries the legacy Xrm; an ancestor carries the modern one.
    const top = { Xrm: modern } as unknown as Window;
    (top as unknown as { parent: Window }).parent = top;
    const self = { Xrm: legacy, parent: top } as unknown as Window;
    expect(findXrm(self)).toBe(modern);
  });

  it("binds formAccess to the deepest ancestor form (G-09)", () => {
    // The hosting form is two frames up; the standalone Xrm in between has none.
    const formHost = createModernXrmMock({
      formRecord: {
        id: "ddd00000-0000-0000-0000-000000000009",
        entityName: "opportunity",
        attributes: { name: "Deep Deal" },
      },
    }).xrm;
    const top = { Xrm: formHost } as unknown as Window;
    (top as unknown as { parent: Window }).parent = top;
    const self = { Xrm: undefined, parent: top } as unknown as Window;
    const context = createWebResourceContext(self);
    expect(context.formAccess).toBeDefined();
    expect(context.formAccess!.getEntityName()).toBe("opportunity");
    expect(context.formAccess!.getAttributeValue("name")).toBe("Deep Deal");
  });
});

describe("WebResourceContext (modern)", () => {
  it("exposes normalized global context values", () => {
    const { xrm } = createModernXrmMock({
      clientUrl: "https://org.crm.dynamics.com",
      userId: "AAAAAAAA-0000-0000-0000-000000000001",
      userName: "Jane Dev",
      version: "9.2.30.10",
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    expect(context.clientUrl).toBe("https://org.crm.dynamics.com");
    expect(context.user).toEqual({ id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Jane Dev" });
    expect(context.orgVersion).toBe("9.2.30.10");
    expect(context.isLegacy).toBe(false);
  });

  it("delegates webAPI calls to Xrm.WebApi with normalized ids", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.webAPI.updateRecord("account", "{CCC00000-0000-0000-0000-000000000003}", {
      name: "x",
    });
    expect(calls).toContainEqual({
      api: "WebApi.updateRecord",
      args: ["account", "ccc00000-0000-0000-0000-000000000003", { name: "x" }],
    });
  });

  it("fetch() wraps FetchXML in the ?fetchXml= channel", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    const fetchXml = "<fetch><entity name='account'/></fetch>";
    await context.webAPI.fetch("account", fetchXml);
    expect(calls).toContainEqual({
      api: "WebApi.retrieveMultipleRecords",
      args: ["account", `?fetchXml=${encodeURIComponent(fetchXml)}`],
    });
  });

  it("openClientUI navigates to the webresource page type with the data payload", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openClientUI("new_clientui.html", "template", { recordId: "1" });
    const call = calls.find((c) => c.api === "Navigation.navigateTo");
    expect(call).toBeDefined();
    expect(call!.args[0]).toEqual({
      pageType: "webresource",
      webresourceName: "new_clientui.html",
      data: JSON.stringify({ app: "template", recordId: "1" }),
    });
  });

  it("openConfirmDialog resolves the boolean", async () => {
    const { xrm } = createModernXrmMock({ confirmResult: false });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await expect(context.navigation.openConfirmDialog("sure?")).resolves.toBe(false);
  });

  it("executeAction rides cds-client and bound actions target the entity set", async () => {
    const server = new FakeXhrServer();
    server.install();
    try {
      server.respondAlways({ status: 200, responseText: JSON.stringify({ Result: "ok" }) });
      const { xrm } = createModernXrmMock({ clientUrl: "https://org.crm.dynamics.com" });
      const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
      await context.webAPI.executeAction("new_Recalculate", { Amount: 5 }, {
        entityLogicalName: "opportunity",
        id: "aaa00000-0000-0000-0000-000000000001",
      });
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/opportunities(aaa00000-0000-0000-0000-000000000001)/Microsoft.Dynamics.CRM.new_Recalculate"
      );
    } finally {
      server.uninstall();
    }
  });

  it("executeWorkflow posts ExecuteWorkflow with the record EntityId", async () => {
    const server = new FakeXhrServer();
    server.install();
    try {
      server.respondAlways({ status: 200, responseText: "{}" });
      const { xrm } = createModernXrmMock({ clientUrl: "https://org.crm.dynamics.com" });
      const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
      await context.webAPI.executeWorkflow(
        "bbb00000-0000-0000-0000-000000000002",
        "ccc00000-0000-0000-0000-000000000003"
      );
      expect(server.lastRequest.url).toContain(
        "workflows(bbb00000-0000-0000-0000-000000000002)/Microsoft.Dynamics.CRM.ExecuteWorkflow"
      );
      expect(JSON.parse(server.lastRequest.body as string)).toEqual({
        EntityId: "ccc00000-0000-0000-0000-000000000003",
      });
    } finally {
      server.uninstall();
    }
  });

  it("lookupObjects calls Xrm.Utility.lookupObjects and maps results to entity references", async () => {
    const { xrm, calls } = createModernXrmMock({
      lookupResult: [
        { id: "{AAA00000-0000-0000-0000-000000000001}", name: "Contoso", entityType: "account" },
      ],
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    const result = await context.navigation.lookupObjects({
      entityTypes: ["account"],
      allowMultiSelect: false,
    });
    expect(result).toEqual([
      { id: "aaa00000-0000-0000-0000-000000000001", logicalName: "account", name: "Contoso" },
    ]);
    const call = calls.find((c) => c.api === "Utility.lookupObjects");
    expect(call).toBeDefined();
    expect((call!.args[0] as { entityTypes?: string[] }).entityTypes).toEqual(["account"]);
  });

  it("exposes formAccess when hosted on a record form", () => {
    const { xrm } = createModernXrmMock({
      formRecord: {
        id: "ddd00000-0000-0000-0000-000000000004",
        entityName: "account",
        attributes: { name: "Contoso" },
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    expect(context.formAccess).toBeDefined();
    expect(context.formAccess!.getRecordId()).toBe("ddd00000-0000-0000-0000-000000000004");
    expect(context.formAccess!.getEntityName()).toBe("account");
    expect(context.formAccess!.getAttributeValue("name")).toBe("Contoso");
  });

  it("omits formAccess for standalone webresources", () => {
    const { xrm } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    expect(context.formAccess).toBeUndefined();
  });
});

describe("WebResourceContextV8 shim matrix", () => {
  let server: FakeXhrServer;

  beforeEach(() => {
    server = new FakeXhrServer();
    server.install();
  });

  afterEach(() => server.uninstall());

  const makeContext = (confirmResult?: boolean) => {
    const mock = createV8XrmMock({
      clientUrl: "https://crm.onprem.contoso.com/org",
      userId: "BBBBBBBB-0000-0000-0000-000000000002",
      userName: "Legacy User",
      confirmResult,
    });
    return { context: new WebResourceContextV8(mock.xrm), calls: mock.calls };
  };

  it("reads global values from Xrm.Page.context and defaults the version", () => {
    const { context } = makeContext();
    expect(context.clientUrl).toBe("https://crm.onprem.contoso.com/org");
    expect(context.user).toEqual({
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      name: "Legacy User",
    });
    expect(context.orgVersion).toBe("8.2");
    expect(context.isLegacy).toBe(true);
  });

  it("maps openForm to the deprecated openEntityForm", async () => {
    const { context, calls } = makeContext();
    await context.navigation.openForm("account", "{EEE00000-0000-0000-0000-000000000005}");
    expect(calls).toContainEqual({
      api: "Utility.openEntityForm",
      args: ["account", "eee00000-0000-0000-0000-000000000005"],
    });
  });

  it("maps alert/confirm to the v8 callback dialogs", async () => {
    const { context, calls } = makeContext(false);
    await context.navigation.openAlertDialog("heads up");
    await expect(context.navigation.openConfirmDialog("sure?")).resolves.toBe(false);
    expect(calls.map((c) => c.api)).toEqual(
      expect.arrayContaining(["Utility.alertDialog", "Utility.confirmDialog"])
    );
  });

  it("maps openClientUI to openWebResource with the encoded data param", async () => {
    const { context, calls } = makeContext();
    await context.navigation.openClientUI("new_clientui.html", "samples", undefined, {
      width: 900,
      height: 700,
    });
    expect(calls).toContainEqual({
      api: "Utility.openWebResource",
      args: [
        "new_clientui.html",
        encodeURIComponent(JSON.stringify({ app: "samples" })),
        900,
        700,
      ],
    });
  });

  it("routes webAPI calls through cds-client against /api/data/v8.2/", async () => {
    server.respondAlways({ status: 200, responseText: '{"value":[]}' });
    const { context } = makeContext();
    await context.webAPI.retrieveMultipleRecords("opportunity", "?$select=name");
    expect(server.lastRequest.url).toBe(
      "https://crm.onprem.contoso.com/org/api/data/v8.2/opportunities?$select=name"
    );
  });

  it("honors the ?fetchXml= channel by delegating to cds fetch (with batch fallback available)", async () => {
    server.respondAlways({ status: 200, responseText: '{"value":[]}' });
    const { context } = makeContext();
    const fetchXml = "<fetch><entity name='account'/></fetch>";
    await context.webAPI.retrieveMultipleRecords(
      "account",
      `?fetchXml=${encodeURIComponent(fetchXml)}`
    );
    expect(server.lastRequest.url).toBe(
      `https://crm.onprem.contoso.com/org/api/data/v8.2/accounts?fetchXml=${encodeURIComponent(fetchXml)}`
    );
  });

  it("lookupObjects delegates to Xrm.Utility.lookupObjects on 8.x builds that expose it", async () => {
    const mock = createV8XrmMock({
      lookupResult: [
        { id: "{DDD00000-0000-0000-0000-000000000004}", name: "Legacy Co", entityType: "account" },
      ],
    });
    const context = new WebResourceContextV8(mock.xrm);
    const result = await context.navigation.lookupObjects({ entityTypes: ["account"] });
    expect(result).toEqual([
      { id: "ddd00000-0000-0000-0000-000000000004", logicalName: "account", name: "Legacy Co" },
    ]);
  });

  it("createRecord pluralizes logical names by convention", async () => {
    server.respondAlways({
      status: 204,
      headers: {
        "OData-EntityId":
          "https://crm.onprem.contoso.com/org/api/data/v8.2/opportunities(fff00000-0000-0000-0000-000000000006)",
      },
    });
    const { context } = makeContext();
    const result = await context.webAPI.createRecord("opportunity", { name: "Big Deal" });
    expect(result.id).toBe("fff00000-0000-0000-0000-000000000006");
    expect(server.lastRequest.url).toBe(
      "https://crm.onprem.contoso.com/org/api/data/v8.2/opportunities"
    );
  });
});

describe("PCFContext", () => {
  const makeSource = () => {
    const calls: Array<{ api: string; args: unknown[] }> = [];
    const source: IPcfContextLike = {
      webAPI: {
        createRecord: async (entity, data) => {
          calls.push({ api: "createRecord", args: [entity, data] });
          return { id: "{ABC00000-0000-0000-0000-000000000007}" };
        },
        updateRecord: async (...args) => {
          calls.push({ api: "updateRecord", args });
          return {};
        },
        deleteRecord: async (...args) => {
          calls.push({ api: "deleteRecord", args });
          return {};
        },
        retrieveRecord: async (...args) => {
          calls.push({ api: "retrieveRecord", args });
          return {};
        },
        retrieveMultipleRecords: async (...args) => {
          calls.push({ api: "retrieveMultipleRecords", args });
          return { entities: [{ name: "From PCF" }], nextLink: undefined };
        },
      },
      userSettings: { userId: "{ABCDABCD-0000-0000-0000-000000000008}", userName: "Pcf User" },
      navigation: {
        openForm: async (options) => {
          calls.push({ api: "openForm", args: [options] });
          return {};
        },
        openAlertDialog: async (strings) => {
          calls.push({ api: "openAlertDialog", args: [strings] });
          return {};
        },
        openConfirmDialog: async (strings) => {
          calls.push({ api: "openConfirmDialog", args: [strings] });
          return { confirmed: true };
        },
        openUrl: (url) => calls.push({ api: "openUrl", args: [url] }),
        openWebResource: (...args) => calls.push({ api: "openWebResource", args }),
      },
      page: { getClientUrl: () => "https://org.crm.dynamics.com" },
    };
    return { source, calls };
  };

  it("resolves clientUrl and normalizes the user", () => {
    const { source } = makeSource();
    const context = new PCFContext(source);
    expect(context.clientUrl).toBe("https://org.crm.dynamics.com");
    expect(context.user).toEqual({
      id: "abcdabcd-0000-0000-0000-000000000008",
      name: "Pcf User",
    });
  });

  it("falls back to same-origin relative URLs without a clientUrl", () => {
    const { source } = makeSource();
    delete source.page;
    const context = new PCFContext(source);
    expect(context.clientUrl).toBe("");
  });

  it("delegates webAPI and normalizes created ids", async () => {
    const { source, calls } = makeSource();
    const context = new PCFContext(source);
    const created = await context.webAPI.createRecord("contact", { lastname: "Doe" });
    expect(created.id).toBe("abc00000-0000-0000-0000-000000000007");
    expect(calls).toContainEqual({ api: "createRecord", args: ["contact", { lastname: "Doe" }] });

    const result = await context.webAPI.fetch("contact", "<fetch/>");
    expect(result.entities).toEqual([{ name: "From PCF" }]);
    expect(calls).toContainEqual({
      api: "retrieveMultipleRecords",
      args: ["contact", `?fetchXml=${encodeURIComponent("<fetch/>")}`],
    });
  });

  it("lookupObjects throws a clear error when the PCF host can't summon it", async () => {
    const { source } = makeSource(); // no `utils` lookup surface
    const context = new PCFContext(source);
    await expect(context.navigation.lookupObjects({ entityTypes: ["account"] })).rejects.toThrow(
      /lookup dialog .* is not available in the PCF host/
    );
  });

  it("openClientUI uses navigation.openWebResource with encoded data", async () => {
    const { source, calls } = makeSource();
    const context = new PCFContext(source);
    await context.navigation.openClientUI("new_clientui.html", "template");
    expect(calls).toContainEqual({
      api: "openWebResource",
      args: [
        "new_clientui.html",
        undefined,
        encodeURIComponent(JSON.stringify({ app: "template" })),
      ],
    });
  });
});
