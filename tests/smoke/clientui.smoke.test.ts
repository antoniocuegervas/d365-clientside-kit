/**
 * Bundle smoke tests: load the PRODUCTION clientui bundle into jsdom
 * with modern and legacy Xrm mocks and prove the shell boots end to end.
 * Run `npm run build` first, `npm run smoke` assumes dist/ exists.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createModernXrmMock, createV8XrmMock } from "../mocks/XrmMock";
import { FakeXhrServer } from "../mocks/FakeXhr";

const prefix = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../kit.config.json"), "utf8")) as {
    publisherPrefix: string;
  }
).publisherPrefix;

const BUNDLE = path.resolve(__dirname, "../../dist/clientui", `${prefix}clientui.js`);

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

  it("walks the LEGACY data path: FetchXML through cds-client renders merged activity rows", async () => {
    // The v8 host has no Xrm.WebApi, so webAPI.fetch rides cds-client's raw
    // XMLHttpRequest to the OData endpoint. Serving those requests from a fake
    // XHR proves the whole legacy chain in the production bundle: adapter
    // routing, URL building, the collection parse (including formatted-value
    // annotations), and the rows reaching the DOM.
    const server = new FakeXhrServer();
    server.install();
    try {
      const annotate = "@OData.Community.Display.V1.FormattedValue";
      const activityRow = (id: string, subject: string) => ({
        activityid: id,
        subject,
        scheduledend: "2026-07-03T10:00:00Z",
        [`scheduledend${annotate}`]: "7/3/2026 10:00 AM",
        _regardingobjectid_value: "b1000000-0000-0000-0000-000000000001",
        [`_regardingobjectid_value${annotate}`]: "Contoso Ltd",
        statecode: 0,
        [`statecode${annotate}`]: "Open",
      });
      const collection = (rows: object[]) => ({
        status: 200,
        responseText: JSON.stringify({ value: rows }),
      });
      server.respondWith((request) =>
        request.url.includes("/tasks?fetchXml=")
          ? collection([activityRow("aa000000-0000-0000-0000-000000000001", "Prepare the proposal")])
          : undefined
      );
      server.respondWith((request) =>
        request.url.includes("/phonecalls?fetchXml=")
          ? collection([activityRow("aa000000-0000-0000-0000-000000000002", "Call the client back")])
          : undefined
      );
      server.respondWith((request) =>
        request.url.includes("/appointments?fetchXml=")
          ? collection([activityRow("aa000000-0000-0000-0000-000000000003", "Quarterly review")])
          : undefined
      );

      (window as { Xrm?: unknown }).Xrm = createV8XrmMock().xrm;
      const clientUI = loadBundle();
      await clientUI.bootstrap({ search: "?app=sample-activities-grid", xrmTimeoutMs: 2000 });

      // All three sources merged into one rendered list.
      await waitForContent(container, (html) => html.includes("Prepare the proposal"));
      expect(container.innerHTML).toContain("Call the client back");
      expect(container.innerHTML).toContain("Quarterly review");
      // Formatted-value annotations survived the cds parse into the cells.
      expect(container.innerHTML).toContain("Contoso Ltd");
      expect(container.innerHTML).toContain("Open");
      // The queries really went out over XHR against the legacy endpoint.
      const fetches = server.requests.filter((request) => request.url.includes("fetchXml="));
      expect(fetches).toHaveLength(3);
      for (const request of fetches) {
        expect(request.url).toContain("/api/data/v8.2/");
      }
    } finally {
      server.uninstall();
    }
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
