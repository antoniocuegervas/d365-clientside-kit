/**
 * Bundle smoke tests: load the PRODUCTION clientui bundle into jsdom
 * with modern and legacy Xrm mocks and prove the shell boots end to end.
 * Run `npm run build` first, `npm run smoke` assumes dist/ exists.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createModernXrmMock, createV8XrmMock } from "../mocks/XrmMock";

const BUNDLE = path.resolve(
  __dirname,
  "../../dist/clientui",
  `${process.env.PUBLISHER_PREFIX ?? "new_"}clientui.js`
);

type ClientUIGlobal = { bootstrap: (options: object) => Promise<unknown> };

function loadBundle(): ClientUIGlobal {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluating the built artifact, not a module under test
  require(BUNDLE);
  return (window as unknown as { ClientUI: ClientUIGlobal }).ClientUI;
}

async function waitForContent(
  container: HTMLElement,
  predicate: (html: string) => boolean,
  timeoutMs = 5000
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate(container.innerHTML)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for content. Last HTML:\n${container.innerHTML.slice(0, 800)}`);
}

describe("clientui bundle smoke", () => {
  let container: HTMLElement;

  beforeAll(() => {
    if (!fs.existsSync(BUNDLE)) {
      throw new Error(`Bundle not found at ${BUNDLE}, run 'npm run build' before 'npm run smoke'.`);
    }
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>';
    container = document.getElementById("container")!;
  });

  afterEach(() => {
    delete (window as { Xrm?: unknown }).Xrm;
  });

  it("boots the samples hub against a MODERN host", async () => {
    (window as { Xrm?: unknown }).Xrm = createModernXrmMock().xrm;
    const clientUI = loadBundle();
    await clientUI.bootstrap({ search: "?app=samples", xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Sample Apps"));
    expect(container.innerHTML).toContain("Pick a sample to run");
  });

  it("boots the samples hub against a LEGACY CRM 8.x host (V8 adapter)", async () => {
    (window as { Xrm?: unknown }).Xrm = createV8XrmMock().xrm;
    const clientUI = loadBundle();
    await clientUI.bootstrap({ search: "?app=samples", xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Sample Apps"));
  });

  it("accepts app selection through the CRM data payload", async () => {
    (window as { Xrm?: unknown }).Xrm = createModernXrmMock().xrm;
    const clientUI = loadBundle();
    const data = encodeURIComponent(JSON.stringify({ app: "samples" }));
    await clientUI.bootstrap({ search: `?data=${data}`, xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Sample Apps"));
  });

  it("shows a visible error listing registered apps for an unknown app key", async () => {
    (window as { Xrm?: unknown }).Xrm = createModernXrmMock().xrm;
    const clientUI = loadBundle();
    await clientUI.bootstrap({ search: "?app=nope", xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Unknown app"));
    expect(container.innerHTML).toContain("template");
    expect(container.innerHTML).toContain("samples");
  });

  it("fails visibly when Xrm never appears (timeout path)", async () => {
    const clientUI = loadBundle();
    await clientUI.bootstrap({ search: "?app=samples", xrmTimeoutMs: 300 });
    await waitForContent(container, (html) => html.includes("could not start"));
    expect(container.innerHTML).toContain("Xrm was not found");
  });
});
