import type { IViewModelContext, IWebApi } from "../../../shared/context/IViewModelContext";
import type { ITestResult } from "../../../tests/adapter-tester/types";
import { createFakeViewModelContext } from "../../mocks/fakeViewModelContext";
import { OpsCollector, runTests } from "../../../tests/adapter-tester/runner";
import { testCases } from "../../../tests/adapter-tester/tests";
import {
  capabilities,
  capabilityVerdictText,
  summarizeCapabilities,
} from "../../../tests/adapter-tester/capabilities";
import {
  LAB_CLASSIFIERS_ID,
  LAB_FETCHXML_ID,
  LAB_METADATA_ID,
  LAB_SECTION,
  LAB_SERVED_KEY,
  LAB_SWEEP_ID,
  labSummaryLine,
} from "../../../tests/adapter-tester/lab";

// A modern-shaped fake with account metadata scripted so the metadata test can
// resolve industrycode as an option set, the way a real host serves it.
function modernFake(): IViewModelContext {
  return createFakeViewModelContext({
    attributes: {
      "account.name": { Type: "string", MaxLength: 160 },
      "account.industrycode": {
        Type: "picklist",
        OptionSet: { Options: [{ Value: 1, Label: "Accounting" }] },
      },
      "account.createdon": { Type: "datetime" },
      "account.primarycontactid": { Type: "lookup", Targets: ["contact"] },
    },
  }).context;
}

const CREATED_ID = "00000000-0000-0000-0000-0000000000cc";
const caseById = (id: string) => testCases.find((c) => c.id === id)!;

describe("adapter-tester registry against the fake context", () => {
  it("runs tier 1 with no failures on an unscripted fake (reads skip when empty, probes skip off-org)", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    expect(results.filter((r) => r.status === "fail")).toEqual([]);
    // Every tier-1 case produced a result, in order.
    const tier1Ids = testCases.filter((c) => c.tier === 1).map((c) => c.id);
    expect(results.map((r) => r.id)).toEqual(tier1Ids);
  });

  it("every case carries a section", () => {
    for (const c of testCases) {
      expect(c.section).toBeTruthy();
    }
  });

  it("classifies account.industrycode as an option set (metadata shape test passes)", async () => {
    const [metadata] = await runTests(testCases, modernFake(), { tier: 1 }).then((all) =>
      all.filter((r) => r.id === "t1-entity-metadata")
    );
    expect(metadata.status).toBe("pass");
    expect(metadata.detail).toContain("industrycode kind=optionset");
    // The metadata test records what it executed.
    expect(metadata.operations.some((op) => op.label.includes("getEntityMetadata"))).toBe(true);
  });

  it("records the query string it executed on the account read", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    const account = results.find((r) => r.id === "t1-webapi-account")!;
    expect(account.operations[0].body).toContain("$select=accountid,name");
  });

  it("skips the modern-only degradation probe on a modern host", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    const probe = results.find((r) => r.id === "t1-modern-only-member");
    expect(probe?.status).toBe("skip");
  });

  it("skips retrieveRecord when the account query returned no rows", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    const retrieve = results.find((r) => r.id === "t1-retrieve-record");
    expect(retrieve?.status).toBe("skip");
  });

  it("skips the raw same-origin probes off a live org", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    for (const id of [
      "t1-usersettings",
      "t1-metadata-cast",
      "t1-version-path",
      "t1-count",
      // The API version lab is same-origin gated too, so it skips off a live org.
      LAB_SWEEP_ID,
      LAB_FETCHXML_ID,
      LAB_METADATA_ID,
      LAB_CLASSIFIERS_ID,
    ]) {
      expect(results.find((r) => r.id === id)?.status).toBe("skip");
    }
  });

  it("reports write-test cleanup on the tier-2 roundtrip", async () => {
    const results = await runTests([caseById("t2-write-roundtrip")], modernFake(), { tier: 2 });
    const write = results.find((r) => r.id === "t2-write-roundtrip");
    expect(write?.status).toBe("pass");
    expect(write?.detail).toContain("cleanup ok");
  });

  it("passes the escaped-literal positive case when the fake returns the created row", async () => {
    const fake = createFakeViewModelContext({
      queryResults: { account: [{ entities: [{ accountid: CREATED_ID, name: "whatever" }] }] },
    }).context;
    const outcome = await caseById("t2-escaped-literal").run(fake, {}, new OpsCollector());
    expect(outcome.status).toBe("pass");
    expect(outcome.detail).toContain("cleanup ok");
  });

  it("passes the polymorphic bind when the fake echoes the parent lookup", async () => {
    const { context } = createFakeViewModelContext({});
    // Echo the bound parent + its lookuplogicalname on the readback.
    (context.webAPI as unknown as { retrieveRecord: IWebApi["retrieveRecord"] }).retrieveRecord =
      async () => ({
        fullname: "Kit Adapter",
        _parentcustomerid_value: CREATED_ID,
        "_parentcustomerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
      });
    const outcome = await caseById("t2-polymorphic-bind").run(context, {}, new OpsCollector());
    expect(outcome.status).toBe("pass");
    expect(outcome.detail).toContain("cleanup ok (deleted contact");
    expect(outcome.detail).toContain("cleanup ok (deleted account");
  });

  describe("adapter-selection is host-aware", () => {
    const selection = caseById("t1-adapter-selection");

    it("fails when a v8 org version is served by a non-legacy adapter", async () => {
      const ctx = { ...modernFake(), isLegacy: false, orgVersion: "8.2.1.2" } as IViewModelContext;
      const outcome = await selection.run(ctx, {}, new OpsCollector());
      expect(outcome.status).toBe("fail");
    });

    it("passes when a v8 org version is served by the legacy adapter", async () => {
      const ctx = { ...modernFake(), isLegacy: true, orgVersion: "8.2.1.2" } as IViewModelContext;
      const outcome = await selection.run(ctx, {}, new OpsCollector());
      expect(outcome.status).toBe("pass");
    });
  });
});

describe("capability aggregation", () => {
  const result = (id: string, status: ITestResult["status"]): ITestResult => ({
    id,
    title: id,
    tier: 1,
    section: "Data reads",
    status,
    detail: "",
    durationMs: 1,
    operations: [],
  });

  it("marks a capability confirmed when a probe passed", () => {
    const s = summarizeCapabilities([
      result("t1-formatted-values", "pass"),
      result("t1-formatted-values-fetch", "skip"),
    ]);
    expect(s.rows.find((r) => r.capability.id === "annotations")!.verdict).toBe("confirmed");
  });

  it("marks a capability failed when any probe failed", () => {
    const s = summarizeCapabilities([result("t1-fetch-paging", "fail")]);
    expect(s.rows.find((r) => r.capability.id === "fetchxml-paging")!.verdict).toBe("failed");
  });

  it("leaves a tier-2-only capability not-probed until the write tier runs (tier 2 pending)", () => {
    const s = summarizeCapabilities([result("t1-webapi-account", "pass")]);
    expect(s.rows.find((r) => r.capability.id === "odata-bind")!.verdict).toBe("not-probed");
    expect(s.notProbed).toBeGreaterThan(0);
  });

  it("counts confirmed/failed/notProbed over the kit-required set only", () => {
    const required = capabilities.filter((c) => c.requirement === "kit-required").length;
    const s = summarizeCapabilities([]);
    expect(s.confirmed + s.failed + s.notProbed).toBe(required);
    expect(s.notProbed).toBe(required);
  });
});

describe("capabilityVerdictText", () => {
  it("keeps the tier-2-pending suffix while kit-required probes are pending", () => {
    expect(capabilityVerdictText({ confirmed: 9, failed: 0, notProbed: 2, rows: [] })).toBe(
      "Kit-required capabilities: 9 confirmed, 0 failed, 2 not yet probed (tier 2 pending)"
    );
  });

  it("drops the suffix once every kit-required capability has been probed", () => {
    expect(capabilityVerdictText({ confirmed: 11, failed: 0, notProbed: 0, rows: [] })).toBe(
      "Kit-required capabilities: 11 confirmed, 0 failed"
    );
  });
});

describe("API version lab", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // A fake whose clientUrl matches the jsdom origin, so the same-origin gate
  // opens and the sweep's fetch path runs (stubbed below).
  const sameOriginFake = (): IViewModelContext => ({
    ...modernFake(),
    clientUrl: window.location.origin,
  });

  // Serves 8.2 and the 9.x line, 404s the rest, the shape a modern org shows.
  const stubVersionFetch = (served: ReadonlySet<string>): void => {
    global.fetch = jest.fn(async (input: unknown) => {
      const version = /\/api\/data\/v(\d+\.\d+)\//.exec(String(input))?.[1];
      const ok = version ? served.has(version) : false;
      return { ok, status: ok ? 200 : 404 } as Response;
    }) as unknown as typeof fetch;
  };

  const sweep = caseById(LAB_SWEEP_ID);

  it("skips the sweep off-org and writes nothing to scratch", async () => {
    const scratch: Record<string, unknown> = {};
    const outcome = await sweep.run(modernFake(), scratch, new OpsCollector());
    expect(outcome.status).toBe("skip");
    expect(scratch[LAB_SERVED_KEY]).toBeUndefined();
  });

  it("sweeps every version path and hands the served list to scratch", async () => {
    stubVersionFetch(new Set(["8.2", "9.0", "9.1", "9.2"]));
    const scratch: Record<string, unknown> = {};
    const ops = new OpsCollector();
    const outcome = await sweep.run(sameOriginFake(), scratch, ops);
    expect(outcome.status).toBe("pass");
    expect(scratch[LAB_SERVED_KEY]).toEqual(["8.2", "9.0", "9.1", "9.2"]);
    // One probe per version in the roster, all six recorded in the transcript.
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(6);
    expect(outcome.detail).toContain("v8.2");
    expect(outcome.detail).toContain("measures the version CONTRACT, not an old server");
  });

  it("reports a v8.2-only surface without failing (a real 8.x org degrades naturally)", async () => {
    stubVersionFetch(new Set(["8.0", "8.1", "8.2"]));
    const scratch: Record<string, unknown> = {};
    const outcome = await sweep.run(sameOriginFake(), scratch, new OpsCollector());
    expect(outcome.status).toBe("pass");
    expect(scratch[LAB_SERVED_KEY]).toEqual(["8.0", "8.1", "8.2"]);
  });

  describe("v8.2 battery gate", () => {
    const fetchLab = caseById(LAB_FETCHXML_ID);

    it("skips off-org before touching the endpoint", async () => {
      const outcome = await fetchLab.run(modernFake(), {}, new OpsCollector());
      expect(outcome.status).toBe("skip");
      expect(outcome.detail).toContain("same-origin");
    });

    it("skips when the sweep never ran (no served list on scratch)", async () => {
      // A no-op fetch so the gate clears its typeof-fetch guard and reaches the
      // served-list check (jsdom does not guarantee a global fetch).
      global.fetch = jest.fn() as unknown as typeof fetch;
      const outcome = await fetchLab.run(sameOriginFake(), {}, new OpsCollector());
      expect(outcome.status).toBe("skip");
      expect(outcome.detail).toContain("version sweep did not run");
    });

    it("skips when v8.2 is not among the served versions", async () => {
      global.fetch = jest.fn() as unknown as typeof fetch;
      const scratch = { [LAB_SERVED_KEY]: ["9.0", "9.1", "9.2"] };
      for (const id of [LAB_FETCHXML_ID, LAB_METADATA_ID, LAB_CLASSIFIERS_ID]) {
        const outcome = await caseById(id).run(sameOriginFake(), scratch, new OpsCollector());
        expect(outcome.status).toBe("skip");
        expect(outcome.detail).toContain("not served");
      }
    });
  });
});

describe("labSummaryLine", () => {
  const labResult = (id: string, status: ITestResult["status"]): ITestResult => ({
    id,
    title: id,
    tier: 1,
    section: LAB_SECTION,
    status,
    detail: "",
    durationMs: 1,
    operations: [],
  });

  it("returns undefined when the run carried no lab results", () => {
    const nonLab: ITestResult = { ...labResult("t1-webapi-account", "pass"), section: "Data reads" };
    expect(labSummaryLine([nonLab], ["8.2"])).toBeUndefined();
  });

  it("names the served versions and counts pass vs reported", () => {
    const line = labSummaryLine(
      [
        labResult(LAB_SWEEP_ID, "pass"),
        labResult(LAB_FETCHXML_ID, "pass"),
        labResult(LAB_METADATA_ID, "pass"),
        labResult(LAB_CLASSIFIERS_ID, "pass"),
      ],
      ["8.2", "9.0", "9.1", "9.2"]
    );
    expect(line).toBe(
      "API versions served: v8.2, v9.0, v9.1, v9.2; v8.2-endpoint battery: 2 pass, 0 fail, 1 reported"
    );
  });

  it("counts a battery failure in its own segment", () => {
    const line = labSummaryLine(
      [
        labResult(LAB_SWEEP_ID, "pass"),
        labResult(LAB_FETCHXML_ID, "fail"),
        labResult(LAB_METADATA_ID, "pass"),
        labResult(LAB_CLASSIFIERS_ID, "pass"),
      ],
      ["8.2", "9.2"]
    );
    expect(line).toContain("v8.2-endpoint battery: 1 pass, 1 fail, 1 reported");
  });

  it("marks the battery not-run when its tests all skipped", () => {
    const line = labSummaryLine(
      [
        labResult(LAB_SWEEP_ID, "pass"),
        labResult(LAB_FETCHXML_ID, "skip"),
        labResult(LAB_METADATA_ID, "skip"),
        labResult(LAB_CLASSIFIERS_ID, "skip"),
      ],
      ["9.0", "9.1", "9.2"]
    );
    expect(line).toContain("API versions served: v9.0, v9.1, v9.2");
    expect(line).toContain("v8.2-endpoint battery: not run");
  });

  it("names the pin, not a missing path, when v8.2 is served but the battery skipped", () => {
    const line = labSummaryLine(
      [
        labResult(LAB_SWEEP_ID, "skip"),
        labResult(LAB_FETCHXML_ID, "skip"),
        labResult(LAB_METADATA_ID, "skip"),
        labResult(LAB_CLASSIFIERS_ID, "skip"),
      ],
      ["8.0", "8.1", "8.2", "9.0", "9.1", "9.2"]
    );
    expect(line).toContain("not run (skipped under a version pin)");
    expect(line).not.toContain("not served here");
  });

  it("reads an absent served list as a sweep skipped off-org", () => {
    const line = labSummaryLine([labResult(LAB_SWEEP_ID, "skip")], undefined);
    expect(line).toContain("(sweep skipped off-org)");
  });
});
