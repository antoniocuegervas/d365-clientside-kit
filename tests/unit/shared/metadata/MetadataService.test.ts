import { CdsClient } from "../../../../shared/data/CdsClient";
import {
  MetadataService,
  parseLayoutColumns,
  parseLayoutColumnsFromJson,
} from "../../../../shared/metadata/MetadataService";
import { FakeXhrServer } from "../../../mocks/FakeXhr";
import { LibraryUtils } from "../../../../shared/utils/LibraryUtils";

const API = "https://org.crm.dynamics.com/api/data/v9.2/";

function label(text: string) {
  return { UserLocalizedLabel: { Label: text } };
}

describe("MetadataService", () => {
  let server: FakeXhrServer;
  let service: MetadataService;

  beforeEach(() => {
    LibraryUtils.clearEntitySetNameCache();
    server = new FakeXhrServer();
    server.install();
    service = new MetadataService(new CdsClient({ clientUrl: "https://org.crm.dynamics.com" }));
  });

  afterEach(() => {
    server.uninstall();
    LibraryUtils.clearEntitySetNameCache();
  });

  it("normalizes entity metadata", async () => {
    server.respondWith((request) =>
      request.url.startsWith(`${API}EntityDefinitions(LogicalName='account')`)
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "account",
              DisplayName: label("Account"),
              EntitySetName: "accounts",
              PrimaryIdAttribute: "accountid",
              PrimaryNameAttribute: "name",
            }),
          }
        : undefined
    );
    const metadata = await service.getEntityMetadata("account");
    expect(metadata).toEqual({
      logicalName: "account",
      displayName: "Account",
      entitySetName: "accounts",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
    });
  });

  it("evicts a rejected read so a later call retries instead of failing for the session", async () => {
    let attempts = 0;
    server.respondWith((request) => {
      if (!request.url.startsWith(`${API}EntityDefinitions(LogicalName='account')`)) {
        return undefined;
      }
      attempts += 1;
      // Fail the first read (a transient blip), succeed on the retry.
      return attempts === 1
        ? { status: 503, responseText: "temporarily unavailable" }
        : {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "account",
              DisplayName: label("Account"),
              EntitySetName: "accounts",
              PrimaryIdAttribute: "accountid",
              PrimaryNameAttribute: "name",
            }),
          };
    });

    // First read hits the blip and rejects: a smart field would show "Unavailable".
    await expect(service.getEntityMetadata("account")).rejects.toBeDefined();
    // The rejected promise must not become the permanent cache entry: the next
    // read retries against the network and succeeds.
    const metadata = await service.getEntityMetadata("account");
    expect(metadata.displayName).toBe("Account");
    expect(attempts).toBe(2);
  });

  it("escapes single quotes in a logical name into the OData path, like viewName", async () => {
    server.respondAlways({ status: 200, responseText: "{}" });
    await service.getEntityMetadata("o'brien");
    // The quote is doubled per OData string-literal rules, not interpolated raw.
    expect(server.lastRequest.url).toContain("EntityDefinitions(LogicalName='o''brien')");
  });

  it("lists creatable activity types, ordered by name, without the supertype or system types", async () => {
    server.respondWith((request) =>
      request.url.startsWith(`${API}EntityDefinitions?$filter=IsActivity eq true`)
        ? {
            status: 200,
            responseText: JSON.stringify({
              value: [
                { LogicalName: "task", DisplayName: label("Task"), ObjectTypeCode: 4212 },
                { LogicalName: "activitypointer", DisplayName: label("Activity"), ObjectTypeCode: 4200 },
                { LogicalName: "socialactivity", DisplayName: label("Social Activity"), ObjectTypeCode: 4216 },
                { LogicalName: "email", DisplayName: label("Email"), ObjectTypeCode: 4202 },
              ],
            }),
          }
        : undefined
    );
    const types = await service.getActivityTypes();
    expect(types).toEqual([
      { logicalName: "email", displayName: "Email", objectTypeCode: 4202 },
      { logicalName: "task", displayName: "Task", objectTypeCode: 4212 },
    ]);
  });

  it("teaches the pluralizer the real set name for a custom entity", async () => {
    // The convention would guess "new_widgets"; metadata carries the truth.
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgets");
    server.respondWith((request) =>
      request.url.startsWith(`${API}EntityDefinitions(LogicalName='new_widget')`)
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "new_widget",
              DisplayName: label("Widget"),
              EntitySetName: "new_widgetz",
              PrimaryIdAttribute: "new_widgetid",
              PrimaryNameAttribute: "new_name",
            }),
          }
        : undefined
    );
    await service.getEntityMetadata("new_widget");
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgetz");
  });

  it("resolves a picklist attribute with options (base + cast query)", async () => {
    server.respondWith((request) =>
      request.url.includes("/Attributes(LogicalName='industrycode')?$select=")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "industrycode",
              DisplayName: label("Industry"),
              AttributeTypeName: { Value: "PicklistType" },
              RequiredLevel: { Value: "None" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.PicklistAttributeMetadata")
        ? {
            status: 200,
            responseText: JSON.stringify({
              OptionSet: {
                Options: [
                  { Value: 1, Label: label("Accounting"), Color: "#0000ff" },
                  { Value: 2, Label: label("Consulting") },
                ],
              },
            }),
          }
        : undefined
    );

    const metadata = await service.getAttributeMetadata("account", "industrycode");
    expect(metadata.kind).toBe("optionset");
    expect(metadata.displayName).toBe("Industry");
    expect(metadata.required).toBe(false);
    expect(metadata.options).toEqual([
      { value: 1, label: "Accounting", color: "#0000ff" },
      { value: 2, label: "Consulting", color: undefined },
    ]);
  });

  it("caches attribute metadata (one load per entity.attribute)", async () => {
    server.respondAlways({
      status: 200,
      responseText: JSON.stringify({
        LogicalName: "name",
        DisplayName: label("Account Name"),
        AttributeTypeName: { Value: "StringType" },
        RequiredLevel: { Value: "ApplicationRequired" },
        MaxLength: 160,
      }),
    });
    const first = await service.getAttributeMetadata("account", "name");
    const requestCount = server.requests.length;
    const second = await service.getAttributeMetadata("account", "name");
    expect(second).toBe(first);
    expect(server.requests.length).toBe(requestCount);
    expect(first.required).toBe(true);
    expect(first.kind).toBe("text");
  });

  it("resolves lookup targets", async () => {
    server.respondWith((request) =>
      request.url.includes("$select=LogicalName,DisplayName,Description,AttributeTypeName")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "parentcustomerid",
              DisplayName: label("Company Name"),
              AttributeTypeName: { Value: "CustomerType" },
              RequiredLevel: { Value: "SystemRequired" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.LookupAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ Targets: ["account", "contact"] }) }
        : undefined
    );
    const metadata = await service.getAttributeMetadata("contact", "parentcustomerid");
    expect(metadata.kind).toBe("lookup");
    expect(metadata.required).toBe(true);
    expect(metadata.targets).toEqual(["account", "contact"]);
  });

  it("downgrades DateOnly datetimes to kind 'date'", async () => {
    server.respondWith((request) =>
      request.url.includes("$select=LogicalName,DisplayName,Description,AttributeTypeName")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "birthdate",
              DisplayName: label("Birthday"),
              AttributeTypeName: { Value: "DateTimeType" },
              RequiredLevel: { Value: "None" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.DateTimeAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ Format: "DateOnly" }) }
        : undefined
    );
    const metadata = await service.getAttributeMetadata("contact", "birthdate");
    expect(metadata.kind).toBe("date");
  });

  it("reads boolean true/false options in false-first order", async () => {
    server.respondWith((request) =>
      request.url.includes("$select=LogicalName,DisplayName,Description,AttributeTypeName")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "donotemail",
              DisplayName: label("Do Not Email"),
              AttributeTypeName: { Value: "BooleanType" },
              RequiredLevel: { Value: "None" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.BooleanAttributeMetadata")
        ? {
            status: 200,
            responseText: JSON.stringify({
              OptionSet: {
                TrueOption: { Value: 1, Label: label("Do Not Allow") },
                FalseOption: { Value: 0, Label: label("Allow") },
              },
            }),
          }
        : undefined
    );
    const metadata = await service.getAttributeMetadata("contact", "donotemail");
    expect(metadata.kind).toBe("boolean");
    expect(metadata.options).toEqual([
      { value: 0, label: "Allow", color: undefined },
      { value: 1, label: "Do Not Allow", color: undefined },
    ]);
  });

  it("loads money precision via the cast query", async () => {
    server.respondWith((request) =>
      request.url.includes("$select=LogicalName,DisplayName,Description,AttributeTypeName")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "revenue",
              DisplayName: label("Annual Revenue"),
              AttributeTypeName: { Value: "MoneyType" },
              RequiredLevel: { Value: "None" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.MoneyAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ Precision: 2 }) }
        : undefined
    );
    const metadata = await service.getAttributeMetadata("account", "revenue");
    expect(metadata.kind).toBe("money");
    expect(metadata.precision).toBe(2);
  });

  describe("getView (read-only view grid)", () => {
    const layoutXml =
      '<grid name="resultset" jump="name" select="1">' +
      '<row name="result" id="accountid">' +
      '<cell name="name" width="300" /><cell name="telephone1" width="120" />' +
      '<cell name="primarycontactid" width="150" /></row></grid>';

    it("loads a view by id and parses layout columns", async () => {
      server.respondWith((request) =>
        request.url.includes("savedqueries(11110000-0000-0000-0000-000000000001)")
          ? {
              status: 200,
              responseText: JSON.stringify({
                savedqueryid: "11110000-0000-0000-0000-000000000001",
                name: "Active Accounts",
                returnedtypecode: "account",
                fetchxml: "<fetch><entity name='account'/></fetch>",
                layoutxml: layoutXml,
              }),
            }
          : undefined
      );
      const view = await service.getView("account", "{11110000-0000-0000-0000-000000000001}");
      expect(view.name).toBe("Active Accounts");
      expect(view.columns).toEqual([
        { name: "name", width: 300 },
        { name: "telephone1", width: 120 },
        { name: "primarycontactid", width: 150 },
      ]);
    });

    it("prefers layoutjson and carries related-entity columns", async () => {
      const layoutJson = JSON.stringify({
        Rows: [
          {
            Cells: [
              { Name: "name", Width: 300 },
              { Name: "pc.emailaddress1", Width: 200, RelatedEntityName: "contact" },
              { Name: "hiddencol", Width: 50, IsHidden: true },
            ],
          },
        ],
      });
      server.respondWith((request) =>
        request.url.includes("savedqueries(11110000-0000-0000-0000-000000000001)")
          ? {
              status: 200,
              responseText: JSON.stringify({
                savedqueryid: "11110000-0000-0000-0000-000000000001",
                name: "Active Accounts",
                returnedtypecode: "account",
                fetchxml: "<fetch><entity name='account'/></fetch>",
                layoutxml: layoutXml,
                layoutjson: layoutJson,
              }),
            }
          : undefined
      );
      const view = await service.getView("account", "{11110000-0000-0000-0000-000000000001}");
      expect(view.columns).toEqual([
        { name: "name", width: 300 },
        { name: "pc.emailaddress1", width: 200, relatedEntity: "contact" },
      ]);
      expect(view.layoutJson).toBe(layoutJson);
    });

    it("falls back to the default grid view when no id is given", async () => {
      server.respondWith((request) =>
        request.url.includes("savedqueries?")
          ? {
              status: 200,
              responseText: JSON.stringify({
                value: [
                  {
                    savedqueryid: "22220000-0000-0000-0000-000000000002",
                    name: "My Active Accounts",
                    returnedtypecode: "account",
                    fetchxml: "<fetch/>",
                    layoutxml: layoutXml,
                  },
                ],
              }),
            }
          : undefined
      );
      const view = await service.getView("account");
      expect(view.id).toBe("22220000-0000-0000-0000-000000000002");
      const url = decodeURIComponent(server.lastRequest.url);
      expect(url).toContain("querytype eq 0");
      expect(url).toContain("isdefault eq true");
    });
  });

  describe("getLookupView", () => {
    it("resolves the default lookup view (querytype 64)", async () => {
      server.respondWith((request) =>
        request.url.includes("savedqueries?") &&
        decodeURIComponent(request.url).includes("querytype eq 64")
          ? {
              status: 200,
              responseText: JSON.stringify({
                value: [
                  {
                    savedqueryid: "33330000-0000-0000-0000-000000000003",
                    name: "User Lookup View",
                    returnedtypecode: "systemuser",
                    fetchxml: "<fetch/>",
                    layoutxml: "",
                  },
                ],
              }),
            }
          : undefined
      );
      const view = await service.getLookupView("systemuser");
      expect(view.id).toBe("33330000-0000-0000-0000-000000000003");
      const url = decodeURIComponent(server.lastRequest.url);
      expect(url).toContain("querytype eq 64");
      expect(url).toContain("isdefault eq true");
    });

    it("falls back to the default grid view when the entity has no lookup view", async () => {
      server.respondWith((request) => {
        const url = decodeURIComponent(request.url);
        if (url.includes("querytype eq 64")) {
          return { status: 200, responseText: JSON.stringify({ value: [] }) };
        }
        if (url.includes("querytype eq 0")) {
          return {
            status: 200,
            responseText: JSON.stringify({
              value: [
                {
                  savedqueryid: "44440000-0000-0000-0000-000000000004",
                  name: "Active Accounts",
                  returnedtypecode: "account",
                  fetchxml: "<fetch/>",
                  layoutxml: "",
                },
              ],
            }),
          };
        }
        return undefined;
      });
      const view = await service.getLookupView("account");
      expect(view.id).toBe("44440000-0000-0000-0000-000000000004");
    });
  });

  describe("getCurrencySymbol", () => {
    it("resolves the currency symbol/precision and caches per id", async () => {
      server.respondWith((request) =>
        request.url.includes("transactioncurrencies(")
          ? {
              status: 200,
              responseText: JSON.stringify({ currencysymbol: "€", currencyprecision: 2 }),
            }
          : undefined
      );
      const id = "44440000-0000-0000-0000-000000000004";
      const first = await service.getCurrencySymbol(id);
      expect(first).toEqual({ symbol: "€", precision: 2 });
      const requestCount = server.requests.length;
      const second = await service.getCurrencySymbol(`{${id.toUpperCase()}}`);
      expect(second).toBe(first); // same normalized-id cache entry
      expect(server.requests.length).toBe(requestCount);
      expect(decodeURIComponent(server.lastRequest.url)).toContain(
        "$select=currencysymbol,currencyprecision"
      );
    });
  });

  describe("getEntityIconUrl", () => {
    it("OOTB entity → platform svg by object type code", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({ LogicalName: "account", ObjectTypeCode: 1, IconVectorName: null }),
      });
      await expect(service.getEntityIconUrl("account")).resolves.toBe(
        "https://org.crm.dynamics.com/_imgs/svg_1.svg"
      );
    });

    it("custom entity → its vector webresource", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          LogicalName: "new_widget",
          ObjectTypeCode: 10050,
          IconVectorName: "new_widgeticon",
        }),
      });
      await expect(service.getEntityIconUrl("new_widget")).resolves.toBe(
        "https://org.crm.dynamics.com/WebResources/new_widgeticon"
      );
    });

    it("underscore-named entity without a vector icon falls through to the type-code svg", async () => {
      // First-party families (msdyn_ etc.) can ship without a vector icon;
      // they still have a served type-code icon, so no icon is wrong.
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          LogicalName: "msdyn_booking",
          ObjectTypeCode: 10231,
          IconVectorName: null,
        }),
      });
      await expect(service.getEntityIconUrl("msdyn_booking")).resolves.toBe(
        "https://org.crm.dynamics.com/_imgs/svg_10231.svg"
      );
    });
  });

  describe("getViewByName", () => {
    const layoutXml =
      '<grid><row id="accountid"><cell name="name" width="300" /></row></grid>';

    it("resolves a view by name with the active-state filter", async () => {
      server.respondWith((request) =>
        request.url.includes("savedqueries?")
          ? {
              status: 200,
              responseText: JSON.stringify({
                value: [
                  {
                    savedqueryid: "33330000-0000-0000-0000-000000000003",
                    name: "Hot Accounts",
                    returnedtypecode: "account",
                    fetchxml: "<fetch/>",
                    layoutxml: layoutXml,
                  },
                ],
              }),
            }
          : undefined
      );
      const view = await service.getViewByName("account", "Hot Accounts");
      expect(view.id).toBe("33330000-0000-0000-0000-000000000003");
      expect(view.columns).toEqual([{ name: "name", width: 300 }]);
      const url = decodeURIComponent(server.lastRequest.url);
      expect(url).toContain("name eq 'Hot Accounts'");
      expect(url).toContain("returnedtypecode eq 'account'");
      expect(url).toContain("statecode eq 0");
    });

    it("percent-encodes a URL-hostile view name instead of letting it split the query", async () => {
      server.respondWith((request) =>
        request.url.includes("savedqueries?")
          ? {
              status: 200,
              responseText: JSON.stringify({
                value: [
                  {
                    savedqueryid: "33330000-0000-0000-0000-000000000003",
                    name: "R&D 100% #1",
                    returnedtypecode: "account",
                    fetchxml: "<fetch/>",
                    layoutxml: layoutXml,
                  },
                ],
              }),
            }
          : undefined
      );
      const view = await service.getViewByName("account", "R&D 100% #1");
      expect(view.name).toBe("R&D 100% #1");
      const rawUrl = server.lastRequest.url;
      // The hostile characters must never appear raw in the URL: & would split
      // the $filter parameter, # would truncate it, % would garble decoding.
      const query = rawUrl.slice(rawUrl.indexOf("$filter="));
      expect(query).not.toContain("&");
      expect(query).not.toContain("#");
      expect(query).toContain(encodeURIComponent("name eq 'R&D 100% #1'"));
    });

    it("throws when no active view matches the name", async () => {
      server.respondAlways({ status: 200, responseText: JSON.stringify({ value: [] }) });
      await expect(service.getViewByName("account", "Nope")).rejects.toThrow(
        /No active view named 'Nope'/
      );
    });

    it("throws when the name is ambiguous", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [
            { savedqueryid: "1", name: "Dup", returnedtypecode: "account", layoutxml: "" },
            { savedqueryid: "2", name: "Dup", returnedtypecode: "account", layoutxml: "" },
          ],
        }),
      });
      await expect(service.getViewByName("account", "Dup")).rejects.toThrow(/Ambiguous view name/);
    });
  });
});

describe("parseLayoutColumns", () => {
  it("preserves order and defaults width", () => {
    const columns = parseLayoutColumns('<row><cell name="subject"/><cell name="prioritycode" width="90"/></row>');
    expect(columns).toEqual([
      { name: "subject", width: 100 },
      { name: "prioritycode", width: 90 },
    ]);
  });

  it("returns empty for blank layout", () => {
    expect(parseLayoutColumns("")).toEqual([]);
  });

  it("drops hidden cells and flags disablesorting", () => {
    const columns = parseLayoutColumns(
      '<row><cell name="name" width="200"/>' +
        '<cell name="secret" width="80" ishidden="1"/>' +
        '<cell name="createdon" width="120" disablesorting="1"/></row>'
    );
    expect(columns).toEqual([
      { name: "name", width: 200 },
      { name: "createdon", width: 120, disableSorting: true },
    ]);
  });
});

describe("parseLayoutColumnsFromJson", () => {
  it("reads Rows[0].Cells in order with related-entity + width", () => {
    const layoutJson = JSON.stringify({
      Rows: [
        {
          Cells: [
            { Name: "name", Width: 300 },
            { Name: "pc.emailaddress1", Width: 200, RelatedEntityName: "contact" },
            { Name: "createdon", Width: 120, DisableSorting: true },
            { Name: "secret", Width: 50, IsHidden: true },
            { Name: "0", Width: 0 },
          ],
        },
      ],
    });
    expect(parseLayoutColumnsFromJson(layoutJson)).toEqual([
      { name: "name", width: 300 },
      { name: "pc.emailaddress1", width: 200, relatedEntity: "contact" },
      { name: "createdon", width: 120, disableSorting: true },
    ]);
  });

  it("defaults width and returns [] on malformed JSON", () => {
    expect(parseLayoutColumnsFromJson('{"Rows":[{"Cells":[{"Name":"name"}]}]}')).toEqual([
      { name: "name", width: 100 },
    ]);
    expect(parseLayoutColumnsFromJson("not json")).toEqual([]);
    expect(parseLayoutColumnsFromJson("{}")).toEqual([]);
  });
});
