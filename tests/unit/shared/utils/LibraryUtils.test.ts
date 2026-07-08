import { EntityReference } from "../../../../shared/utils/EntityModel";
import { LibraryUtils } from "../../../../shared/utils/LibraryUtils";

describe("LibraryUtils.entitySetName", () => {
  it.each([
    ["account", "accounts"],
    ["contact", "contacts"],
    ["opportunity", "opportunities"],
    ["activitypointer", "activitypointers"],
    ["systemuser", "systemusers"],
    ["territory", "territories"],
    ["phonecall", "phonecalls"],
    ["queueitemdetach", "queueitemdetaches"], // -ch ending
    ["savedquery", "savedqueries"],
    ["businessunit", "businessunits"],
    ["postfollows", "postfollowses"], // -s ending gets -es per Dataverse convention
  ])("%s -> %s", (logical, expected) => {
    expect(LibraryUtils.entitySetName(logical)).toBe(expected);
  });
});

describe("LibraryUtils entity-set cache", () => {
  beforeEach(() => LibraryUtils.clearEntitySetNameCache());
  afterEach(() => LibraryUtils.clearEntitySetNameCache());

  it("a cached set name wins over the pluralization guess", () => {
    // The convention would guess "new_widgets"; metadata says otherwise.
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgets");
    LibraryUtils.cacheEntitySetName("new_widget", "new_widgetz");
    expect(LibraryUtils.entitySetName("new_widget")).toBe("new_widgetz");
  });

  it("matches the logical name case-insensitively", () => {
    LibraryUtils.cacheEntitySetName("New_Thing", "new_thingset");
    expect(LibraryUtils.entitySetName("new_thing")).toBe("new_thingset");
  });

  it("ignores empty mappings and clears cleanly", () => {
    LibraryUtils.cacheEntitySetName("account", "");
    expect(LibraryUtils.entitySetName("account")).toBe("accounts");
    LibraryUtils.cacheEntitySetName("account", "accountset");
    LibraryUtils.clearEntitySetNameCache();
    expect(LibraryUtils.entitySetName("account")).toBe("accounts");
  });
});

describe("LibraryUtils.escapeODataString", () => {
  it("doubles single quotes", () => {
    expect(LibraryUtils.escapeODataString("O'Brien's")).toBe("O''Brien''s");
  });
});

describe("LibraryUtils.odataBind", () => {
  it("builds the bind path from a reference", () => {
    const ref = new EntityReference("account", "{CCC00000-0000-0000-0000-000000000003}");
    expect(LibraryUtils.odataBind(ref)).toBe("/accounts(ccc00000-0000-0000-0000-000000000003)");
  });

  it("honors an explicit entity set override", () => {
    const ref = new EntityReference("custom_thing", "ccc00000-0000-0000-0000-000000000003");
    expect(LibraryUtils.odataBind(ref, "custom_thingz")).toBe(
      "/custom_thingz(ccc00000-0000-0000-0000-000000000003)"
    );
  });
});

describe("LibraryUtils.formatODataValue", () => {
  it("quotes/escapes strings, formats booleans, leaves numbers raw", () => {
    expect(LibraryUtils.formatODataValue("O'Brien")).toBe("'O''Brien'");
    expect(LibraryUtils.formatODataValue(true)).toBe("true");
    expect(LibraryUtils.formatODataValue(false)).toBe("false");
    expect(LibraryUtils.formatODataValue(42)).toBe("42");
  });
});

describe("LibraryUtils.formattedValue", () => {
  it("reads the formatted-value annotation", () => {
    const record = {
      revenue: 1000,
      "revenue@OData.Community.Display.V1.FormattedValue": "$1,000.00",
    };
    expect(LibraryUtils.formattedValue(record, "revenue")).toBe("$1,000.00");
    expect(LibraryUtils.formattedValue(record, "name")).toBeUndefined();
  });
});

describe("LibraryUtils.parseWebResourceParams", () => {
  it("reads ?app= directly", () => {
    const result = LibraryUtils.parseWebResourceParams("?app=template&theme=dark");
    expect(result.app).toBe("template");
    expect(result.query).toEqual({ app: "template", theme: "dark" });
  });

  it("reads app from a JSON data payload", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "sample-company-search", accountId: "abc" }));
    const result = LibraryUtils.parseWebResourceParams(`?data=${data}`);
    expect(result.app).toBe("sample-company-search");
    expect(result.data).toEqual({ app: "sample-company-search", accountId: "abc" });
  });

  it("?app= wins over the data payload app", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "from-data" }));
    const result = LibraryUtils.parseWebResourceParams(`?app=from-query&data=${data}`);
    expect(result.app).toBe("from-query");
  });

  it("handles double-encoded data (CRM behavior)", () => {
    const once = encodeURIComponent(JSON.stringify({ app: "double" }));
    const twice = encodeURIComponent(once);
    const result = LibraryUtils.parseWebResourceParams(`?data=${twice}`);
    expect(result.app).toBe("double");
  });

  it("passes plain-string data through", () => {
    const result = LibraryUtils.parseWebResourceParams("?data=hello%20world");
    expect(result.data).toBe("hello world");
    expect(result.app).toBeUndefined();
  });

  it("tolerates malformed JSON as a plain string", () => {
    const result = LibraryUtils.parseWebResourceParams("?data=%7Bnot-json");
    expect(result.data).toBe("{not-json");
  });

  it("handles a search string without leading question mark", () => {
    expect(LibraryUtils.parseWebResourceParams("app=x").app).toBe("x");
  });
});

describe("LibraryUtils.buildClientUIDataParam", () => {
  it("round-trips through the parser", () => {
    const data = LibraryUtils.buildClientUIDataParam("sample-merged-grid", { regionId: "123" });
    const parsed = LibraryUtils.parseWebResourceParams(`?data=${encodeURIComponent(data)}`);
    expect(parsed.app).toBe("sample-merged-grid");
    expect((parsed.data as Record<string, unknown>).regionId).toBe("123");
  });
});

describe("LibraryUtils.isNarrowViewport", () => {
  const fakeWindow = (matches: boolean | undefined): Window =>
    (matches === undefined
      ? {}
      : { matchMedia: () => ({ matches }) }) as unknown as Window;

  it("is false when matchMedia is unavailable (non-browser host: tests, SSR)", () => {
    expect(LibraryUtils.isNarrowViewport(fakeWindow(undefined))).toBe(false);
  });

  it("reflects the media query match otherwise", () => {
    expect(LibraryUtils.isNarrowViewport(fakeWindow(true))).toBe(true);
    expect(LibraryUtils.isNarrowViewport(fakeWindow(false))).toBe(false);
  });
});

describe("LibraryUtils GUID / batch boundaries", () => {
  it("newGuid produces a v4-shaped GUID", () => {
    expect(LibraryUtils.newGuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("newBatchBoundary prefixes a guid with batch_", () => {
    expect(LibraryUtils.newBatchBoundary()).toMatch(/^batch_[0-9a-f-]{36}$/i);
  });
});
