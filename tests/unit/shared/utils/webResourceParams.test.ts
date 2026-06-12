import {
  buildClientUIDataParam,
  parseWebResourceParams,
} from "../../../../shared/utils/webResourceParams";

describe("parseWebResourceParams", () => {
  it("reads ?app= directly", () => {
    const result = parseWebResourceParams("?app=template&theme=dark");
    expect(result.app).toBe("template");
    expect(result.query).toEqual({ app: "template", theme: "dark" });
  });

  it("reads app from a JSON data payload", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "sample-company-search", accountId: "abc" }));
    const result = parseWebResourceParams(`?data=${data}`);
    expect(result.app).toBe("sample-company-search");
    expect(result.data).toEqual({ app: "sample-company-search", accountId: "abc" });
  });

  it("?app= wins over the data payload app", () => {
    const data = encodeURIComponent(JSON.stringify({ app: "from-data" }));
    const result = parseWebResourceParams(`?app=from-query&data=${data}`);
    expect(result.app).toBe("from-query");
  });

  it("handles double-encoded data (CRM behavior)", () => {
    const once = encodeURIComponent(JSON.stringify({ app: "double" }));
    const twice = encodeURIComponent(once);
    const result = parseWebResourceParams(`?data=${twice}`);
    expect(result.app).toBe("double");
  });

  it("passes plain-string data through", () => {
    const result = parseWebResourceParams("?data=hello%20world");
    expect(result.data).toBe("hello world");
    expect(result.app).toBeUndefined();
  });

  it("tolerates malformed JSON as a plain string", () => {
    const result = parseWebResourceParams("?data=%7Bnot-json");
    expect(result.data).toBe("{not-json");
  });

  it("handles a search string without leading question mark", () => {
    expect(parseWebResourceParams("app=x").app).toBe("x");
  });
});

describe("buildClientUIDataParam", () => {
  it("round-trips through the parser", () => {
    const data = buildClientUIDataParam("sample-merged-grid", { regionId: "123" });
    const parsed = parseWebResourceParams(`?data=${encodeURIComponent(data)}`);
    expect(parsed.app).toBe("sample-merged-grid");
    expect((parsed.data as Record<string, unknown>).regionId).toBe("123");
  });
});
