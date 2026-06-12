import { EntityReference, normalizeGuid } from "../../../../shared/utils/EntityModel";

describe("normalizeGuid", () => {
  it("strips braces and lowercases", () => {
    expect(normalizeGuid("{ABC12345-1111-2222-3333-444455556666}")).toBe(
      "abc12345-1111-2222-3333-444455556666"
    );
  });
});

describe("EntityReference", () => {
  it("normalizes the id on construction", () => {
    const ref = new EntityReference("account", "{AAA00000-0000-0000-0000-000000000001}", "Contoso");
    expect(ref.id).toBe("aaa00000-0000-0000-0000-000000000001");
    expect(ref.logicalName).toBe("account");
    expect(ref.name).toBe("Contoso");
  });

  it("equals compares logical name and normalized id", () => {
    const a = new EntityReference("account", "aaa00000-0000-0000-0000-000000000001");
    expect(a.equals({ logicalName: "account", id: "{AAA00000-0000-0000-0000-000000000001}" })).toBe(
      true
    );
    expect(a.equals({ logicalName: "contact", id: a.id })).toBe(false);
    expect(a.equals(null)).toBe(false);
  });

  it("reads the Web API annotation triplet", () => {
    const record = {
      _parentaccountid_value: "BBB00000-0000-0000-0000-000000000002",
      "_parentaccountid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
      "_parentaccountid_value@OData.Community.Display.V1.FormattedValue": "Fabrikam",
    };
    const ref = EntityReference.fromODataRecord(record, "parentaccountid");
    expect(ref).not.toBeNull();
    expect(ref!.id).toBe("bbb00000-0000-0000-0000-000000000002");
    expect(ref!.logicalName).toBe("account");
    expect(ref!.name).toBe("Fabrikam");
  });

  it("returns null for an empty lookup", () => {
    expect(EntityReference.fromODataRecord({ _ownerid_value: null }, "ownerid")).toBeNull();
    expect(EntityReference.fromODataRecord({}, "ownerid")).toBeNull();
  });
});
