import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { CdsClient } from "../../../shared/data/CdsClient";
import { CdsWebApi } from "../../../shared/context/WebResourceContextV8";
import { createPinnedContext } from "../../../tests/adapter-tester/pinnedContext";
import { createFakeViewModelContext } from "../../mocks/fakeViewModelContext";
import { FakeXhrServer } from "../../mocks/FakeXhr";
import { OpsCollector, runTests } from "../../../tests/adapter-tester/runner";
import { testCases } from "../../../tests/adapter-tester/tests";
import type { ITestCase } from "../../../tests/adapter-tester/types";

const CLIENT_URL = "https://fake.crm.dynamics.com";
const caseById = (id: string): ITestCase => testCases.find((c) => c.id === id)!;

describe("createPinnedContext", () => {
  describe("data channel reroute (pinned to a chosen version)", () => {
    let server: FakeXhrServer;

    beforeEach(() => {
      server = new FakeXhrServer();
      server.install();
    });
    afterEach(() => server.uninstall());

    it("routes webAPI reads through a cds-client at the pinned version", async () => {
      server.respondAlways({ status: 200, responseText: '{"value":[]}' });
      const live = createFakeViewModelContext().context;
      const pinned = createPinnedContext(live, "8.1");
      await pinned.webAPI.retrieveMultipleRecords("account", "?$select=name");
      expect(server.lastRequest.url).toBe(`${CLIENT_URL}/api/data/v8.1/accounts?$select=name`);
    });

    it("routes metadata.getView (a data read) through the pinned client", async () => {
      server.respondAlways({
        status: 200,
        responseText: JSON.stringify({
          value: [{ savedqueryid: "v1", name: "Default", fetchxml: "<fetch/>", layoutxml: "" }],
        }),
      });
      const pinned = createPinnedContext(createFakeViewModelContext().context, "8.1");
      const view = await pinned.metadata.getView("account");
      expect(view.name).toBe("Default");
      expect(server.lastRequest.url).toContain("/api/data/v8.1/savedqueries");
    });

    it("routes utils.getEntityMetadata through the synthesis provider on the pinned client", async () => {
      // The provider makes several EntityDefinitions calls; whatever it does, the
      // first request must land on the pinned version path. Body is a benign stub;
      // a synthesis error is fine, the request URL is what this asserts.
      server.respondAlways({ status: 200, responseText: '{"value":[],"LogicalName":"account"}' });
      const pinned = createPinnedContext(createFakeViewModelContext().context, "8.1");
      await pinned.utils.getEntityMetadata("account", ["name"]).catch(() => undefined);
      expect(server.requests.some((r) => r.url.includes("/api/data/v8.1/EntityDefinitions"))).toBe(
        true
      );
    });
  });

  describe("host surface preserved (delegates to the live ctx)", () => {
    it("keeps the live host members by identity, only the data members are new", () => {
      const live = createFakeViewModelContext().context;
      const pinned = createPinnedContext(live, "9.1");
      // Host surface: same objects as the live ctx.
      expect(pinned.globalContext).toBe(live.globalContext);
      expect(pinned.navigation).toBe(live.navigation);
      expect(pinned.client).toBe(live.client);
      expect(pinned.device).toBe(live.device);
      expect(pinned.user).toBe(live.user);
      expect(pinned.clientUrl).toBe(live.clientUrl);
      // Data surface: rerouted, so NOT the live objects.
      expect(pinned.webAPI).not.toBe(live.webAPI);
      expect(pinned.webAPI).toBeInstanceOf(CdsWebApi);
      expect(pinned.metadata).not.toBe(live.metadata);
      expect(pinned.utils.getEntityMetadata).not.toBe(live.utils.getEntityMetadata);
    });

    it("preserves prototype members of a class-instance ctx (getFormatting survives)", async () => {
      // A minimal class instance stands in for the real WebResourceContext: a
      // prototype method must survive the wrap, which an object spread would drop.
      class HostCtx {
        clientUrl = CLIENT_URL;
        globalContext = { tag: "live" };
        utils = { getEntityMetadata: async () => ({}) };
        getFormatting(): Promise<{ decimalSymbol: string }> {
          return Promise.resolve({ decimalSymbol: "." });
        }
      }
      const live = new HostCtx() as unknown as IViewModelContext;
      const pinned = createPinnedContext(live, "8.2");
      expect(typeof pinned.getFormatting).toBe("function");
      expect(await pinned.getFormatting()).toEqual({ decimalSymbol: "." });
    });
  });
});

describe("pinned-mode skip semantics (runner honors channel tags)", () => {
  const modernFake = (): IViewModelContext => createFakeViewModelContext().context;

  it("skips host-surface tests with a 'not version-pinnable' note", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1, pinnedVersion: "8.2" });
    const selection = results.find((r) => r.id === "t1-adapter-selection")!;
    expect(selection.status).toBe("skip");
    expect(selection.detail).toContain("host surface, not version-pinnable");
    // Global context normally PASSES on the fake; under a pin it must skip instead
    // of silently running against the host.
    const global = results.find((r) => r.id === "t1-global-context")!;
    expect(global.status).toBe("skip");
    expect(global.detail).toContain("Pinned to v8.2");
  });

  it("skips version-explicit tests with an 'already version-explicit' note", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1, pinnedVersion: "8.2" });
    for (const id of ["t1-usersettings", "t1-metadata-cast", "t1-version-path", "t1-lab-version-sweep"]) {
      const r = results.find((x) => x.id === id)!;
      expect(r.status).toBe("skip");
      expect(r.detail).toContain("already version-explicit");
    }
  });

  it("still runs kit-data tests against the (pinned) context", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1, pinnedVersion: "8.2" });
    const account = results.find((r) => r.id === "t1-webapi-account")!;
    // It ran (not a pinned-skip): the fake returns no rows, so it passes on that path.
    expect(account.detail).not.toContain("Pinned to v8.2");
    expect(account.status).toBe("pass");
  });

  it("runs every case normally when no version is pinned", async () => {
    const results = await runTests(testCases, modernFake(), { tier: 1 });
    expect(results.every((r) => !r.detail.includes("not version-pinnable"))).toBe(true);
  });
});

describe("re-purposed link-entity alias probe (kit channel asserts the dotted shape)", () => {
  const aliasCase = caseById("t1-link-alias");

  it("FAILS when the consumer receives an un-normalized encoded key (a leak)", async () => {
    // A fake webAPI returns the encoded key verbatim (no client normalization),
    // standing in for a regressed fix; the kit-channel assertion must catch it.
    const ctx = createFakeViewModelContext({
      queryResults: { account: [{ entities: [{ name: "A", pc_x002e_contactid: "c1" }] }] },
    }).context;
    const outcome = await aliasCase.run(ctx, {}, new OpsCollector());
    expect(outcome.status).toBe("fail");
    expect(outcome.detail).toContain("encoded alias key");
  });

  it("PASSES on a modern dotted response", async () => {
    const ctx = createFakeViewModelContext({
      queryResults: { account: [{ entities: [{ name: "A", "pc.contactid": "c1" }] }] },
    }).context;
    const outcome = await aliasCase.run(ctx, {}, new OpsCollector());
    expect(outcome.status).toBe("pass");
    expect(outcome.detail).toContain("modern dotted shape");
  });

  describe("through the REAL CdsClient parse (parts A and B compose)", () => {
    let server: FakeXhrServer;
    beforeEach(() => {
      server = new FakeXhrServer();
      server.install();
    });
    afterEach(() => server.uninstall());

    // The alias case over a real CdsWebApi + CdsClient, so the fetch response is
    // parsed by parseCollection (the Part A fix) before the assertion sees it.
    const realClientCtx = (): IViewModelContext =>
      Object.assign(createFakeViewModelContext().context, {
        webAPI: new CdsWebApi(new CdsClient({ clientUrl: CLIENT_URL })),
      });

    it("normalizes an ENCODED wire response to dotted, so the kit channel PASSES", async () => {
      server.respondAlways({
        status: 200,
        responseText: '{"value":[{"name":"A","pc_x002e_contactid":"c1"}]}',
      });
      const outcome = await aliasCase.run(realClientCtx(), {}, new OpsCollector());
      expect(outcome.status).toBe("pass");
      expect(outcome.detail).toContain("modern dotted shape");
    });

    it("passes a DOTTED wire response through unchanged (also PASSES)", async () => {
      server.respondAlways({
        status: 200,
        responseText: '{"value":[{"name":"A","pc.contactid":"c1"}]}',
      });
      const outcome = await aliasCase.run(realClientCtx(), {}, new OpsCollector());
      expect(outcome.status).toBe("pass");
    });
  });
});
