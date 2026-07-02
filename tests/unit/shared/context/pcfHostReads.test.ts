import { hostEntity, hostRecord, securedReadOnly } from "../../../../shared/context/pcfHostReads";

/**
 * The per-user column security read every bound field PCF shares. The
 * distinction that matters: "not secured" yields undefined (the caller's
 * default applies), while a secured column follows the user's REAL access.
 */
describe("securedReadOnly", () => {
  it("returns undefined when the parameter carries no security object", () => {
    expect(securedReadOnly({})).toBeUndefined();
    expect(securedReadOnly(undefined)).toBeUndefined();
  });

  it("returns undefined when the column is not secured", () => {
    expect(securedReadOnly({ security: { secured: false, editable: false } })).toBeUndefined();
  });

  it("locks a secured column the user cannot edit", () => {
    expect(securedReadOnly({ security: { secured: true, editable: false } })).toBe(true);
  });

  it("keeps a secured column editable when the user has write access", () => {
    expect(securedReadOnly({ security: { secured: true, editable: true } })).toBe(false);
  });
});

/**
 * The host-form identity reads (mode.contextInfo with the page fallback).
 * Both surfaces are undocumented, so the exact fallback order and the
 * degrade-to-undefined behavior are worth pinning.
 */
describe("hostEntity / hostRecord", () => {
  const full = {
    mode: {
      contextInfo: {
        entityId: "{A1A00000-0000-0000-0000-000000000001}",
        entityTypeName: "account",
        entityRecordName: "Contoso Ltd",
      },
    },
    page: { entityId: "ignored", entityTypeName: "ignored" },
  };

  it("prefers mode.contextInfo and normalizes the record id", () => {
    expect(hostEntity(full)).toBe("account");
    expect(hostRecord(full)).toEqual({
      id: "a1a00000-0000-0000-0000-000000000001",
      entityType: "account",
      name: "Contoso Ltd",
    });
  });

  it("falls back to the page surface when contextInfo is absent", () => {
    const pageOnly = {
      page: { entityId: "B2B00000-0000-0000-0000-000000000002", entityTypeName: "contact" },
    };
    expect(hostEntity(pageOnly)).toBe("contact");
    expect(hostRecord(pageOnly)).toEqual({
      id: "b2b00000-0000-0000-0000-000000000002",
      entityType: "contact",
      name: "",
    });
  });

  it("degrades to undefined when neither surface exists (custom page, canvas)", () => {
    expect(hostEntity({})).toBeUndefined();
    expect(hostRecord({ mode: {} })).toBeUndefined();
  });
});
