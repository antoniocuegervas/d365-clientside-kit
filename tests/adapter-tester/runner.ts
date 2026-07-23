import type { IViewModelContext } from "../../shared/context/IViewModelContext";
import type {
  IOperation,
  IOpsCollector,
  IRunSummary,
  ITestCase,
  ITestError,
  ITestResult,
  Scratch,
  TestChannel,
  TestTier,
} from "./types";

//#region transcript collector

/** Truncates a huge payload so one runaway body cannot swamp the report. */
const MAX_BODY = 4000;
const clip = (text: string): string =>
  text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n... (${text.length - MAX_BODY} more chars)` : text;

/**
 * Default {@link IOpsCollector}. Each helper appends one operation; the runner
 * reads `operations` after the test settles (or throws), so the transcript is
 * whatever the test managed to record before it stopped.
 */
export class OpsCollector implements IOpsCollector {
  private readonly items: IOperation[] = [];

  get operations(): readonly IOperation[] {
    return this.items;
  }

  query(via: string, entitySet: string, query: string): void {
    this.items.push({ label: `GET ${entitySet} via ${via}`, body: query || "(no query string)" });
  }

  fetchXml(via: string, entity: string, fetchXml: string): void {
    this.items.push({ label: `FetchXML ${entity} via ${via}`, body: clip(fetchXml.trim()) });
  }

  write(via: string, entity: string, body: unknown): void {
    const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    this.items.push({ label: `WRITE ${entity} via ${via}`, body: clip(text) });
  }

  http(method: string, url: string, headers?: Record<string, string>, body?: string): void {
    const lines = [`${method} ${url}`];
    for (const [name, value] of Object.entries(headers ?? {})) {
      lines.push(`${name}: ${value}`);
    }
    if (body !== undefined) {
      lines.push("", clip(body));
    }
    this.items.push({ label: `HTTP ${method} (raw)`, body: lines.join("\n") });
  }

  note(text: string): void {
    this.items.push({ label: text });
  }
}

//#endregion

//#region timing

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

//#endregion

//#region error extraction

/**
 * Normalizes a thrown value into a reportable error. Platform rejections are
 * plain `{ errorCode, message }` objects, not Error instances, so both are
 * handled.
 */
export function extractError(error: unknown): ITestError {
  if (error instanceof Error) {
    const firstStackLine = error.stack
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("at"));
    return { message: error.message, firstStackLine };
  }
  if (error && typeof error === "object" && "message" in error) {
    return { message: String((error as { message: unknown }).message) };
  }
  return { message: String(error) };
}

//#endregion

//#region running

export interface IRunOptions {
  /** When set, only cases of this tier run. */
  tier?: TestTier;
  /** Shared bag passed to every case; a fresh one is used when omitted. */
  scratch?: Scratch;
  /** Called as each result lands, for incremental rendering. */
  onResult?: (result: ITestResult) => void;
  /**
   * The Web API version the data channel is pinned to (the API version lab). When
   * set, `ctx` is expected to be the version-pinned wrapper, and every case whose
   * channel is not "kit-data" is SKIPPED here rather than run, so a host-surface
   * or version-explicit test never silently runs against the host while the UI
   * claims a pin. Absent, every selected case runs normally.
   */
  pinnedVersion?: string;
}

/**
 * The skip reason for a non-kit-data case in pinned mode, or undefined when the
 * case should run. Centralizes the "not version-pinnable" decision so no test
 * runs unpinned under a pin.
 */
function pinnedSkipReason(channel: TestChannel | undefined): string | undefined {
  const resolved = channel ?? "kit-data";
  if (resolved === "kit-data") {
    return undefined;
  }
  return resolved === "host-surface"
    ? "host surface, not version-pinnable"
    : "already version-explicit";
}

/**
 * Runs cases sequentially, each isolated: a thrown error or rejected promise
 * becomes a failed result and never stops the run. Sequential order lets an
 * earlier test hand the next one a discovered id through `scratch`.
 */
export async function runTests(
  cases: readonly ITestCase[],
  ctx: IViewModelContext,
  options: IRunOptions = {}
): Promise<ITestResult[]> {
  const scratch: Scratch = options.scratch ?? {};
  const selected = options.tier ? cases.filter((c) => c.tier === options.tier) : cases;
  const results: ITestResult[] = [];
  for (const testCase of selected) {
    const startedAt = now();
    // In pinned mode, a case that does not ride the pinned data channel is
    // skipped here rather than run, so the pin claim on screen stays honest.
    if (options.pinnedVersion) {
      const reason = pinnedSkipReason(testCase.channel);
      if (reason) {
        const skipped: ITestResult = {
          id: testCase.id,
          title: testCase.title,
          tier: testCase.tier,
          section: testCase.section,
          status: "skip",
          detail: `Pinned to v${options.pinnedVersion}: ${reason}.`,
          durationMs: 0,
          operations: [],
        };
        results.push(skipped);
        options.onResult?.(skipped);
        continue;
      }
    }
    // One collector per test; the transcript is read after the test settles,
    // so a throw still leaves the operations recorded up to the failure.
    const ops = new OpsCollector();
    let result: ITestResult;
    try {
      const outcome = await Promise.resolve(testCase.run(ctx, scratch, ops));
      result = {
        id: testCase.id,
        title: testCase.title,
        tier: testCase.tier,
        section: testCase.section,
        status: outcome.status,
        detail: outcome.detail,
        durationMs: now() - startedAt,
        operations: ops.operations,
      };
    } catch (error) {
      const info = extractError(error);
      result = {
        id: testCase.id,
        title: testCase.title,
        tier: testCase.tier,
        section: testCase.section,
        status: "fail",
        detail: info.message,
        durationMs: now() - startedAt,
        operations: ops.operations,
        error: info,
      };
    }
    results.push(result);
    options.onResult?.(result);
  }
  return results;
}

//#endregion

//#region aggregation

export function summarize(results: readonly ITestResult[]): IRunSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skip").length,
  };
}

//#endregion
