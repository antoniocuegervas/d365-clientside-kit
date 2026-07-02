import {
  addRootFilter,
  aliasedLookupCell,
  buildSavedQueryOptions,
  composeFilterExpression,
  composeOrderBy,
  lookupCell,
  setFetchPaging,
  setRootOrder,
  splitAliasedColumn,
} from "../../../../../shared/controls/smart/SmartViewGrid";

// These helpers are inlined into SmartViewGrid (so the grid reads as one file)
// and exported there for these unit tests, see the round-3 refactor decision.

describe("savedQuery composition", () => {
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
    it("starts from savedQuery and layers filter/orderby/top (expressions URL-encoded)", () => {
      expect(
        buildSavedQueryOptions("v1", {
          quickFindText: "cont",
          quickFindFields: ["name"],
          orderBy: { attribute: "name" },
          top: 50,
        })
      ).toBe(
        `?savedQuery=v1&$filter=${encodeURIComponent("contains(name,'cont')")}` +
          `&$orderby=${encodeURIComponent("name asc")}&$top=50`
      );
    });

    it("savedQuery only when no extras apply", () => {
      expect(buildSavedQueryOptions("v1", {})).toBe("?savedQuery=v1");
    });

    it("URL-hostile quick-find text survives the URL layer intact", () => {
      // Quote escaping protects the OData literal; this pins the OTHER layer:
      // characters that would restructure the URL itself. The options string
      // must parse into exactly its intended parameters, and the filter must
      // round-trip through decoding to the intended expression.
      for (const text of ["R&D", "100%", "C#", "a+b", "O'Brien & Sons #2 (50%)"]) {
        const options = buildSavedQueryOptions("v1", {
          quickFindText: text,
          quickFindFields: ["name"],
        });
        const params = new URLSearchParams(options.slice(1));
        expect([...params.keys()].sort()).toEqual(["$filter", "savedQuery"]);
        expect(params.get("savedQuery")).toBe("v1");
        expect(params.get("$filter")).toBe(
          `contains(name,'${text.replace(/'/g, "''")}')`
        );
      }
    });
  });
});

describe("FetchXML paging mutation", () => {
  describe("setFetchPaging", () => {
    it("injects page/count onto the root <fetch>", () => {
      const out = setFetchPaging("<fetch><entity name='account'></entity></fetch>", {
        page: 3,
        count: 25,
      });
      expect(out).toBe('<fetch page="3" count="25"><entity name=\'account\'></entity></fetch>');
    });

    it("adds returntotalrecordcount when requested", () => {
      const out = setFetchPaging("<fetch version='1.0'><entity/></fetch>", {
        page: 1,
        count: 50,
        returnTotalRecordCount: true,
      });
      expect(out).toContain("version='1.0'");
      expect(out).toContain('page="1" count="50" returntotalrecordcount="true"');
    });

    it("strips conflicting top/page/count attributes before injecting", () => {
      const out = setFetchPaging('<fetch top="5" page="9" count="10"><entity/></fetch>', {
        page: 2,
        count: 20,
      });
      expect(out).not.toContain('top="5"');
      expect(out).not.toContain('page="9"');
      expect(out).toBe('<fetch page="2" count="20"><entity/></fetch>');
    });

    it("strips single-quoted conflicting attributes (the samples' own house style)", () => {
      // A surviving top beside the injected page/count is a document Dataverse
      // rejects with a 400, so the strip must not care which quotes were used.
      const out = setFetchPaging(
        "<fetch version='1.0' output-format='xml-platform' mapping='logical' top='25'><entity name='activitypointer'/></fetch>",
        { page: 1, count: 10 }
      );
      expect(out).not.toContain("top='25'");
      expect(out).toContain("version='1.0'");
      expect(out).toContain('page="1" count="10"');
    });

    it("strips mixed-quote paging attributes left from an earlier injection", () => {
      const out = setFetchPaging("<fetch page='2' count=\"10\" top='25'><entity/></fetch>", {
        page: 3,
        count: 10,
      });
      expect(out).toBe('<fetch page="3" count="10"><entity/></fetch>');
    });
  });

  describe("addRootFilter", () => {
    it("inserts an AND filter with conditions just inside the root entity", () => {
      const out = addRootFilter(
        "<fetch><entity name='account'><attribute name='name'/></entity></fetch>",
        [{ attribute: "statecode", operator: "eq", value: 0 }],
        "and"
      );
      expect(out).toBe(
        "<fetch><entity name='account'><filter type=\"and\">" +
          '<condition attribute="statecode" operator="eq" value="0" />' +
          "</filter><attribute name='name'/></entity></fetch>"
      );
    });

    it("renders an OR filter and XML-escapes values", () => {
      const out = addRootFilter(
        "<fetch><entity name='account'></entity></fetch>",
        [{ attribute: "name", operator: "like", value: "%A&B%" }],
        "or"
      );
      expect(out).toContain('<filter type="or">');
      expect(out).toContain('value="%A&amp;B%"');
    });

    it("drops dotted (link-entity) attributes and no-ops when nothing remains", () => {
      const fetch = "<fetch><entity name='account'></entity></fetch>";
      expect(addRootFilter(fetch, [{ attribute: "pc.name", operator: "eq", value: "x" }])).toBe(fetch);
    });

    it("omits the value attribute for null-style operators", () => {
      const out = addRootFilter("<fetch><entity name='account'></entity></fetch>", [
        { attribute: "parentaccountid", operator: "null" },
      ]);
      expect(out).toContain('<condition attribute="parentaccountid" operator="null" />');
    });

    it("throws on attribute or operator names that would reshape the markup", () => {
      const fetch = "<fetch><entity name='account'></entity></fetch>";
      // A pasted spreadsheet header or a quote must fail loudly, not inject.
      expect(() =>
        addRootFilter(fetch, [{ attribute: 'name" operator="ne', operator: "eq", value: "x" }])
      ).toThrow(/Invalid FetchXML attribute name/);
      expect(() =>
        addRootFilter(fetch, [{ attribute: "Account Name", operator: "eq", value: "x" }])
      ).toThrow(/Invalid FetchXML attribute name/);
      expect(() =>
        addRootFilter(fetch, [{ attribute: "name", operator: 'eq" value="1', value: "x" }])
      ).toThrow(/Invalid FetchXML operator/);
    });
  });

  describe("setRootOrder", () => {
    it("replaces existing root orders with the host sort", () => {
      const out = setRootOrder(
        "<fetch><entity name='account'><order attribute='createdon' descending='true'/></entity></fetch>",
        "name",
        false
      );
      expect(out).not.toContain("createdon");
      expect(out).toBe(
        "<fetch><entity name='account'><order attribute=\"name\" descending=\"false\" /></entity></fetch>"
      );
    });

    it("no-ops for dotted attributes", () => {
      const fetch = "<fetch><entity name='account'></entity></fetch>";
      expect(setRootOrder(fetch, "pc.name", true)).toBe(fetch);
    });

    it("keeps orders inside link-entity blocks (only the root order is replaced)", () => {
      const out = setRootOrder(
        "<fetch><entity name='account'>" +
          "<order attribute='createdon' descending='true'/>" +
          "<link-entity name='contact' alias='pc'>" +
          "<order attribute='fullname' descending='false'/>" +
          "</link-entity>" +
          "</entity></fetch>",
        "name",
        true
      );
      // The link-entity's own sort survives; the root order is replaced.
      expect(out).toContain("<order attribute='fullname' descending='false'/>");
      expect(out).not.toContain("createdon");
      expect(out).toContain('<order attribute="name" descending="true" /></entity>');
    });

    it("handles nested link-entities without stripping their orders", () => {
      const out = setRootOrder(
        "<fetch><entity name='account'>" +
          "<link-entity name='contact'>" +
          "<link-entity name='team' />" +
          "<order attribute='fullname'/>" +
          "</link-entity>" +
          "<order attribute='createdon'/>" +
          "</entity></fetch>",
        "name",
        false
      );
      expect(out).toContain("<order attribute='fullname'/>");
      expect(out).not.toContain("createdon");
    });
  });
});

describe("Web API cell readers", () => {
  describe("lookupCell", () => {
    const record = {
      _primarycontactid_value: "c1c00000-0000-0000-0000-000000000001",
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

  describe("splitAliasedColumn", () => {
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

  describe("aliasedLookupCell", () => {
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
});
