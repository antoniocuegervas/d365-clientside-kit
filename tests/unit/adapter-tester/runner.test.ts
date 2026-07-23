import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import type { ITestCase, ITestResult } from "../../../tests/adapter-tester/types";
import {
  extractError,
  OpsCollector,
  runTests,
  summarize,
} from "../../../tests/adapter-tester/runner";

// The runner never inspects ctx; a bare stub stands in for every case here.
const ctx = {} as IViewModelContext;

const makeCase = (over: Partial<ITestCase> & Pick<ITestCase, "id" | "run">): ITestCase => ({
  title: over.id,
  tier: 1,
  section: "Context",
  ...over,
});

describe("adapter-tester runner", () => {
  it("isolates a throwing case: it fails, the rest still run", async () => {
    const cases: ITestCase[] = [
      makeCase({ id: "a", run: () => ({ status: "pass", detail: "ok" }) }),
      makeCase({
        id: "b",
        run: () => {
          throw new Error("boom");
        },
      }),
      makeCase({ id: "c", run: () => ({ status: "pass", detail: "ok" }) }),
    ];
    const results = await runTests(cases, ctx);
    expect(results.map((r) => `${r.id}:${r.status}`)).toEqual(["a:pass", "b:fail", "c:pass"]);
    expect(results[1].error?.message).toBe("boom");
    expect(results[1].detail).toBe("boom");
  });

  it("folds a rejected promise into a failed result", async () => {
    const cases = [makeCase({ id: "r", run: () => Promise.reject(new Error("nope")) })];
    const [result] = await runTests(cases, ctx);
    expect(result.status).toBe("fail");
    expect(result.error?.message).toBe("nope");
  });

  it("filters by tier", async () => {
    const cases: ITestCase[] = [
      makeCase({ id: "one", tier: 1, run: () => ({ status: "pass", detail: "" }) }),
      makeCase({ id: "two", tier: 2, run: () => ({ status: "pass", detail: "" }) }),
    ];
    const tier1 = await runTests(cases, ctx, { tier: 1 });
    const tier2 = await runTests(cases, ctx, { tier: 2 });
    expect(tier1.map((r) => r.id)).toEqual(["one"]);
    expect(tier2.map((r) => r.id)).toEqual(["two"]);
  });

  it("threads a shared scratch bag through cases in order", async () => {
    const cases: ITestCase[] = [
      makeCase({
        id: "producer",
        run: (_ctx, scratch) => {
          scratch.value = 42;
          return { status: "pass", detail: "set" };
        },
      }),
      makeCase({
        id: "consumer",
        run: (_ctx, scratch) => ({
          status: scratch.value === 42 ? "pass" : "fail",
          detail: String(scratch.value),
        }),
      }),
    ];
    const results = await runTests(cases, ctx);
    expect(results[1].status).toBe("pass");
    expect(results[1].detail).toBe("42");
  });

  it("calls onResult once per result, as they land", async () => {
    const seen: string[] = [];
    const cases: ITestCase[] = [
      makeCase({ id: "a", run: () => ({ status: "pass", detail: "" }) }),
      makeCase({ id: "b", run: () => ({ status: "skip", detail: "" }) }),
    ];
    await runTests(cases, ctx, { onResult: (r) => seen.push(r.id) });
    expect(seen).toEqual(["a", "b"]);
  });

  it("records a numeric duration per result", async () => {
    const [result] = await runTests(
      [makeCase({ id: "a", run: () => ({ status: "pass", detail: "" }) })],
      ctx
    );
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("summarize counts each status", () => {
    const base = { section: "Context" as const, operations: [] };
    const results: ITestResult[] = [
      { id: "a", title: "a", tier: 1, status: "pass", detail: "", durationMs: 1, ...base },
      { id: "b", title: "b", tier: 1, status: "fail", detail: "", durationMs: 1, ...base },
      { id: "c", title: "c", tier: 1, status: "skip", detail: "", durationMs: 1, ...base },
      { id: "d", title: "d", tier: 2, status: "pass", detail: "", durationMs: 1, ...base },
    ];
    expect(summarize(results)).toEqual({ total: 4, passed: 2, failed: 1, skipped: 1 });
  });

  describe("operation transcripts", () => {
    it("attaches the operations a case recorded to its result", async () => {
      const [result] = await runTests(
        [
          makeCase({
            id: "records",
            run: (_ctx, _scratch, ops) => {
              ops.query("Xrm.WebApi", "account", "?$select=name&$top=1");
              ops.note("1 row");
              return { status: "pass", detail: "ok" };
            },
          }),
        ],
        ctx
      );
      expect(result.operations.map((op) => op.label)).toEqual([
        "GET account via Xrm.WebApi",
        "1 row",
      ]);
      expect(result.operations[0].body).toBe("?$select=name&$top=1");
    });

    it("keeps the partial transcript when a case throws mid-way", async () => {
      const [result] = await runTests(
        [
          makeCase({
            id: "boom-after-op",
            run: (_ctx, _scratch, ops) => {
              ops.fetchXml("cds-client", "account", "<fetch/>");
              throw new Error("mid-way");
            },
          }),
        ],
        ctx
      );
      expect(result.status).toBe("fail");
      expect(result.error?.message).toBe("mid-way");
      // The operation recorded before the throw survives, the debugging value.
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].label).toBe("FetchXML account via cds-client");
    });

    it("carries the section onto the result", async () => {
      const [result] = await runTests(
        [makeCase({ id: "s", section: "Metadata", run: () => ({ status: "pass", detail: "" }) })],
        ctx
      );
      expect(result.section).toBe("Metadata");
    });
  });

  describe("OpsCollector helpers", () => {
    it("records write payloads and raw HTTP with headers", () => {
      const ops = new OpsCollector();
      ops.write("Xrm.WebApi", "account", { name: "Contoso" });
      ops.http("POST", "https://org/api/data/v9.2/accounts", { Prefer: "return=representation" }, "{}");
      expect(ops.operations[0].label).toBe("WRITE account via Xrm.WebApi");
      expect(ops.operations[0].body).toContain('"name": "Contoso"');
      expect(ops.operations[1].label).toBe("HTTP POST (raw)");
      expect(ops.operations[1].body).toContain("Prefer: return=representation");
      expect(ops.operations[1].body).toContain("POST https://org/api/data/v9.2/accounts");
    });

    it("truncates a runaway body", () => {
      const ops = new OpsCollector();
      ops.fetchXml("cds-client", "account", "x".repeat(9000));
      expect(ops.operations[0].body).toContain("more chars)");
      expect(ops.operations[0].body!.length).toBeLessThan(9000);
    });
  });

  describe("extractError", () => {
    it("reads message and first stack line from an Error", () => {
      const info = extractError(new Error("bad"));
      expect(info.message).toBe("bad");
      expect(info.firstStackLine?.startsWith("at")).toBe(true);
    });

    it("reads message from a platform-style rejection object", () => {
      expect(extractError({ errorCode: 123, message: "validation failed" })).toEqual({
        message: "validation failed",
      });
    });

    it("stringifies anything else", () => {
      expect(extractError("plain string").message).toBe("plain string");
    });
  });
});
