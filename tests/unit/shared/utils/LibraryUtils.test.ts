import * as LibraryUtils from "../../../../shared/utils/LibraryUtils";

/**
 * Minimal fake of the slice of Xrm.FormContext that LibraryUtils touches , 
 * the same shape works for forms and editable-grid row contexts.
 */
interface FakeControl {
  setDisabled: jest.Mock;
  setVisible: jest.Mock;
}

function makeFakeForm(attributeNames: string[], formType = 2) {
  const controls = new Map<string, FakeControl>();
  const attributes = attributeNames.map((name) => {
    const control: FakeControl = { setDisabled: jest.fn(), setVisible: jest.fn() };
    controls.set(name, control);
    return {
      getName: () => name,
      setRequiredLevel: jest.fn(),
      controls: { forEach: (cb: (c: FakeControl) => void) => cb(control) },
    };
  });
  const byName = new Map(attributes.map((a) => [a.getName(), a]));
  const formContext = {
    getAttribute: (name: string) => byName.get(name) ?? null,
    data: { entity: { attributes: { forEach: (cb: (a: unknown) => void) => attributes.forEach(cb) } } },
    ui: { getFormType: () => formType },
  } as unknown as Xrm.FormContext;
  return { formContext, controls, attributes: byName };
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

  it("getFormType maps the raw integers", () => {
    expect(LibraryUtils.getFormType(makeFakeForm([], 1).formContext)).toBe("create");
    expect(LibraryUtils.getFormType(makeFakeForm([], 2).formContext)).toBe("update");
    expect(LibraryUtils.getFormType(makeFakeForm([], 3).formContext)).toBe("readonly");
    expect(LibraryUtils.getFormType(makeFakeForm([], 6).formContext)).toBe("bulkedit");
  });
});
