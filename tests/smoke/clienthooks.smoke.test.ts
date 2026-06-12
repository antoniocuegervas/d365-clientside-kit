/**
 * clienthooks bundle smoke: load the PRODUCTION UMD bundle and
 * prove the CrmClientSide registry exposes the documented hooks and that
 * they drive a form context correctly on modern AND legacy hosts.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createModernXrmMock, createV8XrmMock } from "../mocks/XrmMock";

const BUNDLE = path.resolve(
  __dirname,
  "../../dist/clienthooks",
  `${process.env.PUBLISHER_PREFIX ?? "new_"}clienthooks.js`
);

interface ICrmClientSide {
  Account: {
    Form: { onLoad: (executionContext: unknown) => void };
    Ribbon: {
      openCompanySearch: (primaryControl: unknown) => void;
      isRecordSaved: (primaryControl: unknown) => boolean;
      webResourceName: string;
    };
  };
  LockedGrid: { onRecordSelect: (executionContext: unknown) => void };
}

function loadBundle(): ICrmClientSide {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluating the built artifact
  return require(BUNDLE) as ICrmClientSide;
}

/** Minimal recording form context covering what the example hooks touch. */
function makeFormContext(options: { id?: string; formType?: number } = {}) {
  const log: Array<{ api: string; args: unknown[] }> = [];
  const makeControl = (name: string) => ({
    setVisible: (visible: boolean) => log.push({ api: `setVisible:${name}`, args: [visible] }),
    setDisabled: (disabled: boolean) => log.push({ api: `setDisabled:${name}`, args: [disabled] }),
  });
  const attributeNames = [
    "creditonhold",
    "creditlimit",
    "accountnumber",
    "telephone1",
    "name",
    "revenue",
  ];
  const attributes = attributeNames.map((name) => ({
    getName: () => name,
    setRequiredLevel: (level: string) => log.push({ api: `setRequiredLevel:${name}`, args: [level] }),
    controls: { forEach: (cb: (c: unknown) => void) => cb(makeControl(name)) },
  }));
  const byName = new Map(attributes.map((a) => [a.getName(), a]));
  const formContext = {
    getAttribute: (name: string) => byName.get(name) ?? null,
    data: {
      entity: {
        getId: () => (options.id ? `{${options.id.toUpperCase()}}` : ""),
        getEntityName: () => "account",
        attributes: { forEach: (cb: (a: unknown) => void) => attributes.forEach(cb), get: () => null },
      },
    },
    ui: { getFormType: () => options.formType ?? 2 },
  };
  return { formContext, log };
}

describe("clienthooks bundle smoke", () => {
  beforeAll(() => {
    if (!fs.existsSync(BUNDLE)) {
      throw new Error(`Bundle not found at ${BUNDLE}, run 'npm run build' before 'npm run smoke'.`);
    }
  });

  afterEach(() => {
    delete (window as { Xrm?: unknown }).Xrm;
  });

  it("exposes the documented registry shape", () => {
    const crm = loadBundle();
    expect(typeof crm.Account.Form.onLoad).toBe("function");
    expect(typeof crm.Account.Ribbon.openCompanySearch).toBe("function");
    expect(typeof crm.Account.Ribbon.isRecordSaved).toBe("function");
    expect(typeof crm.LockedGrid.onRecordSelect).toBe("function");
  });

  it("Account.Form.onLoad manipulates fields per form type", () => {
    const crm = loadBundle();
    const { formContext, log } = makeFormContext({ formType: 1 }); // create
    crm.Account.Form.onLoad({ getFormContext: () => formContext });
    expect(log).toContainEqual({ api: "setVisible:creditonhold", args: [false] });
    expect(log).toContainEqual({ api: "setVisible:creditlimit", args: [false] });
    expect(log).toContainEqual({ api: "setDisabled:accountnumber", args: [true] });
    expect(log).toContainEqual({ api: "setRequiredLevel:telephone1", args: ["recommended"] });

    const update = makeFormContext({ formType: 2 });
    crm.Account.Form.onLoad({ getFormContext: () => update.formContext });
    expect(update.log).toContainEqual({ api: "setVisible:creditonhold", args: [true] });
  });

  it("LockedGrid.onRecordSelect disables every column on the selected row", () => {
    const crm = loadBundle();
    const { formContext, log } = makeFormContext();
    crm.LockedGrid.onRecordSelect({ getFormContext: () => formContext });
    const disabled = log.filter((entry) => entry.api.startsWith("setDisabled:"));
    expect(disabled.length).toBe(6); // every attribute on the row
    expect(disabled.every((entry) => entry.args[0] === true)).toBe(true);
  });

  it("Account.Ribbon opens the unified shell with app key + payload (modern host)", () => {
    const { xrm, calls } = createModernXrmMock();
    (window as { Xrm?: unknown }).Xrm = xrm;
    const crm = loadBundle();
    const { formContext } = makeFormContext({ id: "abc00000-0000-0000-0000-000000000001" });

    expect(crm.Account.Ribbon.isRecordSaved(formContext)).toBe(true);
    crm.Account.Ribbon.openCompanySearch(formContext);

    const nav = calls.find((c) => c.api === "Navigation.navigateTo");
    expect(nav).toBeDefined();
    const pageInput = nav!.args[0] as { webresourceName: string; data: string };
    expect(pageInput.webresourceName).toBe("new_clientui.html");
    expect(JSON.parse(pageInput.data)).toEqual({
      app: "sample-company-search",
      accountId: "{ABC00000-0000-0000-0000-000000000001}",
    });
  });

  it("Account.Ribbon works against a LEGACY host via openWebResource", () => {
    const { xrm, calls } = createV8XrmMock();
    (window as { Xrm?: unknown }).Xrm = xrm;
    const crm = loadBundle();
    const { formContext } = makeFormContext({ id: "abc00000-0000-0000-0000-000000000002" });
    crm.Account.Ribbon.openCompanySearch(formContext);
    const nav = calls.find((c) => c.api === "Utility.openWebResource");
    expect(nav).toBeDefined();
    expect(nav!.args[0]).toBe("new_clientui.html");
  });

  it("isRecordSaved is false on unsaved records", () => {
    const crm = loadBundle();
    const { formContext } = makeFormContext({ id: undefined });
    expect(crm.Account.Ribbon.isRecordSaved(formContext)).toBe(false);
  });
});
