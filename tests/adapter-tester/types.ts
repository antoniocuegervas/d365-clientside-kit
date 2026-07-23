import type { IViewModelContext } from "../../shared/context/IViewModelContext";

/** Result of one test: passed, failed an assertion, or skipped (not applicable). */
export type TestStatus = "pass" | "fail" | "skip";

/** Tier 1 is read-only and auto-runs; tier 2 mutates and runs only on request. */
export type TestTier = 1 | 2;

/**
 * Which channel a test exercises, deciding whether it can be re-run against a
 * version-pinned data channel (the API version lab, pinned mode):
 *  - "kit-data": rides the ctx surface the pinned wrapper reroutes (webAPI,
 *    utils.getEntityMetadata, metadata), so it runs against the pinned version.
 *  - "host-surface": reads a host member with no version dimension (adapter
 *    selection, global context, formatting, the modern-only probe), so it
 *    skips in pinned mode ("host surface, not version-pinnable").
 *  - "version-explicit": already targets an explicit version path or builds its
 *    own client / raw fetch (the sweep, the classifiers, the whole v8.2
 *    battery, the raw same-origin probes), so it skips in pinned mode
 *    ("already version-explicit") rather than silently running unpinned.
 */
export type TestChannel = "kit-data" | "host-surface" | "version-explicit";

/** On-screen grouping for the roster, in render order. */
export type TestSection =
  | "Context"
  | "Data reads"
  | "FetchXML channel"
  | "Metadata"
  | "Capability probes"
  | "API version lab"
  | "Mutations";

/** Section render order, one place so screen and report agree. */
export const SECTION_ORDER: readonly TestSection[] = [
  "Context",
  "Data reads",
  "FetchXML channel",
  "Metadata",
  "Capability probes",
  "API version lab",
  "Mutations",
];

/** Bag threaded through one run so an earlier test can hand a later one a discovered id. */
export type Scratch = Record<string, unknown>;

/**
 * One literal operation a test performed: the label is a one-line summary, the
 * body is the verbatim payload (an OData query string, a FetchXML document, a
 * JSON write body, or a request URL with its headers). Recorded as the test
 * runs so a failure keeps the partial transcript.
 */
export interface IOperation {
  label: string;
  body?: string;
}

/**
 * Transcript collector handed to each test. Every helper appends one
 * {@link IOperation}; the runner attaches the collected list to the result,
 * even when the test throws, so the last operation before a failure is visible.
 */
export interface IOpsCollector {
  /** A raw OData query string through the adapter ("?$select=...&$top=1"). */
  query(via: string, entitySet: string, query: string): void;
  /** A FetchXML document through the adapter or the kit XHR client. */
  fetchXml(via: string, entity: string, fetchXml: string): void;
  /** A write body (create/update payload). */
  write(via: string, entity: string, body: unknown): void;
  /** A raw HTTP request: method, url, and any notable headers plus body. */
  http(method: string, url: string, headers?: Record<string, string>, body?: string): void;
  /** A freeform line, for what a response carried back (the debugging value). */
  note(text: string): void;
  readonly operations: readonly IOperation[];
}

export interface ITestOutcome {
  status: TestStatus;
  detail: string;
}

export interface ITestCase {
  id: string;
  title: string;
  tier: TestTier;
  section: TestSection;
  /**
   * The channel this test exercises. Omitted reads as "kit-data" (runs in
   * pinned mode); every production case tags itself explicitly.
   */
  channel?: TestChannel;
  run(
    ctx: IViewModelContext,
    scratch: Scratch,
    ops: IOpsCollector
  ): Promise<ITestOutcome> | ITestOutcome;
}

export interface ITestError {
  message: string;
  firstStackLine?: string;
}

export interface ITestResult {
  id: string;
  title: string;
  tier: TestTier;
  section: TestSection;
  status: TestStatus;
  detail: string;
  durationMs: number;
  /** Literal operations performed, in order; kept even when the test failed. */
  operations: readonly IOperation[];
  /** Present only for a failure raised by a thrown error or a host rejection. */
  error?: ITestError;
}

export interface IRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

/** The header fields shown on screen and reproduced at the top of the copied report. */
export interface IReportHeader {
  generatedAt: string;
  kitVersion: string;
  host: string;
  isLegacy: boolean;
  orgVersion: string;
  clientUrl: string;
  userId: string;
  userName: string;
  userAgent: string;
}
