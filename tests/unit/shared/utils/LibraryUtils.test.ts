import * as LibraryUtils from "../../../../shared/utils/LibraryUtils";

/**
 * Minimal fake of the slice of Xrm.FormContext that LibraryUtils touches , 
 * the same shape works for forms and editable-grid row contexts.
 */
interface FakeControl {
  setDisabled: jest.Mock;
  setVisible: jest.Mock;
  setNotification: jest.Mock;
  clearNotification: jest.Mock;
  addNotification: jest.Mock;
}

function makeFakeForm(attributeNames: string[], formType = 2) {
  const controls = new Map<string, FakeControl>();
  const attributes = attributeNames.map((name) => {
    const control: FakeControl = {
      setDisabled: jest.fn(),
      setVisible: jest.fn(),
      setNotification: jest.fn(),
      clearNotification: jest.fn(),
      addNotification: jest.fn(),
    };
    controls.set(name, control);
    return {
      getName: () => name,
      setRequiredLevel: jest.fn(),
      controls: { forEach: (cb: (c: FakeControl) => void) => cb(control) },
    };
  });
  const byName = new Map(attributes.map((a) => [a.getName(), a]));
  const setFormNotification = jest.fn(() => true);
  const clearFormNotification = jest.fn(() => true);
  const formContext = {
    getAttribute: (name: string) => byName.get(name) ?? null,
    data: { entity: { attributes: { forEach: (cb: (a: unknown) => void) => attributes.forEach(cb) } } },
    ui: { getFormType: () => formType, setFormNotification, clearFormNotification },
  } as unknown as Xrm.FormContext;
  return { formContext, controls, attributes: byName, setFormNotification, clearFormNotification };
}

describe("LibraryUtils field manipulation", () => {
  it("setFieldsVisible toggles only the named attributes", () => {
    const { formContext, controls } = makeFakeForm(["name", "revenue", "industrycode"]);
    LibraryUtils.setFieldsVisible(formContext, ["name", "revenue"], false);
    expect(controls.get("name")!.setVisible).toHaveBeenCalledWith(false);
    expect(controls.get("revenue")!.setVisible).toHaveBeenCalledWith(false);
    expect(controls.get("industrycode")!.setVisible).not.toHaveBeenCalled();
  });

  it("setFieldsDisabled tolerates attributes missing from the form", () => {
    const { formContext, controls } = makeFakeForm(["name"]);
    expect(() =>
      LibraryUtils.setFieldsDisabled(formContext, ["name", "not_on_form"], true)
    ).not.toThrow();
    expect(controls.get("name")!.setDisabled).toHaveBeenCalledWith(true);
  });

  it("setFieldsRequired sets the requirement level", () => {
    const { formContext, attributes } = makeFakeForm(["telephone1"]);
    LibraryUtils.setFieldsRequired(formContext, ["telephone1"], "required");
    expect(attributes.get("telephone1")!.setRequiredLevel).toHaveBeenCalledWith("required");
  });

  it("lockAllFields disables everything except the allow-list", () => {
    const { formContext, controls } = makeFakeForm(["name", "revenue", "ownerid"]);
    LibraryUtils.lockAllFields(formContext, { except: ["ownerid"] });
    expect(controls.get("name")!.setDisabled).toHaveBeenCalledWith(true);
    expect(controls.get("revenue")!.setDisabled).toHaveBeenCalledWith(true);
    expect(controls.get("ownerid")!.setDisabled).not.toHaveBeenCalled();
  });

  it("unlockAllFields re-enables fields", () => {
    const { formContext, controls } = makeFakeForm(["name"]);
    LibraryUtils.unlockAllFields(formContext);
    expect(controls.get("name")!.setDisabled).toHaveBeenCalledWith(false);
  });

  it("set/clearFieldNotification target the attribute's controls (N-07)", () => {
    const { formContext, controls } = makeFakeForm(["telephone1", "name"]);
    LibraryUtils.setFieldNotification(formContext, "telephone1", "Required", "phone-required");
    expect(controls.get("telephone1")!.setNotification).toHaveBeenCalledWith(
      "Required",
      "phone-required"
    );
    expect(controls.get("name")!.setNotification).not.toHaveBeenCalled();

    LibraryUtils.clearFieldNotification(formContext, "telephone1", "phone-required");
    expect(controls.get("telephone1")!.clearNotification).toHaveBeenCalledWith("phone-required");
  });

  it("setFieldNotification is a no-op for a field absent from the form (N-07)", () => {
    const { formContext } = makeFakeForm(["name"]);
    expect(() =>
      LibraryUtils.setFieldNotification(formContext, "not_on_form", "x", "id")
    ).not.toThrow();
  });

  it("addFieldNotification passes rich options to the attribute's controls (N-12)", () => {
    const { formContext, controls } = makeFakeForm(["websiteurl", "name"]);
    const action = jest.fn();
    const options = {
      messages: ["No website captured."],
      notificationLevel: "RECOMMENDATION" as const,
      uniqueId: "site-rec",
      actions: [{ message: "Start one", actions: [action] }],
    };
    LibraryUtils.addFieldNotification(formContext, "websiteurl", options);
    expect(controls.get("websiteurl")!.addNotification).toHaveBeenCalledWith(options);
    expect(controls.get("name")!.addNotification).not.toHaveBeenCalled();
  });

  it("addFieldNotification is cleared by clearFieldNotification, no separate remover (N-12)", () => {
    const { formContext, controls } = makeFakeForm(["websiteurl"]);
    LibraryUtils.addFieldNotification(formContext, "websiteurl", {
      messages: ["x"],
      uniqueId: "site-rec",
    });
    LibraryUtils.clearFieldNotification(formContext, "websiteurl", "site-rec");
    expect(controls.get("websiteurl")!.clearNotification).toHaveBeenCalledWith("site-rec");
  });

  it("addFieldNotification skips controls without rich-notification support (N-12)", () => {
    const { formContext, controls } = makeFakeForm(["websiteurl"]);
    // Editable-grid-style control without addNotification.
    (controls.get("websiteurl") as { addNotification?: unknown }).addNotification = undefined;
    expect(() =>
      LibraryUtils.addFieldNotification(formContext, "websiteurl", {
        messages: ["x"],
        uniqueId: "site-rec",
      })
    ).not.toThrow();
  });

  it("set/clearFormNotification delegate to the form ui (N-07)", () => {
    const { formContext, setFormNotification, clearFormNotification } = makeFakeForm([]);
    expect(LibraryUtils.setFormNotification(formContext, "Heads up", "WARNING", "warn-1")).toBe(true);
    expect(setFormNotification).toHaveBeenCalledWith("Heads up", "WARNING", "warn-1");
    expect(LibraryUtils.clearFormNotification(formContext, "warn-1")).toBe(true);
    expect(clearFormNotification).toHaveBeenCalledWith("warn-1");
  });

  it("getFormType maps the raw integers", () => {
    expect(LibraryUtils.getFormType(makeFakeForm([], 1).formContext)).toBe("create");
    expect(LibraryUtils.getFormType(makeFakeForm([], 2).formContext)).toBe("update");
    expect(LibraryUtils.getFormType(makeFakeForm([], 3).formContext)).toBe("readonly");
    expect(LibraryUtils.getFormType(makeFakeForm([], 6).formContext)).toBe("bulkedit");
  });
});
