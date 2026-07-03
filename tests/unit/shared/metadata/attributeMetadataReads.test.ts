import type { IEntityMetadata } from "../../../../shared/context/IViewModelContext";
import {
  attributeCanBeSecuredForRead,
  attributeCanBeSecuredForUpdate,
  attributeDescription,
  attributeDisplayName,
  attributeIsSecured,
  attributeKind,
  attributeMaxLength,
  attributeMaxValue,
  attributeMinValue,
  attributeOptions,
  attributePrecision,
  attributePrecisionSource,
  attributeRequired,
  attributeTargets,
  findAttributeMetadata,
} from "../../../../shared/metadata/attributeMetadataReads";
import { makeEntityMetadataMock } from "../../../mocks/XrmMock";

/**
 * The reads helpers are the ONE sanctioned reader of the metadata store's
 * under-documented members, so they are tested against every encoding the
 * store has been observed to use plus the OData variants the kit's own
 * synthesis emits. A regression in a platform wave lands here first.
 */

/** Store-shaped entity payload with one descriptor, the primary live shape. */
function entityWith(descriptor: Record<string, unknown>) {
  return makeEntityMetadataMock({
    logicalName: "account",
    attributes: [descriptor],
  }) as IEntityMetadata;
}

function attr(descriptor: Record<string, unknown>) {
  const logicalName = (descriptor.LogicalName as string) ?? "field";
  const found = findAttributeMetadata(entityWith({ LogicalName: logicalName, ...descriptor }), logicalName);
  if (!found) {
    throw new Error("test fixture failed to round-trip its attribute");
  }
  return found;
}

describe("findAttributeMetadata", () => {
  it("resolves through the collection's own get(name)", () => {
    const metadata = entityWith({ LogicalName: "name", Type: "string" });
    expect(findAttributeMetadata(metadata, "name")).toBeTruthy();
    expect(findAttributeMetadata(metadata, "missing")).toBeUndefined();
  });

  it("scans getAll() entries when get(name) is absent", () => {
    const metadata = {
      Attributes: {
        getAll: () => [
          { attributeDescriptor: { LogicalName: "other", Type: "string" } },
          { attributeDescriptor: { LogicalName: "name", Type: "string" } },
        ],
      },
    } as unknown as IEntityMetadata;
    expect(findAttributeMetadata(metadata, "name")?.attributeDescriptor?.LogicalName).toBe("name");
  });

  it("accepts a plain array of entries and descriptor-only items", () => {
    const metadata = {
      Attributes: [{ LogicalName: "name", Type: "string" }],
    } as unknown as IEntityMetadata;
    expect(findAttributeMetadata(metadata, "name")).toBeTruthy();
  });

  it("returns undefined for missing collections and payloads", () => {
    expect(findAttributeMetadata(undefined, "name")).toBeUndefined();
    expect(findAttributeMetadata({} as IEntityMetadata, "name")).toBeUndefined();
  });
});

describe("labels and description", () => {
  it("reads store-shape plain strings", () => {
    const attribute = attr({
      Type: "string",
      DisplayName: "Account Name",
      Description: "Type the company name.",
    });
    expect(attributeDisplayName(attribute)).toBe("Account Name");
    expect(attributeDescription(attribute)).toBe("Type the company name.");
  });

  it("accepts OData label objects", () => {
    const attribute = attr({
      Type: "string",
      DisplayName: { UserLocalizedLabel: { Label: "Account Name" } },
      Description: { UserLocalizedLabel: { Label: "The description." } },
    });
    expect(attributeDisplayName(attribute)).toBe("Account Name");
    expect(attributeDescription(attribute)).toBe("The description.");
  });

  it("returns undefined for unauthored or empty labels", () => {
    const attribute = attr({ Type: "string", DisplayName: "", Description: null });
    expect(attributeDisplayName(attribute)).toBeUndefined();
    expect(attributeDescription(attribute)).toBeUndefined();
  });
});

describe("required level", () => {
  it.each([
    [2, true], // ApplicationRequired
    [1, true], // SystemRequired
    [0, false], // None
    [3, false], // Recommended
  ])("reads the numeric enum (%s -> %s)", (level, expected) => {
    expect(attributeRequired(attr({ Type: "string", RequiredLevel: level }))).toBe(expected);
  });

  it("reads the OData encodings (string and { Value })", () => {
    expect(attributeRequired(attr({ Type: "string", RequiredLevel: "ApplicationRequired" }))).toBe(
      true
    );
    expect(attributeRequired(attr({ Type: "string", RequiredLevel: { Value: "None" } }))).toBe(
      false
    );
    expect(
      attributeRequired(attr({ Type: "string", RequiredLevel: { Value: "SystemRequired" } }))
    ).toBe(true);
  });

  it("defaults false when absent or unreadable", () => {
    expect(attributeRequired(attr({ Type: "string" }))).toBe(false);
  });
});

describe("column security flags", () => {
  it("reads IsSecured and the CanBeSecuredFor* capabilities", () => {
    const attribute = attr({
      Type: "string",
      IsSecured: true,
      CanBeSecuredForRead: true,
      CanBeSecuredForUpdate: false,
    });
    expect(attributeIsSecured(attribute)).toBe(true);
    expect(attributeCanBeSecuredForRead(attribute)).toBe(true);
    expect(attributeCanBeSecuredForUpdate(attribute)).toBe(false);
  });

  it("reports undefined capabilities when the host did not carry the flags", () => {
    const attribute = attr({ Type: "string", IsSecured: true });
    expect(attributeCanBeSecuredForUpdate(attribute)).toBeUndefined();
    expect(attributeIsSecured(attr({ Type: "string" }))).toBe(false);
  });
});

describe("kind resolution", () => {
  it.each([
    ["string", "text"],
    ["memo", "memo"],
    ["picklist", "optionset"],
    ["state", "optionset"],
    ["status", "optionset"],
    ["multiselectpicklist", "multioptionset"],
    ["lookup", "lookup"],
    ["customer", "lookup"],
    ["owner", "lookup"],
    ["datetime", "datetime"],
    ["integer", "integer"],
    ["bigint", "integer"],
    ["decimal", "decimal"],
    ["double", "double"],
    ["money", "money"],
    ["boolean", "boolean"],
    ["partylist", "other"],
    ["virtual", "other"],
  ])("maps the store Type string '%s' to kind '%s'", (type, kind) => {
    expect(attributeKind(attr({ Type: type }))).toBe(kind);
  });

  it("maps the OData AttributeTypeName encodings (bare and { Value }-wrapped)", () => {
    expect(attributeKind(attr({ AttributeTypeName: { Value: "PicklistType" } }))).toBe("optionset");
    expect(attributeKind(attr({ AttributeTypeName: "MoneyType" }))).toBe("money");
  });

  it("maps the numeric AttributeType code when no type string exists", () => {
    expect(attributeKind(attr({ AttributeType: 14 }))).toBe("text");
    expect(attributeKind(attr({ AttributeType: 9 }))).toBe("lookup");
    expect(attributeKind(attr({ AttributeType: 0 }))).toBe("boolean");
  });

  it("degrades an unknown type to 'other' instead of throwing", () => {
    expect(attributeKind(attr({ Type: "somethingnew" }))).toBe("other");
    expect(attributeKind({ LogicalName: "bare" })).toBe("other");
  });
});

describe("date-only detection", () => {
  it("prefers Behavior when present (2 and 'DateOnly' both mean date-only)", () => {
    expect(attributeKind(attr({ Type: "datetime", Behavior: 2 }))).toBe("date");
    expect(attributeKind(attr({ Type: "datetime", Behavior: { Value: "DateOnly" } }))).toBe("date");
  });

  it("keeps datetime for UserLocal behavior even when Format says date", () => {
    // Behavior is the platform semantics; a UserLocal value carries a time.
    expect(attributeKind(attr({ Type: "datetime", Behavior: 1, Format: "date" }))).toBe("datetime");
  });

  it("falls back to Format, matching exactly ('datetime' must not read as date)", () => {
    expect(attributeKind(attr({ Type: "datetime", Format: "date" }))).toBe("date");
    expect(attributeKind(attr({ Type: "datetime", Format: "DateOnly" }))).toBe("date");
    expect(attributeKind(attr({ Type: "datetime", Format: "datetime" }))).toBe("datetime");
  });
});

describe("kind specifics", () => {
  it("reads MaxLength, bounds, and precision fields", () => {
    const text = attr({ Type: "string", MaxLength: 160 });
    expect(attributeMaxLength(text)).toBe(160);

    const numeric = attr({
      Type: "decimal",
      Precision: 4,
      MinValue: 0.01,
      MaxValue: 100000,
    });
    expect(attributePrecision(numeric)).toBe(4);
    expect(attributeMinValue(numeric)).toBe(0.01);
    expect(attributeMaxValue(numeric)).toBe(100000);
  });

  it("reads money precision source", () => {
    const money = attr({ Type: "money", Precision: 2, PrecisionSource: 2 });
    expect(attributePrecisionSource(money)).toBe(2);
    expect(attributePrecision(money)).toBe(2);
  });

  it("reads lookup targets and tolerates a missing Targets array", () => {
    expect(attributeTargets(attr({ Type: "customer", Targets: ["account", "contact"] }))).toEqual([
      "account",
      "contact",
    ]);
    expect(attributeTargets(attr({ Type: "lookup" }))).toEqual([]);
  });

  it("ignores non-numeric noise in numeric fields", () => {
    expect(attributeMaxLength(attr({ Type: "string", MaxLength: "160" }))).toBeUndefined();
    expect(attributePrecision(attr({ Type: "decimal", Precision: null }))).toBeUndefined();
  });
});

describe("option lists", () => {
  it("reads a store-shaped keyed OptionSet with string labels and colors", () => {
    const attribute = attr({
      Type: "picklist",
      OptionSet: {
        "1": { Value: 1, Label: "Accounting", Color: "#0000ff" },
        "2": { Value: 2, Label: "Agriculture" },
      },
    });
    expect(attributeOptions(attribute)).toEqual([
      { value: 1, label: "Accounting", color: "#0000ff" },
      { value: 2, label: "Agriculture", color: undefined },
    ]);
  });

  it("reads an { Options: [...] } list with OData label objects", () => {
    const attribute = attr({
      Type: "picklist",
      OptionSet: {
        Options: [
          { Value: 1, Label: { UserLocalizedLabel: { Label: "Accounting" } } },
          { Value: 2, Label: { UserLocalizedLabel: { Label: "Agriculture" } } },
        ],
      },
    });
    expect(attributeOptions(attribute).map((option) => option.label)).toEqual([
      "Accounting",
      "Agriculture",
    ]);
  });

  it("reads a plain array OptionSet for multiselect", () => {
    const attribute = attr({
      Type: "multiselectpicklist",
      OptionSet: [
        { Value: 100, Label: "One" },
        { Value: 200, Label: "Two" },
      ],
    });
    expect(attributeOptions(attribute)).toEqual([
      { value: 100, label: "One", color: undefined },
      { value: 200, label: "Two", color: undefined },
    ]);
  });

  it("labels fall back to the value when unreadable", () => {
    const attribute = attr({ Type: "picklist", OptionSet: { Options: [{ Value: 7 }] } });
    expect(attributeOptions(attribute)).toEqual([{ value: 7, label: "7", color: undefined }]);
  });

  it("reads boolean options from TrueOption/FalseOption, false first", () => {
    const attribute = attr({
      Type: "boolean",
      OptionSet: {
        TrueOption: { Value: 1, Label: "Do Not Allow" },
        FalseOption: { Value: 0, Label: "Allow" },
      },
    });
    expect(attributeOptions(attribute)).toEqual([
      { value: 0, label: "Allow", color: undefined },
      { value: 1, label: "Do Not Allow", color: undefined },
    ]);
  });

  it("reads boolean options from a list encoding, sorted false first", () => {
    const attribute = attr({
      Type: "boolean",
      OptionSet: [
        { Value: 1, Label: "Do Not Allow" },
        { Value: 0, Label: "Allow" },
      ],
    });
    expect(attributeOptions(attribute).map((option) => option.value)).toEqual([0, 1]);
  });

  it("returns empty for missing option sets and non-option kinds", () => {
    expect(attributeOptions(attr({ Type: "picklist" }))).toEqual([]);
    expect(attributeOptions(attr({ Type: "string" }))).toEqual([]);
  });
});
