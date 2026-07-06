import * as React from "react";
import "../../../clientui/apps/samples-hub/app";
import { bootstrap } from "../../../clientui/bootstrap";
import { registerApp } from "../../../clientui/registry";
import { RecordReady } from "../../../shared/components/RecordReady";
import type { IKitInjectedHost } from "../../../shared/context/createWebResourceContext";
import type { IXrmPageLike } from "../../../shared/context/hostSurface";
import { createModernXrmMock } from "../../mocks/XrmMock";

/**
 * Boot-order tests for the injected-host contract. The clienthooks
 * KitShell.connect hook pushes the form's Xrm and form context into the
 * shell window asynchronously (getContentWindow resolves on its own
 * schedule), so the shell can find a walked ancestor Xrm BEFORE the
 * injection lands. These tests pin all three orders: injection before the
 * first poll, injection after context creation (the race a downstream
 * form-embedded consumer of the injected-host contract reported), and
 * never injected (sitemap / quick-test hosting).
 */

const RECORD_ID = "aa000000-0000-0000-0000-00000000000a";

// A probe app a form-embedded consumer would actually write: RecordReady
// polls form access until the hosting record is known.
registerApp("probe-record", {
  title: "Record probe",
  render: () => (
    <RecordReady pollMs={25}>
      {(recordId, entityName) => (
        <div>
          bound record {recordId} on {entityName}
        </div>
      )}
    </RecordReady>
  ),
});

// A probe that reports the boot-time form binding, for the hosts that never
// receive an injection.
registerApp("probe-presence", {
  title: "Form presence probe",
  render: (host) => <div>{host.context.formAccess ? "form bound" : "no form bound"}</div>,
});

/** A minimal shell window: real jsdom document, fake frame ancestry. */
function makeShellWindow(parentWindow?: object): Window & IKitInjectedHost {
  const win = {
    document,
    addEventListener: () => undefined,
    Xrm: undefined,
  } as unknown as Window & IKitInjectedHost;
  (win as unknown as { parent: object }).parent = parentWindow ?? win;
  return win;
}

/** A top frame carrying the walked (ancestor) Xrm. */
function makeTopWindow(xrm: unknown): object {
  const top = { Xrm: xrm } as { Xrm: unknown; parent?: object };
  top.parent = top;
  return top;
}

/** What KitShell.connect does when getContentWindow resolves. */
function injectHost(win: Window & IKitInjectedHost, xrm: unknown, formPage: unknown): void {
  win.__kitInjectedXrm = xrm;
  win.__kitInjectedFormPage = formPage as IXrmPageLike;
}

function makeFormPage(): IXrmPageLike {
  const { xrm } = createModernXrmMock({
    formRecord: { id: RECORD_ID, entityName: "contact", attributes: { fullname: "Probe" } },
  });
  return (xrm as unknown as { Page: IXrmPageLike }).Page;
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
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for content. Last HTML:\n${container.innerHTML.slice(0, 800)}`);
}

describe("bootstrap and the injected-host boot order", () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>';
    container = document.getElementById("container")!;
  });

  it("binds form access from the injection when it lands BEFORE the first poll", async () => {
    const walked = createModernXrmMock().xrm; // ancestor Xrm without a form
    const win = makeShellWindow(makeTopWindow(walked));
    injectHost(win, createModernXrmMock().xrm, makeFormPage());

    await bootstrap({ window: win, search: "?app=probe-record", xrmTimeoutMs: 2000 });

    await waitForContent(container, (html) => html.includes(`bound record ${RECORD_ID}`));
    expect(container.innerHTML).toContain("on contact");
  });

  it("adopts the injected form page when the injection lands AFTER context creation (the boot race)", async () => {
    const walked = createModernXrmMock().xrm;
    const win = makeShellWindow(makeTopWindow(walked));

    // The first poll finds the walked Xrm; the boot completes with no form.
    await bootstrap({ window: win, search: "?app=probe-record", xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Waiting for the record"));

    // KitShell.connect's getContentWindow promise lands a moment later.
    injectHost(win, createModernXrmMock().xrm, makeFormPage());

    await waitForContent(container, (html) => html.includes(`bound record ${RECORD_ID}`));
    expect(container.innerHTML).toContain("on contact");
  });

  it("boots a never-injected shell over the walk with no form binding and no waiting", async () => {
    const walked = createModernXrmMock().xrm;
    const win = makeShellWindow(makeTopWindow(walked));

    await bootstrap({ window: win, search: "?app=probe-presence", xrmTimeoutMs: 2000 });

    // The boot itself completed unblocked; the app rendered from the walk.
    await waitForContent(container, (html) => html.includes("no form bound"));
  });

  it("the samples hub names the hosting record once a late injection lands", async () => {
    const walked = createModernXrmMock().xrm;
    const win = makeShellWindow(makeTopWindow(walked));

    await bootstrap({ window: win, search: "?app=samples", xrmTimeoutMs: 2000 });
    await waitForContent(container, (html) => html.includes("Sample Apps"));
    expect(container.innerHTML).not.toContain("Hosted beside");

    injectHost(win, createModernXrmMock().xrm, makeFormPage());

    await waitForContent(container, (html) =>
      html.includes(`Hosted beside contact record ${RECORD_ID}`)
    );
  });

  it("still binds a walked Xrm's own form page when nothing is ever injected", async () => {
    const formHost = createModernXrmMock({
      formRecord: { id: RECORD_ID, entityName: "account", attributes: {} },
    }).xrm;
    const win = makeShellWindow(makeTopWindow(formHost));

    await bootstrap({ window: win, search: "?app=probe-record", xrmTimeoutMs: 2000 });

    await waitForContent(container, (html) => html.includes(`bound record ${RECORD_ID}`));
    expect(container.innerHTML).toContain("on account");
  });
});
