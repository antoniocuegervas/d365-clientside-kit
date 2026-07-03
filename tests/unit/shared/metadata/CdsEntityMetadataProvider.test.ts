import { CdsClient } from "../../../../shared/data/CdsClient";
import { CdsEntityMetadataProvider } from "../../../../shared/metadata/CdsEntityMetadataProvider";
import {
  attributeCanBeSecuredForUpdate,
  attributeDisplayName,
  attributeIsSecured,
  attributeKind,
  attributeMaxLength,
  attributeOptions,
  attributePrecision,
  attributeRequired,
  attributeTargets,
  findAttributeMetadata,
} from "../../../../shared/metadata/attributeMetadataReads";
import { FakeXhrServer } from "../../../mocks/FakeXhr";
import { LibraryUtils } from "../../../../shared/utils/LibraryUtils";

const API = "https://org.crm.dynamics.com/api/data/v9.2/";

function label(text: string) {
  return { UserLocalizedLabel: { Label: text } };
}

/**
 * The OData synthesis of the STANDARD entity-metadata shape (pre-v9 hosts and
 * the runtime fallback). The assertions read the synthesized objects the same
 * way the smart tier does, through the attributeMetadataReads helpers, so a
 * synthesis change that would break a consumer breaks here first.
 */
describe("CdsEntityMetadataProvider", () => {
  let server: FakeXhrServer;
  let provider: CdsEntityMetadataProvider;

  beforeEach(() => {
    LibraryUtils.clearEntitySetNameCache();
    server = new FakeXhrServer();
    server.install();
    provider = new CdsEntityMetadataProvider(
      new CdsClient({ clientUrl: "https://org.crm.dynamics.com" })
    );
  });

  afterEach(() => {
    server.uninstall();
    LibraryUtils.clearEntitySetNameCache();
  });

  /** Scripts the entity base row every load starts with. */
  function respondEntityBase(entity = "account", overrides: Record<string, unknown> = {}) {
    server.respondWith((request) =>
      request.url.startsWith(`${API}EntityDefinitions(LogicalName='${entity}')?`)
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: entity,
              DisplayName: label("Account"),
              EntitySetName: "accounts",
              PrimaryIdAttribute: "accountid",
              PrimaryNameAttribute: "name",
              ObjectTypeCode: 1,
              ...overrides,
            }),
          }
        : undefined
    );
  }

  it("synthesizes the standard entity shape, labels resolved to plain strings", async () => {
    respondEntityBase();
    const metadata = await provider.getEntityMetadata("account", []);
    expect(metadata.LogicalName).toBe("account");
    expect(metadata.DisplayName).toBe("Account");
    expect(metadata.EntitySetName).toBe("accounts");
    expect(metadata.PrimaryIdAttribute).toBe("accountid");
    expect(metadata.PrimaryNameAttribute).toBe("name");
    expect(metadata.Attributes?.getAll()).toEqual([]);
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
            }),
          };
    });

    // First read hits the blip and rejects: a smart field would show "Unavailable".
    await expect(provider.getEntityMetadata("account", [])).rejects.toBeDefined();
    // The rejected promise must not become the permanent cache entry: the next
    // read retries against the network and succeeds.
    const metadata = await provider.getEntityMetadata("account", []);
    expect(metadata.DisplayName).toBe("Account");
    expect(attempts).toBe(2);
  });

  it("caches per entity + attribute set (a repeat call issues no request)", async () => {
    respondEntityBase();
    const first = await provider.getEntityMetadata("account", []);
    const requestCount = server.requests.length;
    const second = await provider.getEntityMetadata("account", []);
    expect(second).toBe(first);
    expect(server.requests.length).toBe(requestCount);
  });

  it("escapes single quotes in a logical name into the OData path, like viewName", async () => {
    server.respondAlways({ status: 200, responseText: "{}" });
    await provider.getEntityMetadata("o'brien", []);
    // The quote is doubled per OData string-literal rules, not interpolated raw.
    expect(server.requests[0].url).toContain("EntityDefinitions(LogicalName='o''brien')");
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
            }),
          }
        : undefined
    );
    await provider.getEntityMetadata("new_widget", []);
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgetz");
  });

  it("synthesizes a picklist attribute with options (base + cast query)", async () => {
    respondEntityBase();
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

    const metadata = await provider.getEntityMetadata("account", ["industrycode"]);
    const attribute = findAttributeMetadata(metadata, "industrycode");
    expect(attribute).toBeDefined();
    expect(attributeKind(attribute!)).toBe("optionset");
    expect(attributeDisplayName(attribute!)).toBe("Industry");
    expect(attributeRequired(attribute!)).toBe(false);
    expect(attributeOptions(attribute!)).toEqual([
      { value: 1, label: "Accounting", color: "#0000ff" },
      { value: 2, label: "Consulting", color: undefined },
    ]);
  });

  it("synthesizes text attributes with MaxLength and the required flag", async () => {
    respondEntityBase();
    server.respondWith((request) =>
      request.url.includes("/Attributes(LogicalName='name')?$select=")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "name",
              DisplayName: label("Account Name"),
              AttributeTypeName: { Value: "StringType" },
              RequiredLevel: { Value: "ApplicationRequired" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.StringAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ MaxLength: 160 }) }
        : undefined
    );
    const metadata = await provider.getEntityMetadata("account", ["name"]);
    const attribute = findAttributeMetadata(metadata, "name")!;
    expect(attributeKind(attribute)).toBe("text");
    expect(attributeRequired(attribute)).toBe(true);
    expect(attributeMaxLength(attribute)).toBe(160);
  });

  it("synthesizes lookup targets", async () => {
    respondEntityBase("contact");
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
    const metadata = await provider.getEntityMetadata("contact", ["parentcustomerid"]);
    const attribute = findAttributeMetadata(metadata, "parentcustomerid")!;
    expect(attributeKind(attribute)).toBe("lookup");
    expect(attributeRequired(attribute)).toBe(true);
    expect(attributeTargets(attribute)).toEqual(["account", "contact"]);
  });

  it("keeps the DateOnly format so date-only datetimes classify as 'date'", async () => {
    respondEntityBase("contact");
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
    const metadata = await provider.getEntityMetadata("contact", ["birthdate"]);
    expect(attributeKind(findAttributeMetadata(metadata, "birthdate")!)).toBe("date");
  });

  it("synthesizes boolean true/false options, read back in false-first order", async () => {
    respondEntityBase("contact");
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
    const metadata = await provider.getEntityMetadata("contact", ["donotemail"]);
    const attribute = findAttributeMetadata(metadata, "donotemail")!;
    expect(attributeKind(attribute)).toBe("boolean");
    expect(attributeOptions(attribute)).toEqual([
      { value: 0, label: "Allow", color: undefined },
      { value: 1, label: "Do Not Allow", color: undefined },
    ]);
  });

  it("synthesizes money precision via the cast query", async () => {
    respondEntityBase();
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
    const metadata = await provider.getEntityMetadata("account", ["revenue"]);
    const attribute = findAttributeMetadata(metadata, "revenue")!;
    expect(attributeKind(attribute)).toBe("money");
    expect(attributePrecision(attribute)).toBe(2);
  });

  it("synthesizes the column-security capability flags", async () => {
    respondEntityBase();
    server.respondWith((request) =>
      request.url.includes("/Attributes(LogicalName='secretcode')?$select=")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "secretcode",
              DisplayName: label("Secret Code"),
              AttributeTypeName: { Value: "StringType" },
              RequiredLevel: { Value: "None" },
              IsSecured: true,
              CanBeSecuredForCreate: true,
              CanBeSecuredForRead: true,
              CanBeSecuredForUpdate: false,
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.StringAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ MaxLength: 20 }) }
        : undefined
    );
    const metadata = await provider.getEntityMetadata("account", ["secretcode"]);
    const attribute = findAttributeMetadata(metadata, "secretcode")!;
    expect(attributeIsSecured(attribute)).toBe(true);
    expect(attributeCanBeSecuredForUpdate(attribute)).toBe(false);
    // The base $select asked the server for the capability flags.
    const baseRequest = server.requests.find((request) =>
      request.url.includes("Attributes(LogicalName='secretcode')?$select=")
    );
    expect(decodeURIComponent(baseRequest!.url)).toContain("CanBeSecuredForUpdate");
  });

  it("serves the requested attribute through the collection's get and getAll", async () => {
    respondEntityBase();
    server.respondWith((request) =>
      request.url.includes("/Attributes(LogicalName='name')?$select=")
        ? {
            status: 200,
            responseText: JSON.stringify({
              LogicalName: "name",
              DisplayName: label("Account Name"),
              AttributeTypeName: { Value: "StringType" },
              RequiredLevel: { Value: "None" },
            }),
          }
        : undefined
    );
    server.respondWith((request) =>
      request.url.includes("Microsoft.Dynamics.CRM.StringAttributeMetadata")
        ? { status: 200, responseText: JSON.stringify({ MaxLength: 100 }) }
        : undefined
    );
    const metadata = await provider.getEntityMetadata("account", ["name"]);
    expect(metadata.Attributes?.get("name")).toBeTruthy();
    expect(metadata.Attributes?.get("missing")).toBeFalsy();
    expect(metadata.Attributes?.getAll()).toHaveLength(1);
  });
});
