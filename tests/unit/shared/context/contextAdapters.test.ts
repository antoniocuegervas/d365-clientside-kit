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
import { EntityReference } from "../../../../shared/utils/EntityModel";

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

  it("walks past multiple ancestor frames to find Xrm (deep nesting)", () => {
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

  it("binds formAccess to the deepest ancestor form", () => {
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
    expect(context.user).toMatchObject({
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      name: "Jane Dev",
    });
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
    // Default launch is a centered modal at 80% with no custom title.
    expect(call!.args[1]).toMatchObject({ target: 2, position: 1 });
  });

  it("openClientUI side mode opens a side-pane dialog sized and titled", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openClientUI("new_clientui.html", "sample-company-search", undefined, {
      mode: "side",
      width: 480,
      title: "Company Search",
    });
    const call = calls.find((c) => c.api === "Navigation.navigateTo");
    expect(call!.args[1]).toEqual({
      target: 2,
      position: 2,
      width: { value: 480, unit: "px" },
      height: { value: 80, unit: "%" },
      title: "Company Search",
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

  it("createRecord/updateRecord/deleteRecord return { entityType, id } (Xrm parity)", async () => {
    const { xrm } = createModernXrmMock({
      webApi: {
        createRecord: async () => ({ id: "{CCC00000-0000-0000-0000-000000000003}" }),
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await expect(context.webAPI.createRecord("account", { name: "x" })).resolves.toEqual({
      entityType: "account",
      id: "ccc00000-0000-0000-0000-000000000003",
    });
    await expect(
      context.webAPI.updateRecord("account", "{CCC00000-0000-0000-0000-000000000003}", { name: "y" })
    ).resolves.toEqual({ entityType: "account", id: "ccc00000-0000-0000-0000-000000000003" });
    await expect(
      context.webAPI.deleteRecord("account", "ccc00000-0000-0000-0000-000000000003")
    ).resolves.toEqual({ entityType: "account", id: "ccc00000-0000-0000-0000-000000000003" });
  });

  it("execute delegates to the native online.execute and returns the response", async () => {
    const { xrm, calls } = createModernXrmMock({ executeResponseBody: { Result: 9 } });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    const request = {
      Amount: 5,
      getMetadata: () => ({ operationName: "new_Recalc", operationType: 0 as const }),
    };
    const response = await context.webAPI.execute(request);
    expect(await response.json()).toEqual({ Result: 9 });
    const call = calls.find((c) => c.api === "WebApi.online.execute")!;
    expect(call.args[0]).toBe(request);
  });

  it("executeMultiple delegates to the native online.executeMultiple", async () => {
    const { xrm, calls } = createModernXrmMock({ executeResponseBody: {} });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    const responses = await context.webAPI.executeMultiple([
      { getMetadata: () => ({ operationName: "A", operationType: 0 as const }) },
      { getMetadata: () => ({ operationName: "B", operationType: 0 as const }) },
    ]);
    expect(responses).toHaveLength(2);
    expect(calls.find((c) => c.api === "WebApi.online.executeMultiple")).toBeDefined();
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

  it("exposes the client/device/utility/userSettings mirror surface", async () => {
    const { xrm, calls } = createModernXrmMock({
      formFactor: 3,
      clientKind: "Mobile",
      isOffline: true,
      isRTL: true,
      timeZoneOffsetMinutes: -300,
      resourceStrings: { Greeting: "Hello" },
      barcodeValue: "012345",
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);

    expect(context.client.getFormFactor()).toBe(3); // Phone
    expect(context.client.getClient()).toBe("Mobile");
    expect(context.client.isOffline()).toBe(true);
    expect(context.user.isRTL).toBe(true);
    expect(context.user.timeZoneOffsetMinutes).toBe(-300);

    expect(context.utils.getResourceString("new_strings", "Greeting")).toBe("Hello");
    context.utils.showProgressIndicator("Working…");
    expect(calls.find((c) => c.api === "Utility.showProgressIndicator")?.args[0]).toBe("Working…");
    await context.utils.getAllowedStatusTransitions("incident", 0);
    expect(calls.find((c) => c.api === "Utility.getAllowedStatusTransitions")?.args).toEqual([
      "incident",
      0,
    ]);

    await expect(context.device.getBarcodeValue()).resolves.toBe("012345");
  });

  it("exposes isNetworkAvailable and allows getAllowedStatusTransitions without a stateCode", async () => {
    const { xrm, calls } = createModernXrmMock({
      isNetworkAvailable: false,
      allowedStatusTransitions: [1, 2],
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    expect(context.client.isNetworkAvailable()).toBe(false);
    await expect(context.utils.getAllowedStatusTransitions("incident")).resolves.toEqual([1, 2]);
    expect(calls.find((c) => c.api === "Utility.getAllowedStatusTransitions")?.args).toEqual([
      "incident",
      undefined,
    ]);
  });

  it("forwards captureImage options including preferFrontCamera to the host", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.device.captureImage({
      allowEdit: true,
      preferFrontCamera: true,
      quality: 80,
      height: 120,
      width: 160,
    });
    const call = calls.find((c) => c.api === "Device.captureImage")!;
    expect(call.args[0]).toEqual({
      allowEdit: true,
      preferFrontCamera: true,
      quality: 80,
      height: 120,
      width: 160,
    });
  });

  it("fetchPage rides cds-client so paging annotations survive", async () => {
    const server = new FakeXhrServer();
    server.install();
    try {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [{ name: "A" }],
          "@Microsoft.Dynamics.CRM.totalrecordcount": 7,
        }),
      });
      const { xrm } = createModernXrmMock({ clientUrl: "https://org.crm.dynamics.com" });
      const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
      const result = await context.webAPI.fetchPage(
        "account",
        "<fetch page='2' count='25'><entity name='account'/></fetch>"
      );
      expect(result.totalRecordCount).toBe(7);
      // It went to the Web API collection (cds-client), not Xrm.WebApi.
      expect(server.lastRequest.url).toContain("/api/data/v9.2/accounts?fetchXml=");
    } finally {
      server.uninstall();
    }
  });

  it("delegates openErrorDialog / openFile / navigateTo / openWebResource natively", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);

    await context.navigation.openErrorDialog({ message: "boom", details: "stack" });
    expect(calls.find((c) => c.api === "Navigation.openErrorDialog")?.args[0]).toEqual({
      message: "boom",
      details: "stack",
    });

    await context.navigation.openFile(
      { fileContent: "AAA", fileName: "r.txt", fileSize: 3, mimeType: "text/plain" },
      { openMode: 2 }
    );
    const fileCall = calls.find((c) => c.api === "Navigation.openFile")!;
    expect((fileCall.args[0] as { fileName: string }).fileName).toBe("r.txt");
    expect(fileCall.args[1]).toEqual({ openMode: 2 });

    await context.navigation.navigateTo(
      { pageType: "entitylist", entityName: "account" },
      { target: 2 }
    );
    const navCall = calls.find((c) => c.api === "Navigation.navigateTo")!;
    expect(navCall.args[0]).toEqual({ pageType: "entitylist", entityName: "account" });

    context.navigation.openWebResource("new_page.html", { width: 400 }, "payload");
    const wrCall = calls.find((c) => c.api === "Navigation.openWebResource")!;
    expect(wrCall.args).toEqual(["new_page.html", { width: 400 }, "payload"]);
  });

  it("openForm forwards the full entityFormOptions and formParameters to Xrm.Navigation", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openForm(
      {
        entityName: "account",
        entityId: "{AAA00000-0000-0000-0000-000000000001}",
        useQuickCreateForm: true,
        formId: "bbb00000-0000-0000-0000-000000000002",
        openInNewWindow: true,
        windowPosition: 2,
      },
      { name: "Seeded", telephone1: "555" }
    );
    const call = calls.find((c) => c.api === "Navigation.openForm")!;
    expect(call.args[0]).toEqual({
      entityName: "account",
      entityId: "aaa00000-0000-0000-0000-000000000001",
      useQuickCreateForm: true,
      formId: "bbb00000-0000-0000-0000-000000000002",
      openInNewWindow: true,
      windowPosition: 2,
    });
    expect(call.args[1]).toEqual({ name: "Seeded", telephone1: "555" });
  });

  it("openForm convenience overload still passes entity + normalized id", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openForm("account", "{CCC00000-0000-0000-0000-000000000003}");
    const call = calls.find((c) => c.api === "Navigation.openForm")!;
    expect(call.args[0]).toEqual({
      entityName: "account",
      entityId: "ccc00000-0000-0000-0000-000000000003",
    });
    expect(call.args[1]).toBeUndefined();
  });

  it("openAlertDialog forwards full strings and dialog size", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openAlertDialog(
      { text: "Saved", title: "Done", confirmButtonLabel: "Got it" },
      { height: 200, width: 400 }
    );
    const call = calls.find((c) => c.api === "Navigation.openAlertDialog")!;
    expect(call.args[0]).toEqual({ text: "Saved", title: "Done", confirmButtonLabel: "Got it" });
    expect(call.args[1]).toEqual({ height: 200, width: 400 });
  });

  it("openConfirmDialog forwards subtitle, button labels, and size", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.openConfirmDialog(
      { text: "Delete?", subtitle: "This cannot be undone", cancelButtonLabel: "Keep" },
      { height: 150, width: 350 }
    );
    const call = calls.find((c) => c.api === "Navigation.openConfirmDialog")!;
    expect(call.args[0]).toEqual({
      text: "Delete?",
      subtitle: "This cannot be undone",
      cancelButtonLabel: "Keep",
    });
    expect(call.args[1]).toEqual({ height: 150, width: 350 });
  });

  it("openUrl forwards the size options to Xrm.Navigation", () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    context.navigation.openUrl("https://example.com", { height: 600, width: 800 });
    const call = calls.find((c) => c.api === "Navigation.openUrl")!;
    expect(call.args).toEqual(["https://example.com", { height: 600, width: 800 }]);
  });

  it("openWebResource forwards openInNewWindow in the window options", () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    context.navigation.openWebResource(
      "new_page.html",
      { width: 400, height: 300, openInNewWindow: true },
      "payload"
    );
    const call = calls.find((c) => c.api === "Navigation.openWebResource")!;
    expect(call.args).toEqual([
      "new_page.html",
      { width: 400, height: 300, openInNewWindow: true },
      "payload",
    ]);
  });

  it("navigateTo forwards the rounded-out entityrecord page input", async () => {
    const { xrm, calls } = createModernXrmMock();
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    await context.navigation.navigateTo({
      pageType: "entityrecord",
      entityName: "account",
      formId: "bbb00000-0000-0000-0000-000000000002",
      createFromEntity: { entityType: "contact", id: "ccc00000-0000-0000-0000-000000000003" },
      isCrossEntityNavigate: true,
      tabName: "DETAILS",
    });
    const call = calls.find((c) => c.api === "Navigation.navigateTo")!;
    expect(call.args[0]).toEqual({
      pageType: "entityrecord",
      entityName: "account",
      formId: "bbb00000-0000-0000-0000-000000000002",
      createFromEntity: { entityType: "contact", id: "ccc00000-0000-0000-0000-000000000003" },
      isCrossEntityNavigate: true,
      tabName: "DETAILS",
    });
  });

  it("exposes the full globalContext: organization + user settings and app metadata", async () => {
    const { xrm } = createModernXrmMock({
      clientUrl: "https://org.crm.dynamics.com",
      orgUniqueName: "contoso",
      organizationId: "11100000-0000-0000-0000-000000000111",
      isAutoSaveEnabled: false,
      securityRoles: ["role-a", "role-b"],
      userRoles: [
        { id: "{20000000-0000-0000-0000-000000000002}", name: "Salesperson", entityType: "role" },
      ],
      appProperties: {
        uniqueName: "salesapp",
        url: "https://org.crm.dynamics.com/main.aspx?appid=1",
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    const gc = context.globalContext;
    expect(gc.clientUrl).toBe("https://org.crm.dynamics.com");
    expect(gc.organizationSettings).toMatchObject({
      organizationId: "11100000-0000-0000-0000-000000000111",
      uniqueName: "contoso",
      isAutoSaveEnabled: false,
    });
    // userId is normalized; roles come from the native collection.
    expect(gc.userSettings.userId).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(gc.userSettings.securityRoles).toEqual(["role-a", "role-b"]);
    expect(gc.userSettings.roles[0]).toMatchObject({ name: "Salesperson" });
    expect(gc.prependOrgName("/api")).toBe("/contoso/api");
    await expect(gc.getCurrentAppProperties()).resolves.toMatchObject({ uniqueName: "salesapp" });
    await expect(gc.getCurrentAppName()).resolves.toBe("salesapp");
    expect(gc.getCurrentAppUrl()).toContain("appid=1");
  });

  it("surfaces languageId and resolves formatting from userSettings + the usersettings entity", async () => {
    const server = new FakeXhrServer();
    server.install();
    try {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({ value: [{ decimalsymbol: ",", numberseparator: "." }] }),
      });
      const { xrm } = createModernXrmMock({
        clientUrl: "https://org.crm.dynamics.com",
        languageId: 1043,
        dateFormattingInfo: {
          MonthNames: ["januari", "februari", "maart", "", "", "", "", "", "", "", "", "", ""],
          DayNames: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
          FirstDayOfWeek: 1,
          ShortDatePattern: "d-M-yyyy",
        },
      });
      const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
      expect(context.user.languageId).toBe(1043);
      const formatting = await context.getFormatting();
      expect(formatting.decimalSymbol).toBe(",");
      expect(formatting.numberSeparator).toBe(".");
      expect(formatting.dateFormatInfo?.firstDayOfWeek).toBe(1);
      expect(formatting.dateFormatInfo?.monthNames[0]).toBe("januari");
      expect(formatting.dateFormatInfo?.shortDatePattern).toBe("d-M-yyyy");
      // Cached, a second call does not re-query.
      const requestCount = server.requests.length;
      await context.getFormatting();
      expect(server.requests.length).toBe(requestCount);
      expect(decodeURIComponent(server.lastRequest.url)).toContain(
        "$select=decimalsymbol,numberseparator"
      );
    } finally {
      server.uninstall();
    }
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
    expect(context.formContext).toBeUndefined();
  });

  it("exposes formContext and a facade that reads through it on a record form", () => {
    const { xrm } = createModernXrmMock({
      formRecord: {
        id: "ddd00000-0000-0000-0000-000000000004",
        entityName: "account",
        attributes: { name: "Contoso" },
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    expect(context.formContext).toBeDefined();
    // The full mirror resolves the entity and attributes.
    expect(context.formContext!.data.entity.getEntityName()).toBe("account");
    expect(context.formContext!.data.entity.getId()).toBe(
      "ddd00000-0000-0000-0000-000000000004"
    );
    expect(context.formContext!.getAttribute("name")?.getValue()).toBe("Contoso");
    // The facade reads through the same formContext.
    expect(context.formAccess!.getRecordId()).toBe("ddd00000-0000-0000-0000-000000000004");
    expect(context.formAccess!.getAttributeValue("name")).toBe("Contoso");
  });

  it("setAttributeValue converts an EntityReference to the Xrm lookup array", () => {
    const { xrm, calls } = createModernXrmMock({
      formRecord: {
        id: "ddd00000-0000-0000-0000-000000000004",
        entityName: "account",
        attributes: { parentaccountid: null },
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    context.formAccess!.setAttributeValue(
      "parentaccountid",
      new EntityReference("account", "aaa00000-0000-0000-0000-000000000001", "Contoso")
    );
    const setCall = calls.find((c) => c.api === "attribute.setValue:parentaccountid")!;
    expect(setCall.args[0]).toEqual([
      { id: "{aaa00000-0000-0000-0000-000000000001}", entityType: "account", name: "Contoso" },
    ]);
  });

  it("setAttributeValue passes plain values through unchanged", () => {
    const { xrm, calls } = createModernXrmMock({
      formRecord: {
        id: "ddd00000-0000-0000-0000-000000000004",
        entityName: "account",
        attributes: { name: null },
      },
    });
    const context = new WebResourceContext(xrm as unknown as Xrm.XrmStatic);
    context.formAccess!.setAttributeValue("name", "Fabrikam");
    expect(calls.find((c) => c.api === "attribute.setValue:name")?.args[0]).toBe("Fabrikam");
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

  it("maps the full openForm options to the openEntityForm subset (entity + id)", async () => {
    const { context, calls } = makeContext();
    await context.navigation.openForm(
      {
        entityName: "account",
        entityId: "{EEE00000-0000-0000-0000-000000000005}",
        useQuickCreateForm: true,
        formId: "bbb00000-0000-0000-0000-000000000002",
      },
      { name: "ignored on 8.x" }
    );
    expect(calls).toContainEqual({
      api: "Utility.openEntityForm",
      args: ["account", "eee00000-0000-0000-0000-000000000005"],
    });
  });

  it("keeps the full alert strings text-only on the v8 callback dialog", async () => {
    const { context, calls } = makeContext();
    await context.navigation.openAlertDialog(
      { text: "heads up", title: "Notice", confirmButtonLabel: "OK" },
      { height: 100, width: 200 }
    );
    expect(calls.find((c) => c.api === "Utility.alertDialog")?.args[0]).toBe("heads up");
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

  it("surface degrades on 8.x: device throws, status transitions reject, client defaults", async () => {
    const { context } = makeContext();
    expect(context.client.getFormFactor()).toBe(0); // Unknown (no 8.x client slice)
    expect(context.client.getClient()).toBe("Web");
    expect(context.client.isNetworkAvailable()).toBe(true); // defaults when the host omits it
    await expect(context.device.getBarcodeValue()).rejects.toThrow(/not available in the CRM 8.x/);
    await expect(context.utils.getAllowedStatusTransitions("incident", 0)).rejects.toThrow(
      /not available in the CRM 8.x/
    );
    // Void utility extras no-op rather than throw.
    expect(() => context.utils.showProgressIndicator("x")).not.toThrow();
    expect(context.utils.getResourceString("w", "k")).toBeUndefined();
  });

  it("openErrorDialog routes message+details to the v8 alert", async () => {
    const { context, calls } = makeContext();
    await context.navigation.openErrorDialog({ message: "Save failed", details: "stack trace" });
    const alert = calls.find((c) => c.api === "Utility.alertDialog")!;
    expect(alert.args[0]).toBe("Save failed\n\nstack trace");
  });

  it("openFile throws a clear not-supported error on 8.x", async () => {
    const { context } = makeContext();
    await expect(
      context.navigation.openFile({ fileContent: "AAA", fileName: "r.txt", fileSize: 3, mimeType: "text/plain" })
    ).rejects.toThrow(/not supported on the CRM 8.x host/);
  });

  it("navigateTo maps webresource/entityrecord and throws for the rest", async () => {
    const { context, calls } = makeContext();
    await context.navigation.navigateTo({ pageType: "webresource", webresourceName: "new_p.html", data: "x" });
    expect(calls).toContainEqual({ api: "Utility.openWebResource", args: ["new_p.html", "x", undefined, undefined] });
    await context.navigation.navigateTo({
      pageType: "entityrecord",
      entityName: "account",
      entityId: "{AAA00000-0000-0000-0000-000000000001}",
    });
    expect(calls.find((c) => c.api === "Utility.openEntityForm")?.args[0]).toBe("account");
    await expect(
      context.navigation.navigateTo({ pageType: "dashboard" })
    ).rejects.toThrow(/pageType 'dashboard' is not supported/);
  });

  it("builds the globalContext subset from Page.context and rejects app properties", async () => {
    const mock = createV8XrmMock({
      clientUrl: "https://crm.onprem.contoso.com/org",
      orgUniqueName: "onpremorg",
      orgLcid: 1033,
    });
    const context = new WebResourceContextV8(mock.xrm);
    const gc = context.globalContext;
    expect(gc.clientUrl).toBe("https://crm.onprem.contoso.com/org");
    expect(gc.organizationSettings.uniqueName).toBe("onpremorg");
    expect(gc.organizationSettings.languageId).toBe(1033);
    expect(gc.userSettings.userId).toBe("bbbbbbbb-0000-0000-0000-000000000002");
    await expect(gc.getCurrentAppProperties()).rejects.toThrow(/not available in the CRM 8.x/);
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
    expect(result).toEqual({
      entityType: "opportunity",
      id: "fff00000-0000-0000-0000-000000000006",
    });
    expect(server.lastRequest.url).toBe(
      "https://crm.onprem.contoso.com/org/api/data/v8.2/opportunities"
    );
  });

  it("execute rides cds-client for an unbound action against /api/data/v8.2/", async () => {
    server.respondAlways({ status: 200, responseText: '{"ok":1}' });
    const { context } = makeContext();
    const response = await context.webAPI.execute({
      X: 1,
      getMetadata: () => ({ operationName: "new_Do", operationType: 0 }),
    });
    expect(await response.json()).toEqual({ ok: 1 });
    expect(server.lastRequest.url).toBe("https://crm.onprem.contoso.com/org/api/data/v8.2/new_Do");
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
        openForm: async (options, formParameters) => {
          calls.push({ api: "openForm", args: [options, formParameters] });
          return {};
        },
        openAlertDialog: async (strings, alertOptions) => {
          calls.push({ api: "openAlertDialog", args: [strings, alertOptions] });
          return {};
        },
        openConfirmDialog: async (strings, confirmOptions) => {
          calls.push({ api: "openConfirmDialog", args: [strings, confirmOptions] });
          return { confirmed: true };
        },
        openUrl: (url, openUrlOptions) => calls.push({ api: "openUrl", args: [url, openUrlOptions] }),
        openWebResource: (...args) => calls.push({ api: "openWebResource", args }),
        openErrorDialog: async (errorOptions) => {
          calls.push({ api: "openErrorDialog", args: [errorOptions] });
          return {};
        },
        openFile: async (file, fileOptions) => {
          calls.push({ api: "openFile", args: [file, fileOptions] });
          return {};
        },
        navigateTo: async (pageInput, navOptions) => {
          calls.push({ api: "navigateTo", args: [pageInput, navOptions] });
          return {};
        },
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

  it("builds the globalContext from PCF userSettings and rejects app properties", async () => {
    const { source } = makeSource();
    const context = new PCFContext(source);
    expect(context.globalContext.clientUrl).toBe("https://org.crm.dynamics.com");
    expect(context.globalContext.userSettings.userId).toBe(
      "abcdabcd-0000-0000-0000-000000000008"
    );
    expect(context.globalContext.userSettings.roles).toEqual([]);
    await expect(context.globalContext.getCurrentAppProperties()).rejects.toThrow(
      /not available in the PCF host/
    );
  });

  it("execute rides cds-client because the PCF webAPI has no native execute", async () => {
    const server = new FakeXhrServer();
    server.install();
    try {
      server.respondAlways({ status: 200, responseText: '{"done":true}' });
      const { source } = makeSource();
      const context = new PCFContext(source);
      const response = await context.webAPI.execute({
        getMetadata: () => ({ operationName: "new_Go", operationType: 0 }),
      });
      expect(await response.json()).toEqual({ done: true });
      expect(server.lastRequest.url).toBe(
        "https://org.crm.dynamics.com/api/data/v9.2/new_Go"
      );
    } finally {
      server.uninstall();
    }
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

  it("maps client/device/resources from the PCF context; degrades the rest", async () => {
    const { source } = makeSource();
    source.client = { getFormFactor: () => 2, getClient: () => "Web", isOffline: () => false };
    source.device = { getBarcodeValue: () => Promise.resolve("999") };
    source.resources = { getString: (id) => (id === "Title" ? "Localized" : "") };
    const context = new PCFContext(source);

    expect(context.client.getFormFactor()).toBe(2); // Tablet
    await expect(context.device.getBarcodeValue()).resolves.toBe("999");
    // captureImage isn't on this device source → clear not-supported error.
    await expect(context.device.captureImage()).rejects.toThrow(/not available in the PCF host/);
    expect(context.utils.getResourceString("ignored", "Title")).toBe("Localized");
    // No PCF equivalent for progress/status, degrade.
    expect(() => context.utils.showProgressIndicator("x")).not.toThrow();
    await expect(context.utils.getAllowedStatusTransitions("incident", 0)).rejects.toThrow(
      /not available in the PCF host/
    );
  });

  it("forwards full openForm options + formParameters and openUrl size options", async () => {
    const { source, calls } = makeSource();
    const context = new PCFContext(source);

    await context.navigation.openForm(
      { entityName: "contact", entityId: "{CCC00000-0000-0000-0000-000000000003}", useQuickCreateForm: true },
      { lastname: "Doe" }
    );
    const formCall = calls.find((c) => c.api === "openForm")!;
    expect(formCall.args[0]).toEqual({
      entityName: "contact",
      entityId: "ccc00000-0000-0000-0000-000000000003",
      useQuickCreateForm: true,
    });
    expect(formCall.args[1]).toEqual({ lastname: "Doe" });

    context.navigation.openUrl("https://example.com", { height: 500, width: 700 });
    expect(calls.find((c) => c.api === "openUrl")?.args).toEqual([
      "https://example.com",
      { height: 500, width: 700 },
    ]);
  });

  it("delegates openErrorDialog / openFile / navigateTo natively", async () => {
    const { source, calls } = makeSource();
    const context = new PCFContext(source);

    await context.navigation.openErrorDialog({ message: "boom" });
    expect(calls.find((c) => c.api === "openErrorDialog")?.args[0]).toEqual({ message: "boom" });

    await context.navigation.openFile(
      { fileContent: "AAA", fileName: "r.txt", fileSize: 3, mimeType: "text/plain" },
      { openMode: 1 }
    );
    expect(calls.find((c) => c.api === "openFile")).toBeDefined();

    await context.navigation.navigateTo({ pageType: "entityrecord", entityName: "account" });
    expect(calls.find((c) => c.api === "navigateTo")?.args[0]).toEqual({
      pageType: "entityrecord",
      entityName: "account",
    });

    context.navigation.openWebResource("new_p.html", { width: 300 }, "x");
    expect(calls.find((c) => c.api === "openWebResource" && c.args[0] === "new_p.html")?.args).toEqual([
      "new_p.html",
      { width: 300, height: undefined },
      "x",
    ]);
  });
});
