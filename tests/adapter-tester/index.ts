import { createContextFromXrm, findXrm } from "../../shared/context/createWebResourceContext";
import type { IViewModelContext } from "../../shared/context/IViewModelContext";
import { testCases } from "./tests";
import { runTests, summarize } from "./runner";
import { formatReport } from "./report";
import { capabilityVerdictText, deliberatelyNotUsed, summarizeCapabilities } from "./capabilities";
import type { ICapabilityRow } from "./capabilities";
import { LAB_BOUNDARY_NOTE, LAB_SERVED_KEY, labSummaryLine, pinBannerLine } from "./lab";
import { createPinnedContext } from "./pinnedContext";
import type { IReportHeader, ITestResult, Scratch, TestSection } from "./types";
import { SECTION_ORDER } from "./types";

//#region small DOM helpers

type Attrs = Record<string, string>;

function el(tag: string, attrs: Attrs = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

const STYLE = `
  .kt-body { font-family: 'Segoe UI', system-ui, sans-serif; color: #201f1e; margin: 0; padding: 20px; max-width: 900px; }
  .kt-body h1 { font-size: 20px; margin: 0 0 4px; }
  .kt-sub { color: #605e5c; font-size: 13px; margin: 0 0 16px; }
  .kt-header { background: #f3f2f1; border: 1px solid #edebe9; border-radius: 4px; padding: 12px 14px; font-size: 13px; margin-bottom: 16px; }
  .kt-header dt { color: #605e5c; }
  .kt-grid { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; }
  .kt-grid dt { font-weight: 600; }
  .kt-grid dd { margin: 0; word-break: break-word; }
  .kt-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .kt-btn { font: inherit; font-size: 13px; padding: 7px 14px; border: 1px solid #8a8886; border-radius: 4px; background: #fff; cursor: pointer; }
  .kt-btn-primary { background: #0f6cbd; border-color: #0f6cbd; color: #fff; }
  .kt-btn:disabled { opacity: 0.5; cursor: default; }
  .kt-result { border: 1px solid #edebe9; border-left-width: 4px; border-radius: 3px; padding: 8px 12px; margin-bottom: 6px; font-size: 13px; }
  .kt-result.pass { border-left-color: #107c10; }
  .kt-result.fail { border-left-color: #d13438; }
  .kt-result.skip { border-left-color: #8a8886; }
  .kt-result .kt-r-head { display: flex; justify-content: space-between; gap: 12px; }
  .kt-tag { font-weight: 700; font-size: 11px; letter-spacing: 0.5px; }
  .kt-tag.pass { color: #107c10; }
  .kt-tag.fail { color: #d13438; }
  .kt-tag.skip { color: #8a8886; }
  .kt-title { flex: 1; font-weight: 600; }
  .kt-ms { color: #605e5c; white-space: nowrap; }
  .kt-detail { color: #323130; margin-top: 4px; white-space: pre-wrap; }
  .kt-error { color: #a4262c; margin-top: 4px; white-space: pre-wrap; font-family: 'Cascadia Code', Consolas, monospace; font-size: 12px; }
  .kt-note { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
  .kt-mono { font-family: 'Cascadia Code', Consolas, monospace; background: #f3f2f1; padding: 1px 4px; border-radius: 3px; }
  .kt-copied { color: #107c10; font-size: 13px; align-self: center; }
  .kt-ops { margin-top: 6px; padding: 6px 8px; background: #faf9f8; border: 1px solid #edebe9; border-radius: 3px; font-family: 'Cascadia Code', Consolas, monospace; font-size: 11.5px; white-space: pre-wrap; overflow-x: auto; color: #323130; }
  .kt-ops-label { color: #605e5c; margin-bottom: 2px; }
  .kt-op-line { color: #201f1e; }
  .kt-op-body { color: #0b5394; padding-left: 14px; }
  .kt-section { font-size: 15px; font-weight: 700; margin: 18px 0 8px; padding-bottom: 3px; border-bottom: 2px solid #edebe9; }
  .kt-strip { background: #eff6fc; border: 1px solid #0f6cbd; border-radius: 4px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px; }
  .kt-strip .kt-strip-cap { font-weight: 600; margin-top: 4px; }
  .kt-strip .kt-strip-lab { margin-top: 4px; }
  .kt-strip .kt-strip-pin { font-weight: 700; color: #8a5a00; margin-bottom: 4px; }
  .kt-pin-banner { background: #fff4ce; border: 1px solid #f2c94c; border-radius: 4px; padding: 8px 12px; font-size: 13px; font-weight: 700; color: #8a5a00; margin-bottom: 12px; }
  .kt-lab-picker { border: 1px solid #edebe9; border-radius: 4px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
  .kt-lab-picker .kt-picker-label { font-weight: 600; margin-bottom: 6px; }
  .kt-picker-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .kt-btn.kt-btn-active { background: #0f6cbd; border-color: #0f6cbd; color: #fff; }
  .kt-caps { border: 1px solid #edebe9; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }
  .kt-caps h2 { font-size: 15px; margin: 0 0 8px; }
  .kt-cap-row { display: grid; grid-template-columns: max-content 1fr; gap: 4px 10px; padding: 5px 0; border-top: 1px solid #f3f2f1; }
  .kt-cap-verdict { font-weight: 700; font-size: 11px; letter-spacing: 0.4px; white-space: nowrap; }
  .kt-cap-verdict.confirmed { color: #107c10; }
  .kt-cap-verdict.failed { color: #d13438; }
  .kt-cap-verdict.not-probed { color: #8a8886; }
  .kt-cap-label { font-weight: 600; }
  .kt-cap-req { color: #605e5c; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
  .kt-cap-notes { color: #605e5c; font-size: 12px; grid-column: 2; }
  .kt-notused { margin: 10px 0 0; color: #605e5c; font-size: 12.5px; }
  .kt-notused b { color: #323130; }
  .kt-lab-note { margin: 10px 0 0; color: #605e5c; font-size: 12.5px; line-height: 1.5; border-top: 1px solid #f3f2f1; padding-top: 8px; }
`;

//#endregion

//#region header

function buildHeader(ctx: IViewModelContext): IReportHeader {
  return {
    generatedAt: new Date().toISOString(),
    kitVersion: __KIT_VERSION__,
    host: ctx.isLegacy ? "V8 (legacy CRM 8.x)" : "modern (UCI)",
    isLegacy: ctx.isLegacy,
    orgVersion: ctx.orgVersion || "(unknown)",
    clientUrl: ctx.clientUrl || "(unknown)",
    userId: ctx.user.id || "(unknown)",
    userName: ctx.user.name || "(unknown)",
    userAgent: navigator.userAgent,
  };
}

function renderHeaderCard(header: IReportHeader): HTMLElement {
  const card = el("div", { class: "kt-header" });
  const grid = el("dl", { class: "kt-grid" });
  const rows: Array<[string, string]> = [
    ["Generated", header.generatedAt],
    ["Kit version", header.kitVersion],
    ["Host", header.host],
    ["Org version", header.orgVersion],
    ["Client URL", header.clientUrl],
    ["User", `${header.userName} (${header.userId})`],
    ["Browser", header.userAgent],
  ];
  for (const [label, value] of rows) {
    grid.append(el("dt", {}, label), el("dd", {}, value));
  }
  card.append(grid);
  return card;
}

//#endregion

//#region results rendering

/** The literal operation transcript for one result (monospace block). */
function renderOps(result: ITestResult): HTMLElement | undefined {
  if (result.operations.length === 0) {
    return undefined;
  }
  const box = el("div", { class: "kt-ops" });
  box.append(el("div", { class: "kt-ops-label" }, "operations:"));
  for (const op of result.operations) {
    box.append(el("div", { class: "kt-op-line" }, op.label));
    if (op.body) {
      box.append(el("div", { class: "kt-op-body" }, op.body));
    }
  }
  return box;
}

function renderResult(result: ITestResult): HTMLElement {
  const box = el("div", { class: `kt-result ${result.status}` });
  const head = el("div", { class: "kt-r-head" });
  head.append(
    el("span", { class: `kt-tag ${result.status}` }, result.status.toUpperCase()),
    el("span", { class: "kt-title" }, `${result.id}  ${result.title}`),
    el("span", { class: "kt-ms" }, `${Math.round(result.durationMs)} ms`)
  );
  box.append(head, el("div", { class: "kt-detail" }, result.detail));
  const ops = renderOps(result);
  if (ops) {
    box.append(ops);
  }
  if (result.error) {
    const lines = [`! ${result.error.message}`];
    if (result.error.firstStackLine) {
      lines.push(`  ${result.error.firstStackLine}`);
    }
    box.append(el("div", { class: "kt-error" }, lines.join("\n")));
  }
  return box;
}

//#endregion

//#region summary strip + capability panel

function renderSummaryStrip(
  strip: HTMLElement,
  results: readonly ITestResult[],
  servedVersions?: readonly string[],
  pinnedVersion?: string
): void {
  const s = summarize(results);
  const c = summarizeCapabilities(results);
  const children: HTMLElement[] = [];
  if (pinnedVersion) {
    children.push(el("div", { class: "kt-strip-pin" }, pinBannerLine(pinnedVersion)));
  }
  children.push(
    el("div", {}, `Summary: ${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped (${s.total} total)`),
    el("div", { class: "kt-strip-cap" }, capabilityVerdictText(c, pinnedVersion))
  );
  const labLine = labSummaryLine(results, servedVersions);
  if (labLine) {
    children.push(el("div", { class: "kt-strip-lab" }, labLine));
  }
  strip.replaceChildren(...children);
}

function renderCapabilityRow(row: ICapabilityRow): HTMLElement {
  const wrap = el("div", { class: "kt-cap-row" });
  wrap.append(
    el("span", { class: `kt-cap-verdict ${row.verdict}` }, row.verdict.replace("-", " ").toUpperCase()),
    (() => {
      const cell = el("div");
      cell.append(
        el("span", { class: "kt-cap-req" }, `[${row.capability.requirement}] `),
        el("span", { class: "kt-cap-label" }, row.capability.label)
      );
      return cell;
    })(),
    el("div", { class: "kt-cap-notes" }, row.capability.notes)
  );
  return wrap;
}

function renderCapabilityPanel(panel: HTMLElement, results: readonly ITestResult[]): void {
  const { rows } = summarizeCapabilities(results);
  panel.replaceChildren(el("h2", {}, "Platform capabilities the kit stands on"));
  for (const row of rows) {
    panel.append(renderCapabilityRow(row));
  }
  const notUsed = el("p", { class: "kt-notused" });
  notUsed.append(
    el("b", {}, "The kit deliberately does NOT use: "),
    document.createTextNode(deliberatelyNotUsed.join(", ") + ".")
  );
  panel.append(notUsed);
  // The API version lab's purpose and its honest boundary (contract-level, same
  // engine; the real 8.2 run remains the definitive v8 evidence).
  panel.append(el("p", { class: "kt-lab-note" }, LAB_BOUNDARY_NOTE));
}

//#endregion

//#region clipboard

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the execCommand path
  }
  try {
    const textarea = el("textarea") as HTMLTextAreaElement;
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

//#endregion

//#region app render (Xrm found)

function renderApp(root: HTMLElement, ctx: IViewModelContext): void {
  const header = buildHeader(ctx);
  const allResults: ITestResult[] = [];

  // Pin state: undefined = host default; a version string = the data channel is
  // pinned to /api/data/vX.Y/ (the API version lab). `activeCtx` is the live ctx
  // by default, the version-pinned wrapper while pinned; `activeScratch` is the
  // current run's bag.
  let pinnedVersion: string | undefined;
  let activeCtx: IViewModelContext = ctx;
  let activeScratch: Scratch = {};
  // The served-version list captured from the initial (unpinned) sweep. The pin
  // selector offers exactly these, and a pinned run keeps showing them, since
  // the sweep is skipped under a pin and cannot re-report them.
  let capturedServed: string[] | undefined;
  let running = false;

  const servedVersions = (): readonly string[] | undefined => {
    const live = activeScratch[LAB_SERVED_KEY];
    return Array.isArray(live) ? (live as string[]) : capturedServed;
  };

  root.replaceChildren();
  root.append(
    el("h1", {}, "D365 kit context adapter tester"),
    el(
      "p",
      { class: "kt-sub" },
      "Exercises the kit's context adapter surface live against this org. Each test shows the literal operations it ran."
    ),
    renderHeaderCard(header)
  );

  // Pin banner, hidden until a version is pinned, directly under the header so
  // the pin is unmissable.
  const pinBanner = el("div", { class: "kt-pin-banner" });
  pinBanner.style.display = "none";
  root.append(pinBanner);

  const actions = el("div", { class: "kt-actions" });
  const runWriteBtn = el("button", { class: "kt-btn" }, "Run write tests (creates and deletes records)") as HTMLButtonElement;
  const copyBtn = el("button", { class: "kt-btn kt-btn-primary" }, "Copy results") as HTMLButtonElement;
  const copied = el("span", { class: "kt-copied" });
  actions.append(runWriteBtn, copyBtn, copied);
  root.append(actions);

  // The API version pin selector, populated after the first same-origin sweep.
  const picker = el("div", { class: "kt-lab-picker" });
  picker.style.display = "none";
  root.append(picker);

  // Summary strip and capability panel sit above the detailed results; both
  // refresh as each result lands.
  const strip = el("div", { class: "kt-strip" });
  const capsPanel = el("div", { class: "kt-caps" });
  root.append(strip, capsPanel);

  // One container per section, created lazily and shown only once it has a result.
  const sections = new Map<TestSection, HTMLElement>();
  const listRoot = el("div", { class: "kt-list" });
  root.append(listRoot);

  const sectionList = (section: TestSection): HTMLElement => {
    let list = sections.get(section);
    if (!list) {
      // Keep sections in the canonical order regardless of arrival order.
      const wrap = el("div");
      wrap.append(el("div", { class: "kt-section" }, section));
      list = el("div");
      wrap.append(list);
      sections.set(section, list);
      insertSectionInOrder(listRoot, wrap, section, sections);
    }
    return list;
  };

  const refresh = (): void => {
    renderSummaryStrip(strip, allResults, servedVersions(), pinnedVersion);
    renderCapabilityPanel(capsPanel, allResults);
    pinBanner.textContent = pinnedVersion ? pinBannerLine(pinnedVersion) : "";
    pinBanner.style.display = pinnedVersion ? "" : "none";
  };

  const append = (result: ITestResult): void => {
    allResults.push(result);
    sectionList(result.section).append(renderResult(result));
    refresh();
  };

  const setBusy = (busy: boolean): void => {
    running = busy;
    runWriteBtn.disabled = busy;
    for (const btn of picker.querySelectorAll("button")) {
      (btn as HTMLButtonElement).disabled = busy;
    }
  };

  // The version picker: "Host default" plus one button per served version. The
  // active selection is highlighted; selecting one re-runs tier 1 pinned.
  const renderPicker = (): void => {
    if (!capturedServed || capturedServed.length === 0) {
      picker.style.display = "none";
      return;
    }
    picker.replaceChildren(
      el(
        "div",
        { class: "kt-picker-label" },
        "Run the battery against an API version (data channel only; host surfaces stay live):"
      )
    );
    const btns = el("div", { class: "kt-picker-btns" });
    const makeBtn = (label: string, version?: string): HTMLButtonElement => {
      const active = version === pinnedVersion;
      const btn = el("button", { class: `kt-btn${active ? " kt-btn-active" : ""}` }, label) as HTMLButtonElement;
      btn.disabled = running;
      btn.addEventListener("click", () => void runTier1(version));
      return btn;
    };
    btns.append(makeBtn("Host default", undefined));
    for (const version of capturedServed) {
      btns.append(makeBtn(`v${version}`, version));
    }
    picker.append(btns);
    picker.style.display = "";
  };

  // Runs (or re-runs) tier 1. A pinned run REPLACES the on-screen results with
  // the pinned context; re-running "Host default" clears the pin. The initial
  // (unpinned) run captures the served list for the picker.
  const runTier1 = async (pinned?: string): Promise<void> => {
    if (running) {
      return;
    }
    setBusy(true);
    pinnedVersion = pinned;
    activeCtx = pinned ? createPinnedContext(ctx, pinned) : ctx;
    activeScratch = {};
    allResults.length = 0;
    sections.clear();
    listRoot.replaceChildren();
    runWriteBtn.textContent = "Run write tests (creates and deletes records)";
    renderPicker();
    refresh();
    await runTests(testCases, activeCtx, {
      tier: 1,
      scratch: activeScratch,
      pinnedVersion: pinned,
      onResult: append,
    });
    if (!pinned) {
      const served = activeScratch[LAB_SERVED_KEY];
      capturedServed = Array.isArray(served) ? (served as string[]) : undefined;
    }
    setBusy(false);
    renderPicker();
    refresh();
  };

  copyBtn.addEventListener("click", async () => {
    copied.textContent = "";
    const ok = await copyText(
      formatReport(buildHeaderNow(header), allResults, servedVersions(), pinnedVersion)
    );
    copied.textContent = ok ? "Copied." : "Copy failed, select the report text manually.";
  });

  runWriteBtn.addEventListener("click", async () => {
    if (running) {
      return;
    }
    setBusy(true);
    runWriteBtn.textContent = "Running write tests...";
    // Tier 2 honors the active pin: it rides the pinned context and skips the
    // non-pinnable cases the same way tier 1 does.
    await runTests(testCases, activeCtx, {
      tier: 2,
      scratch: activeScratch,
      pinnedVersion,
      onResult: append,
    });
    runWriteBtn.textContent = "Write tests complete";
    setBusy(false);
  });

  refresh();
  // Tier 1 auto-runs on load, unpinned; its sweep captures the served versions.
  void runTier1(undefined);
}

/** Inserts a section wrapper so sections render in SECTION_ORDER, not arrival order. */
function insertSectionInOrder(
  listRoot: HTMLElement,
  wrap: HTMLElement,
  section: TestSection,
  sections: Map<TestSection, HTMLElement>
): void {
  const laterSection = SECTION_ORDER.slice(SECTION_ORDER.indexOf(section) + 1).find((s) =>
    sections.has(s)
  );
  const before = laterSection ? sections.get(laterSection)?.parentElement ?? null : null;
  listRoot.insertBefore(wrap, before);
}

/** The report reuses the on-screen header but stamps a fresh copy time. */
function buildHeaderNow(header: IReportHeader): IReportHeader {
  return { ...header, generatedAt: new Date().toISOString() };
}

//#endregion

//#region boot (poll for Xrm, or show instructions)

function renderInstructions(root: HTMLElement): void {
  root.replaceChildren();
  const note = el("div", { class: "kt-note" });
  const url = `<org>/main.aspx?pagetype=webresource&webresourceName=${__ARTIFACT_NAME__}`;
  note.append(
    document.createTextNode("Dynamics 365 (Xrm) was not found in this window or any parent frame.\n\n"),
    document.createTextNode("This page must run inside the app shell. Open it through:\n\n")
  );
  note.append(el("span", { class: "kt-mono" }, url));
  note.append(
    document.createTextNode(
      "\n\nReplace <org> with your org URL. This launch form works on both CRM 8.2 and modern (9.x) hosts. " +
        "It takes no query parameters of its own."
    )
  );
  root.append(el("h1", {}, "D365 kit context adapter tester"), note);
}

function waitForXrm(
  win: Window,
  timeoutMs: number,
  onTick: (secondsLeft: number) => void
): Promise<unknown> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const poll = (): void => {
      const xrm = findXrm(win);
      if (xrm) {
        resolve(xrm);
        return;
      }
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        resolve(undefined);
        return;
      }
      onTick(Math.ceil(remaining / 1000));
      setTimeout(poll, 250);
    };
    poll();
  });
}

export async function start(win: Window = window): Promise<void> {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const root = document.getElementById("app") ?? document.body;
  root.classList.add("kt-body");
  const waiting = el("p", { class: "kt-sub" }, "Looking for Dynamics 365...");
  root.replaceChildren(el("h1", {}, "D365 kit context adapter tester"), waiting);

  const xrm = await waitForXrm(win, 10_000, (secondsLeft) => {
    waiting.textContent = `Looking for Dynamics 365... (${secondsLeft}s)`;
  });

  if (!xrm) {
    renderInstructions(root);
    return;
  }

  try {
    const ctx = createContextFromXrm(xrm);
    renderApp(root, ctx);
  } catch (error) {
    root.replaceChildren();
    root.append(
      el("h1", {}, "Could not build the context"),
      el("div", { class: "kt-error" }, error instanceof Error ? error.message : String(error))
    );
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start());
  } else {
    void start();
  }
}

//#endregion
