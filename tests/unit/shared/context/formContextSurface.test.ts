import {
  buildFormContext,
  hasForm,
  type IHostFormContext,
} from "../../../../shared/context/formContextSurface";

interface ICall {
  api: string;
  args: unknown[];
}

/**
 * A reasonably complete in-memory host form (modern formContext / Xrm.Page
 * shape) used to assert the builder wraps and forwards faithfully. A separate
 * "lean" host omits members so the not-supported rejection can be checked.
 */
function makeHostForm() {
  const calls: ICall[] = [];
  const record = (api: string, ...args: unknown[]) => calls.push({ api, args });

  const makeCollection = (items: Array<{ name: string; item: unknown }>) => ({
    get: (nameOrIndex: string | number) =>
      typeof nameOrIndex === "number"
        ? (items[nameOrIndex]?.item ?? null)
        : (items.find((entry) => entry.name === nameOrIndex)?.item ?? null),
    getAll: () => items.map((entry) => entry.item),
    forEach: (cb: (item: unknown, index: number) => void) =>
      items.forEach((entry, index) => cb(entry.item, index)),
    getLength: () => items.length,
  });

  const lookupControl = {
    getName: () => "primarycontactid",
    getControlType: () => "lookup",
    getVisible: () => true,
    setVisible: (visible: boolean) => record("control.setVisible", visible),
    setDisabled: (disabled: boolean) => record("control.setDisabled", disabled),
    setFocus: () => record("control.setFocus"),
    addCustomFilter: (filterXml: string, entityLogicalName?: string) =>
      record("control.addCustomFilter", filterXml, entityLogicalName),
    addPreSearch: (handler: unknown) => record("control.addPreSearch", handler),
  };

  const optionControl = {
    getName: () => "statuscode",
    getControlType: () => "optionset",
    addOption: (option: unknown, index?: number) => record("control.addOption", option, index),
    clearOptions: () => record("control.clearOptions"),
  };

  const nameAttribute = {
    getName: () => "name",
    getValue: () => "Contoso",
    setValue: (value: unknown) => record("attribute.setValue:name", value),
    getAttributeType: () => "string",
    getFormat: () => null,
    getIsDirty: () => true,
    getRequiredLevel: () => "required",
    setRequiredLevel: (level: string) => record("attribute.setRequiredLevel", level),
    getSubmitMode: () => "dirty",
    setSubmitMode: (mode: string) => record("attribute.setSubmitMode", mode),
    addOnChange: (handler: unknown) => record("attribute.addOnChange", handler),
    fireOnChange: () => record("attribute.fireOnChange"),
    getMaxLength: () => 160,
    controls: makeCollection([{ name: "name", item: { getName: () => "name", getControlType: () => "standard" } }]),
  };

  const statusAttribute = {
    getName: () => "statuscode",
    getValue: () => 1,
    getAttributeType: () => "optionset",
    getOptions: () => [
      { value: 1, label: "Active" },
      { value: 2, label: "Inactive" },
    ],
    controls: makeCollection([{ name: "statuscode", item: optionControl }]),
  };

  const section = {
    getName: () => "general",
    getVisible: () => true,
    setVisible: (visible: boolean) => record("section.setVisible", visible),
    getLabel: () => "General",
    setLabel: (label: string) => record("section.setLabel", label),
    controls: makeCollection([{ name: "name", item: { getName: () => "name" } }]),
  };

  const tab = {
    getName: () => "tab_general",
    getVisible: () => true,
    setVisible: (visible: boolean) => record("tab.setVisible", visible),
    getDisplayState: () => "expanded",
    setDisplayState: (state: string) => record("tab.setDisplayState", state),
    setFocus: () => record("tab.setFocus"),
    sections: makeCollection([{ name: "general", item: section }]),
  };

  const process = {
    getActiveProcess: () => ({
      getId: () => "{11100000-0000-0000-0000-000000000111}",
      getName: () => "Lead to Opportunity",
      getStages: () =>
        makeCollection([
          {
            name: "qualify",
            item: {
              getId: () => "stage-1",
              getName: () => "Qualify",
              getStatus: () => "active",
              getSteps: () =>
                makeCollection([
                  { name: "topic", item: { getName: () => "Topic", getAttribute: () => "subject", getRequired: () => true } },
                ]),
            },
          },
        ]),
    }),
    getActiveStage: () => ({
      getId: () => "stage-1",
      getName: () => "Qualify",
      getStatus: () => "active",
      getSteps: () => makeCollection([]),
    }),
    moveNext: (cb: (status: string) => void) => {
      record("process.moveNext");
      cb("success");
    },
    setActiveProcess: (processId: string, cb: () => void) => {
      record("process.setActiveProcess", processId);
      cb();
    },
    getEnabledProcesses: (cb: (processes: Record<string, string>) => void) => {
      record("process.getEnabledProcesses");
      cb({ "proc-a": "Process A", "proc-b": "Process B" });
    },
  };

  const form = {
    getControl: (name: string) =>
      name === "primarycontactid" ? lookupControl : null,
    data: {
      entity: {
        getId: () => "{DDD00000-0000-0000-0000-000000000004}",
        getEntityName: () => "account",
        getEntityReference: () => ({
          id: "{DDD00000-0000-0000-0000-000000000004}",
          entityType: "account",
          name: "Contoso",
        }),
        getIsDirty: () => true,
        getDataXml: () => "<entity/>",
        save: (saveMode?: unknown) => {
          record("entity.save", saveMode);
          return Promise.resolve();
        },
        attributes: makeCollection([
          { name: "name", item: nameAttribute },
          { name: "statuscode", item: statusAttribute },
        ]),
        addOnSave: (handler: unknown) => record("entity.addOnSave", handler),
        addOnPostSave: (handler: unknown) => record("entity.addOnPostSave", handler),
      },
      getIsDirty: () => true,
      refresh: (save?: boolean) => {
        record("data.refresh", save);
        return Promise.resolve();
      },
      save: (saveOptions?: unknown) => {
        record("data.save", saveOptions);
        return Promise.resolve();
      },
      addOnLoad: (handler: unknown) => record("data.addOnLoad", handler),
      process,
    },
    ui: {
      setFormNotification: (message: string, level: string, uniqueId: string) => {
        record("ui.setFormNotification", message, level, uniqueId);
        return true;
      },
      clearFormNotification: (uniqueId: string) => {
        record("ui.clearFormNotification", uniqueId);
        return true;
      },
      getFormType: () => 2,
      refreshRibbon: () => record("ui.refreshRibbon"),
      tabs: makeCollection([{ name: "tab_general", item: tab }]),
      controls: makeCollection([{ name: "primarycontactid", item: lookupControl }]),
    },
  };

  return { form: form as unknown as IHostFormContext, calls };
}

describe("buildFormContext", () => {
  const HOST = "modern webresource";

  it("hasForm detects a record form behind the source", () => {
    const { form } = makeHostForm();
    expect(hasForm(form)).toBe(true);
    expect(hasForm({})).toBe(false);
    expect(hasForm(undefined)).toBe(false);
  });

  it("getAttribute resolves via the data.entity attributes shortcut and normalizes ids", () => {
    const { form } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    expect(fc.getAttribute("name")?.getValue()).toBe("Contoso");
    expect(fc.data.entity.getId()).toBe("ddd00000-0000-0000-0000-000000000004");
    expect(fc.data.entity.getEntityReference()).toEqual({
      id: "ddd00000-0000-0000-0000-000000000004",
      entityType: "account",
      name: "Contoso",
    });
    expect(fc.data.entity.getEntityName()).toBe("account");
  });

  it("wraps the attributes collection and forwards attribute mutations", () => {
    const { form, calls } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    const names = fc.data.entity.attributes.getAll().map((a) => a.getName());
    expect(names).toEqual(["name", "statuscode"]);
    expect(fc.data.entity.attributes.getLength()).toBe(2);

    const name = fc.getAttribute("name")!;
    expect(name.getAttributeType()).toBe("string");
    expect(name.getIsDirty()).toBe(true);
    expect(name.getRequiredLevel()).toBe("required");
    expect(name.getMaxLength()).toBe(160);
    name.setValue("Fabrikam");
    name.setRequiredLevel("none");
    name.fireOnChange();
    expect(calls).toContainEqual({ api: "attribute.setValue:name", args: ["Fabrikam"] });
    expect(calls).toContainEqual({ api: "attribute.setRequiredLevel", args: ["none"] });
    expect(calls).toContainEqual({ api: "attribute.fireOnChange", args: [] });

    // Optionset-only and number-only members resolve on the right attribute.
    expect(fc.getAttribute("statuscode")!.getOptions()).toEqual([
      { value: 1, label: "Active" },
      { value: 2, label: "Inactive" },
    ]);
  });

  it("wraps controls including the lookup and optionset specifics", () => {
    const { form, calls } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    const lookup = fc.getControl("primarycontactid")!;
    expect(lookup.getControlType()).toBe("lookup");
    lookup.setVisible(false);
    lookup.setFocus();
    lookup.addCustomFilter("<filter/>", "contact");
    expect(calls).toContainEqual({ api: "control.setVisible", args: [false] });
    expect(calls).toContainEqual({ api: "control.setFocus", args: [] });
    expect(calls).toContainEqual({ api: "control.addCustomFilter", args: ["<filter/>", "contact"] });

    const optionControl = fc.getAttribute("statuscode")!.controls.get(0)!;
    optionControl.addOption({ value: 3, label: "Pending" });
    optionControl.clearOptions();
    expect(calls).toContainEqual({ api: "control.addOption", args: [{ value: 3, label: "Pending" }, undefined] });
    expect(calls).toContainEqual({ api: "control.clearOptions", args: [] });
  });

  it("wraps the ui surface: notifications, form type, tabs, and sections", () => {
    const { form, calls } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    expect(fc.ui.getFormType()).toBe(2);
    expect(fc.ui.setFormNotification("Heads up", "WARNING", "n1")).toBe(true);
    fc.ui.clearFormNotification("n1");
    fc.ui.refreshRibbon();
    expect(calls).toContainEqual({ api: "ui.setFormNotification", args: ["Heads up", "WARNING", "n1"] });
    expect(calls).toContainEqual({ api: "ui.clearFormNotification", args: ["n1"] });
    expect(calls).toContainEqual({ api: "ui.refreshRibbon", args: [] });

    const tab = fc.ui.tabs.get("tab_general")!;
    expect(tab.getDisplayState()).toBe("expanded");
    tab.setDisplayState("collapsed");
    expect(calls).toContainEqual({ api: "tab.setDisplayState", args: ["collapsed"] });

    const section = tab.sections.get("general")!;
    expect(section.getLabel()).toBe("General");
    section.setVisible(false);
    expect(calls).toContainEqual({ api: "section.setVisible", args: [false] });
  });

  it("forwards data lifecycle calls (refresh, save, addOnLoad, entity.save)", async () => {
    const { form, calls } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    expect(fc.data.getIsDirty()).toBe(true);
    await fc.data.refresh(true);
    await fc.data.save();
    const handler = () => undefined;
    fc.data.addOnLoad(handler);
    await fc.data.entity.save("saveandclose");
    fc.data.entity.addOnPostSave(handler);
    expect(calls).toContainEqual({ api: "data.refresh", args: [true] });
    expect(calls).toContainEqual({ api: "data.save", args: [undefined] });
    expect(calls).toContainEqual({ api: "data.addOnLoad", args: [handler] });
    expect(calls).toContainEqual({ api: "entity.save", args: ["saveandclose"] });
    expect(calls).toContainEqual({ api: "entity.addOnPostSave", args: [handler] });
  });

  it("wraps the BPF process: active process/stage, moveNext, getEnabledProcesses", async () => {
    const { form, calls } = makeHostForm();
    const fc = buildFormContext(form, HOST);
    const process = fc.data.process!;
    expect(process.getActiveProcess()?.getName()).toBe("Lead to Opportunity");
    expect(process.getActiveProcess()?.getStages().get(0)?.getName()).toBe("Qualify");
    expect(process.getActiveStage()?.getStatus()).toBe("active");
    await expect(process.moveNext()).resolves.toBe("success");
    await process.setActiveProcess("proc-a");
    const enabled = await process.getEnabledProcesses();
    expect(enabled.map((p) => p.getName())).toEqual(["Process A", "Process B"]);
    expect(calls).toContainEqual({ api: "process.moveNext", args: [] });
    expect(calls).toContainEqual({ api: "process.setActiveProcess", args: ["proc-a"] });
    expect(calls).toContainEqual({ api: "process.getEnabledProcesses", args: [] });
  });

  it("rejects with a clear host-named error when the host lacks a member", () => {
    // A lean host (the CRM 8.x Page shape) without getDataXml/refreshRibbon.
    const lean: IHostFormContext = {
      data: { entity: { getId: () => "", getEntityName: () => "account", attributes: { get: () => null } } },
      ui: {},
    };
    const fc = buildFormContext(lean, "CRM 8.x webresource");
    expect(() => fc.data.entity.getDataXml()).toThrow(
      /entity.getDataXml is not supported on the CRM 8.x webresource host/
    );
    expect(() => fc.ui.refreshRibbon()).toThrow(/not supported on the CRM 8.x webresource host/);
  });
});
