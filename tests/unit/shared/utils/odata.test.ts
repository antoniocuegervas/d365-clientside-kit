import { EntityReference } from "../../../../shared/utils/EntityModel";
import {
  aliasedLookupCell,
  entitySetName,
  escapeODataString,
  formatODataValue,
  formattedValue,
  lookupCell,
  odataBind,
  splitAliasedColumn,
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

describe("lookupCell", () => {
  const record = {
    "_primarycontactid_value": "c1c00000-0000-0000-0000-000000000001",
    "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Yvonne McKay",
    "_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
  };

  it("extracts id, name, and target from the _attr_value triplet", () => {
    expect(lookupCell(record, "primarycontactid")).toEqual({
      id: "c1c00000-0000-0000-0000-000000000001",
      name: "Yvonne McKay",
      target: "contact",
    });
  });

  it("returns null when the lookup is empty", () => {
    expect(lookupCell({ _primarycontactid_value: null }, "primarycontactid")).toBeNull();
    expect(lookupCell({}, "primarycontactid")).toBeNull();
  });
});

describe("splitAliasedColumn (N-01)", () => {
  it("splits an alias.attr column on the first dot", () => {
    expect(splitAliasedColumn("pc.emailaddress1")).toEqual({
      alias: "pc",
      logicalName: "emailaddress1",
    });
  });

  it("treats a dotless name as a root-entity column (no alias)", () => {
    expect(splitAliasedColumn("name")).toEqual({ logicalName: "name" });
  });
});

describe("aliasedLookupCell (N-01)", () => {
  const record = {
    "pc.parentcustomerid": "a1a00000-0000-0000-0000-000000000001",
    "pc.parentcustomerid@OData.Community.Display.V1.FormattedValue": "Contoso Ltd",
    "pc.parentcustomerid@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
  };

  it("reads id/name/target from the alias-qualified keys", () => {
    expect(aliasedLookupCell(record, "pc.parentcustomerid")).toEqual({
      id: "a1a00000-0000-0000-0000-000000000001",
      name: "Contoso Ltd",
      target: "account",
    });
  });

  it("returns null when the aliased lookup is empty", () => {
    expect(aliasedLookupCell({ "pc.parentcustomerid": "" }, "pc.parentcustomerid")).toBeNull();
    expect(aliasedLookupCell({}, "pc.parentcustomerid")).toBeNull();
  });
});
