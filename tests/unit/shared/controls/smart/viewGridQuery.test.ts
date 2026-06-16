import {
  buildSavedQueryOptions,
  composeFilterExpression,
  composeOrderBy,
} from "../../../../../shared/controls/smart/viewGridQuery";

describe("viewGridQuery composition (G-01 / T-01)", () => {
  describe("composeFilterExpression", () => {
    it("single-field quick find", () => {
      expect(
        composeFilterExpression({ quickFindText: "cont", quickFindFields: ["name"] })
      ).toBe("contains(name,'cont')");
    });

    it("multi-field quick find is OR-grouped", () => {
      expect(
        composeFilterExpression({
          quickFindText: "cont",
          quickFindFields: ["name", "telephone1"],
        })
      ).toBe("(contains(name,'cont') or contains(telephone1,'cont'))");
    });

    it("escapes quotes in the quick-find text", () => {
      expect(
        composeFilterExpression({ quickFindText: "O'Brien", quickFindFields: ["name"] })
      ).toBe("contains(name,'O''Brien')");
    });

    it("ANDs quick find with eq/ne filters and formats values by type", () => {
      expect(
        composeFilterExpression({
          quickFindText: "x",
          quickFindFields: ["name"],
          filters: [
            { attribute: "statecode", operator: "eq", value: 0 },
            { attribute: "name", operator: "ne", value: "Test" },
            { attribute: "donotemail", value: true },
          ],
        })
      ).toBe(
        "contains(name,'x') and statecode eq 0 and name ne 'Test' and donotemail eq true"
      );
    });

    it("skips null/undefined filter values and link-entity (dotted) fields", () => {
      expect(
        composeFilterExpression({
          filters: [
            { attribute: "revenue", value: null },
            { attribute: "primarycontactid.fullname", value: "x" },
            { attribute: "statecode", value: 0 },
          ],
        })
      ).toBe("statecode eq 0");
    });

    it("drops dotted quick-find fields and returns undefined when nothing applies", () => {
      expect(
        composeFilterExpression({ quickFindText: "x", quickFindFields: ["a.b"] })
      ).toBeUndefined();
      expect(composeFilterExpression({})).toBeUndefined();
    });
  });

  describe("composeOrderBy", () => {
    it("formats asc/desc and drops link-entity fields", () => {
      expect(composeOrderBy({ attribute: "createdon", descending: true })).toBe("createdon desc");
      expect(composeOrderBy({ attribute: "name" })).toBe("name asc");
      expect(composeOrderBy({ attribute: "a.b", descending: true })).toBeUndefined();
      expect(composeOrderBy(null)).toBeUndefined();
    });
  });

  describe("buildSavedQueryOptions", () => {
    it("starts from savedQuery and layers filter/orderby/top", () => {
      expect(
        buildSavedQueryOptions("v1", {
          quickFindText: "cont",
          quickFindFields: ["name"],
          orderBy: { attribute: "name" },
          top: 50,
        })
      ).toBe("?savedQuery=v1&$filter=contains(name,'cont')&$orderby=name asc&$top=50");
    });

    it("savedQuery only when no extras apply", () => {
      expect(buildSavedQueryOptions("v1", {})).toBe("?savedQuery=v1");
    });
  });
});
