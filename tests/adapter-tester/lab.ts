import type { ITestResult, TestSection } from "./types";

//#region lab identity

/** The lab's on-screen section, shared so tests, strip, and report agree. */
export const LAB_SECTION: TestSection = "API version lab";

/** Service-document version paths the sweep probes, oldest first. */
export const LAB_VERSIONS: readonly string[] = ["8.0", "8.1", "8.2", "9.0", "9.1", "9.2"];

/** Scratch key the sweep writes and the v8.2 battery reads to gate on. */
export const LAB_SERVED_KEY = "labServedVersions";

export const LAB_SWEEP_ID = "t1-lab-version-sweep";
export const LAB_FETCHXML_ID = "t1-lab-v82-fetchxml";
export const LAB_METADATA_ID = "t1-lab-v82-metadata-synthesis";
export const LAB_CLASSIFIERS_ID = "t1-lab-v82-classifiers";

/** The detail prefix every v8.2-endpoint result opens with, so a pasted report
 * cannot be misread as evidence from a real 8.2 server. */
export const LAB_V82_PREFIX = "v8.2 endpoint on this org: ";

/**
 * The lab's purpose and its honest boundary, one string reused by the on-screen
 * panel and the copied report. A modern org keeps serving its older Web API
 * version paths, so the kit's real v8 client code runs against the v8.2
 * CONTRACT here; but the engine behind every path is the same modern server, so
 * this measures the contract, not an old server.
 */
export const LAB_BOUNDARY_NOTE =
  "API version lab: a modern org keeps serving its older Web API version paths, so the kit's real v8 " +
  "client code can run against the /api/data/v8.2/ contract here, several rungs above mocks. The honest " +
  "boundary: the server behind every version path is the same modern engine, so this measures the " +
  "API-version CONTRACT, not an old server. v8-era engine quirks may or may not reproduce, and the lab " +
  "MEASURES that instead of assuming it. A run on a real 8.2 org remains the definitive v8 evidence.";

/**
 * The unmissable pin banner, one string reused by the header card, the summary
 * strip, and the copied report so all three agree. States exactly what is
 * pinned (the data channel, at a version path) and what is NOT (the host
 * surfaces stay live), so a pasted report is never misread as a whole-context
 * v8 run.
 */
export function pinBannerLine(version: string): string {
  return (
    `Data channel pinned: /api/data/v${version}/ ` +
    `(lab mode: contract-level, host surfaces unpinned)`
  );
}

//#endregion

//#region section summary line

// The battery splits into tests that ASSERT (pass/fail) and tests that only
// REPORT a finding; the summary counts them separately.
const ASSERTION_BATTERY = new Set([LAB_FETCHXML_ID, LAB_METADATA_ID]);
const REPORT_BATTERY = new Set([LAB_CLASSIFIERS_ID]);

/**
 * The lab section's own summary line ("API versions served: ...; v8.2-endpoint
 * battery: N pass, M reported"). Returns undefined when the run carried no lab
 * results, so a report without the lab omits the line. `servedVersions` is the
 * sweep's scratch hand-off; absent (off-org, sweep skipped) it reads as such.
 */
export function labSummaryLine(
  results: readonly ITestResult[],
  servedVersions?: readonly string[]
): string | undefined {
  const lab = results.filter((r) => r.section === LAB_SECTION);
  if (lab.length === 0) {
    return undefined;
  }
  const servedText =
    servedVersions === undefined
      ? "(sweep skipped off-org)"
      : servedVersions.length
        ? servedVersions.map((v) => `v${v}`).join(", ")
        : "(none)";
  const battery = lab.filter((r) => r.id !== LAB_SWEEP_ID);
  const ran = battery.filter((r) => r.status !== "skip");
  if (ran.length === 0) {
    // Two different reasons for an unrun battery, and saying the wrong one is
    // worse than saying nothing: under a version pin the lab skips by design,
    // which is not the same as the org refusing to serve the v8.2 path.
    let why = "";
    if (servedVersions?.includes("8.2")) {
      why = " (skipped under a version pin)";
    } else if (servedVersions !== undefined) {
      why = " (v8.2 path not served here)";
    }
    return `API versions served: ${servedText}; v8.2-endpoint battery: not run${why}`;
  }
  const passed = battery.filter((r) => ASSERTION_BATTERY.has(r.id) && r.status === "pass").length;
  const failed = battery.filter((r) => r.status === "fail").length;
  const reported = battery.filter((r) => REPORT_BATTERY.has(r.id) && r.status !== "skip").length;
  return (
    `API versions served: ${servedText}; v8.2-endpoint battery: ` +
    `${passed} pass, ${failed} fail, ${reported} reported`
  );
}

//#endregion
