import {
  addRootFilter,
  setFetchPaging,
  setRootOrder,
} from "../../../../../shared/controls/smart/fetchXmlPaging";

describe("setFetchPaging (N-04)", () => {
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
    expect(out).toContain('version=\'1.0\'');
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
});

describe("addRootFilter (N-04)", () => {
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
});

describe("setRootOrder (N-04)", () => {
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
});
