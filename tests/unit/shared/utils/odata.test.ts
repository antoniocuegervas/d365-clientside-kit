import { EntityReference } from "../../../../shared/utils/EntityModel";
import {
  entitySetName,
  escapeODataString,
  formatODataValue,
  formattedValue,
  odataBind,
} from "../../../../shared/utils/odata";

describe("entitySetName", () => {
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
    expect(entitySetName(logical)).toBe(expected);
  });
});

describe("escapeODataString", () => {
  it("doubles single quotes", () => {
    expect(escapeODataString("O'Brien's")).toBe("O''Brien''s");
  });
});

describe("odataBind", () => {
  it("builds the bind path from a reference", () => {
    const ref = new EntityReference("account", "{CCC00000-0000-0000-0000-000000000003}");
    expect(odataBind(ref)).toBe("/accounts(ccc00000-0000-0000-0000-000000000003)");
  });

  it("honors an explicit entity set override", () => {
    const ref = new EntityReference("custom_thing", "ccc00000-0000-0000-0000-000000000003");
    expect(odataBind(ref, "custom_thingz")).toBe(
      "/custom_thingz(ccc00000-0000-0000-0000-000000000003)"
    );
  });
});

describe("formattedValue", () => {
  it("reads the formatted-value annotation", () => {
    const record = {
      revenue: 1000,
      "revenue@OData.Community.Display.V1.FormattedValue": "$1,000.00",
    };
    expect(formattedValue(record, "revenue")).toBe("$1,000.00");
    expect(formattedValue(record, "name")).toBeUndefined();
  });
});

describe("formatODataValue", () => {
  it("quotes/escapes strings, formats booleans, leaves numbers raw", () => {
    expect(formatODataValue("O'Brien")).toBe("'O''Brien'");
    expect(formatODataValue(true)).toBe("true");
    expect(formatODataValue(false)).toBe("false");
    expect(formatODataValue(42)).toBe("42");
  });
});
