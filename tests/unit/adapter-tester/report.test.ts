import type { IReportHeader, ITestResult } from "../../../tests/adapter-tester/types";
import { formatReport } from "../../../tests/adapter-tester/report";
import { LAB_BOUNDARY_NOTE, LAB_SECTION, pinBannerLine } from "../../../tests/adapter-tester/lab";

const header: IReportHeader = {
  generatedAt: "2026-07-23T00:00:00.000Z",
  kitVersion: "1.3.0",
  host: "V8 (legacy CRM 8.x)",
  isLegacy: true,
  orgVersion: "8.2.1.2",
  clientUrl: "https://crm.onprem.contoso.com/org",
  userId: "bbbbbbbb-0000-0000-0000-000000000002",
  userName: "Legacy User",
  userAgent: "Mozilla/5.0 (probe)",
};

const results: ITestResult[] = [
  {
    id: "t1-webapi-account",
    title: "First check",
    tier: 1,
    section: "Data reads",
    status: "pass",
    detail: "all good",
    durationMs: 12,
    operations: [
      { label: "GET account via cds-client", body: "?$select=accountid,name&$top=1" },
      { label: "1 row" },
    ],
  },
  {
    id: "t1-b",
    title: "Skipped check",
    tier: 1,
    section: "Context",
    status: "skip",
    detail: "n/a here",
    durationMs: 0,
    operations: [],
  },
  {
    id: "t1-c",
    title: "Failing check",
    tier: 1,
    section: "Metadata",
    status: "fail",
    detail: "did not match",
    durationMs: 340.7,
    operations: [],
    error: { message: "server said no", firstStackLine: "at CdsClient.fetch (cds.js:10)" },
  },
];

describe("adapter-tester report", () => {
  const text = formatReport(header, results);

  it("reproduces the header fields", () => {
    expect(text).toContain("Kit version: 1.3.0");
    expect(text).toContain("Host:        V8 (legacy CRM 8.x)");
    expect(text).toContain("Org version: 8.2.1.2");
    expect(text).toContain("User:        Legacy User (bbbbbbbb-0000-0000-0000-000000000002)");
    expect(text).toContain("User agent:  Mozilla/5.0 (probe)");
  });

  it("writes a summary line with the counts", () => {
    expect(text).toContain("Summary: 1 passed, 1 failed, 1 skipped (3 total)");
  });

  it("writes the kit-required capability verdict line", () => {
    expect(text).toMatch(/Kit-required capabilities: \d+ confirmed, \d+ failed, \d+ not yet probed \(tier 2 pending\)/);
  });

  it("groups results under section headers, in the canonical order", () => {
    expect(text).toContain("== Context ==");
    expect(text).toContain("== Data reads ==");
    expect(text).toContain("== Metadata ==");
    // Context precedes Data reads precedes Metadata.
    expect(text.indexOf("== Context ==")).toBeLessThan(text.indexOf("== Data reads =="));
    expect(text.indexOf("== Data reads ==")).toBeLessThan(text.indexOf("== Metadata =="));
  });

  it("tags each result and rounds the duration", () => {
    expect(text).toContain("[PASS] t1-webapi-account  First check  (12 ms)");
    expect(text).toContain("[SKIP] t1-b  Skipped check  (0 ms)");
    expect(text).toContain("[FAIL] t1-c  Failing check  (341 ms)");
  });

  it("renders the operation transcript under a result", () => {
    expect(text).toContain("operations:");
    expect(text).toContain("GET account via cds-client");
    expect(text).toContain("?$select=accountid,name&$top=1");
  });

  it("includes the detail line for every result", () => {
    expect(text).toContain("all good");
    expect(text).toContain("n/a here");
    expect(text).toContain("did not match");
  });

  it("includes the error message and first stack line for a failure only", () => {
    expect(text).toContain("! server said no");
    expect(text).toContain("at CdsClient.fetch (cds.js:10)");
    // The error appears once, and only inside the failing result's block.
    expect(text.split("! server said no")).toHaveLength(2);
    expect(text.indexOf("[FAIL] t1-c")).toBeLessThan(text.indexOf("! server said no"));
  });

  it("renders the capability matrix with a verdict per capability", () => {
    expect(text).toContain("Platform capability matrix");
    expect(text).toContain("[kit-required]");
    expect(text).toContain("[informational]");
    // annotations is confirmed by the passing t1-formatted-values probe... but
    // that test did not run here, so it reads NOT PROBED; the failing metadata
    // probe is not one of its probes. At least one verdict tag must appear.
    expect(text).toMatch(/CONFIRMED|FAILED|NOT PROBED/);
    // Probe linkage is printed.
    expect(text).toContain("probes:");
  });

  it("renders the deliberately-not-used list", () => {
    expect(text).toContain("The kit deliberately does NOT use:");
    expect(text).toContain("- $apply aggregation");
    expect(text).toContain("- return=representation");
    expect(text).toContain("- $count=true");
  });

  it("omits the lab summary line and boundary note when the run carried no lab results", () => {
    expect(text).not.toContain("== API version lab ==");
    expect(text).not.toContain("API versions served:");
    expect(text).not.toContain(LAB_BOUNDARY_NOTE);
  });

  it("omits the pin banner and the version suffix when no version is pinned", () => {
    expect(text).not.toContain("Data channel pinned:");
    expect(text).not.toContain("(at the v");
  });
});

describe("adapter-tester report in pinned mode", () => {
  const text = formatReport(header, results, ["8.2"], "8.2");

  it("stamps the unmissable pin banner near the top", () => {
    expect(text).toContain(pinBannerLine("8.2"));
    expect(text).toContain(
      "Data channel pinned: /api/data/v8.2/ (lab mode: contract-level, host surfaces unpinned)"
    );
  });

  it("marks the capability verdict line with the pinned path", () => {
    expect(text).toMatch(/Kit-required capabilities:.*\(at the v8\.2 path\)/);
  });
});

describe("adapter-tester report with the API version lab", () => {
  const labResult = (id: string, status: ITestResult["status"], detail: string): ITestResult => ({
    id,
    title: id,
    tier: 1,
    section: LAB_SECTION,
    status,
    detail,
    durationMs: 3,
    operations: [],
  });

  const labResults: ITestResult[] = [
    ...results,
    labResult("t1-lab-version-sweep", "pass", "API version paths on this org: served v8.2, v9.2."),
    labResult("t1-lab-v82-fetchxml", "pass", "v8.2 endpoint on this org: paging annotations arrived."),
    labResult("t1-lab-v82-metadata-synthesis", "pass", "v8.2 endpoint on this org: metadata shape ok."),
    labResult("t1-lab-v82-classifiers", "pass", "v8.2 endpoint on this org: $apply present."),
  ];

  const text = formatReport(header, labResults, ["8.2", "9.2"]);

  it("renders the lab section under its own header, in canonical order (after Metadata)", () => {
    expect(text).toContain("== API version lab ==");
    expect(text.indexOf("== Metadata ==")).toBeLessThan(text.indexOf("== API version lab =="));
  });

  it("writes the lab summary line with served versions and battery counts", () => {
    expect(text).toContain(
      "API versions served: v8.2, v9.2; v8.2-endpoint battery: 2 pass, 0 fail, 1 reported"
    );
  });

  it("prints the contract-level boundary note", () => {
    expect(text).toContain(LAB_BOUNDARY_NOTE);
    expect(text).toContain("measures the API-version CONTRACT, not an old server");
  });
});
