import type { IOperation, IReportHeader, ITestResult, TestStatus } from "./types";
import { SECTION_ORDER } from "./types";
import { summarize } from "./runner";
import { capabilityVerdictText, deliberatelyNotUsed, summarizeCapabilities } from "./capabilities";
import { LAB_BOUNDARY_NOTE, labSummaryLine, pinBannerLine } from "./lab";

//#region formatting

const STATUS_TAG: Record<TestStatus, string> = {
  pass: "[PASS]",
  fail: "[FAIL]",
  skip: "[SKIP]",
};

function headerBlock(header: IReportHeader): string {
  return [
    "D365 kit context adapter tester",
    "===============================",
    `Generated:   ${header.generatedAt}`,
    `Kit version: ${header.kitVersion}`,
    `Host:        ${header.host}`,
    `Org version: ${header.orgVersion}`,
    `Client URL:  ${header.clientUrl}`,
    `User:        ${header.userName} (${header.userId})`,
    `User agent:  ${header.userAgent}`,
  ].join("\n");
}

function summaryLine(results: readonly ITestResult[]): string {
  const s = summarize(results);
  return `Summary: ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped (${s.total} total)`;
}

/** The kit-required verdict line, joining results to capabilities by probedBy. */
function capabilityVerdictLine(results: readonly ITestResult[], pinnedVersion?: string): string {
  return capabilityVerdictText(summarizeCapabilities(results), pinnedVersion);
}

function operationLines(operations: readonly IOperation[]): string[] {
  if (operations.length === 0) {
    return [];
  }
  const lines = ["       operations:"];
  for (const op of operations) {
    lines.push(`         ${op.label}`);
    if (op.body) {
      for (const bodyLine of op.body.split("\n")) {
        lines.push(`           ${bodyLine}`);
      }
    }
  }
  return lines;
}

function resultBlock(result: ITestResult): string {
  const lines = [
    `${STATUS_TAG[result.status]} ${result.id}  ${result.title}  (${Math.round(result.durationMs)} ms)`,
    `       ${result.detail}`,
    ...operationLines(result.operations),
  ];
  if (result.error) {
    lines.push(`       ! ${result.error.message}`);
    if (result.error.firstStackLine) {
      lines.push(`         ${result.error.firstStackLine}`);
    }
  }
  return lines.join("\n");
}

/** Results grouped under section headers, in the shared section order. */
function sectionBlocks(results: readonly ITestResult[]): string[] {
  const blocks: string[] = [];
  for (const section of SECTION_ORDER) {
    const inSection = results.filter((r) => r.section === section);
    if (inSection.length === 0) {
      continue;
    }
    blocks.push(`== ${section} ==`, "", ...inSection.map(resultBlock), "");
  }
  return blocks;
}

const VERDICT_TAG: Record<string, string> = {
  confirmed: "CONFIRMED",
  failed: "FAILED",
  "not-probed": "NOT PROBED",
};

/** The capability matrix: one row per capability with its verdict and probes. */
function capabilityTable(results: readonly ITestResult[]): string[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const { rows } = summarizeCapabilities(results);
  const lines = ["Platform capability matrix", "=========================="];
  for (const row of rows) {
    const cap = row.capability;
    lines.push(`- [${cap.requirement}] ${VERDICT_TAG[row.verdict]}  ${cap.label}`);
    lines.push(`    ${cap.notes}`);
    const probes = cap.probedBy
      .map((id) => `${id}=${byId.get(id)?.status ?? "not-run"}`)
      .join(", ");
    lines.push(`    probes: ${probes}`);
  }
  return lines;
}

function notUsedBlock(): string[] {
  return [
    "The kit deliberately does NOT use:",
    ...deliberatelyNotUsed.map((item) => `  - ${item}`),
  ];
}

/** The lab's boundary paragraph, printed only when the run carried lab results. */
function labBoundaryBlock(results: readonly ITestResult[], servedVersions?: readonly string[]): string[] {
  return labSummaryLine(results, servedVersions) ? [LAB_BOUNDARY_NOTE, ""] : [];
}

/**
 * The plaintext deliverable a colleague pastes back: header fields, the run
 * summary plus the kit-required capability verdict (and the API version lab
 * line when present), then results grouped by section (each with its literal
 * operation transcript), the capability matrix, the lab's boundary note, and
 * the deliberately-unused list. Complete enough to debug from without a
 * screenshot. `servedVersions` is the sweep's scratch hand-off, threaded so the
 * lab summary can name the org's version surface. `pinnedVersion`, when set,
 * stamps the pin banner (so a pasted pinned report is unmissable) and the
 * "(at the vX.Y path)" verdict suffix.
 */
export function formatReport(
  header: IReportHeader,
  results: readonly ITestResult[],
  servedVersions?: readonly string[],
  pinnedVersion?: string
): string {
  const labLine = labSummaryLine(results, servedVersions);
  return [
    headerBlock(header),
    "",
    ...(pinnedVersion ? [pinBannerLine(pinnedVersion), ""] : []),
    summaryLine(results),
    capabilityVerdictLine(results, pinnedVersion),
    ...(labLine ? [labLine] : []),
    "",
    ...sectionBlocks(results),
    ...capabilityTable(results),
    "",
    ...labBoundaryBlock(results, servedVersions),
    ...notUsedBlock(),
    "",
  ].join("\n");
}

//#endregion
