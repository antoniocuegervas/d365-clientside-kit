/**
 * LibraryUtils, the one module CRM developers import for form/grid field
 * manipulation they would otherwise copy-paste as raw Xrm snippets.
 *
 * Every function takes the form context handed to the event handler
 * (`executionContext.getFormContext()`). On editable grids, the same call
 * shape works against the selected row's context, so hooks can share code
 * between forms and grids.
 *
 * These utilities deliberately do NOT depend on IViewModelContext, they
 * operate on the form context CRM gives client hooks, and must stay usable
 * from any host.
 */

type FormContextLike = Xrm.FormContext;

/** Controls that support setDisabled (standard field controls do). */
function isDisableable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).setDisabled === "function";
}

function isHideable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).setVisible === "function";
}

/** Runs `action` over every control bound to each named attribute. */
function forEachAttributeControl(
  formContext: FormContextLike,
  attributeNames: string[],
  action: (control: Xrm.Controls.Control) => void
): void {
  for (const name of attributeNames) {
    const attribute = formContext.getAttribute(name);
    if (!attribute) {
      continue; // attribute not on this form, a no-op, matching CRM script habits
    }
    attribute.controls.forEach((control) => {
      if (control) {
        action(control);
      }
    });
  }
}

/** Shows or hides all controls bound to the given attributes. */
export function setFieldsVisible(
  formContext: FormContextLike,
  attributeNames: string[],
  visible: boolean
): void {
  forEachAttributeControl(formContext, attributeNames, (control) => {
    if (isHideable(control)) {
      control.setVisible(visible);
    }
  });
}

/** Enables or disables all controls bound to the given attributes. */
export function setFieldsDisabled(
  formContext: FormContextLike,
  attributeNames: string[],
  disabled: boolean
): void {
  forEachAttributeControl(formContext, attributeNames, (control) => {
    if (isDisableable(control)) {
      control.setDisabled(disabled);
    }
  });
}

/** Sets the requirement level on the given attributes. */
export function setFieldsRequired(
  formContext: FormContextLike,
  attributeNames: string[],
  level: Xrm.Attributes.RequirementLevel
): void {
  for (const name of attributeNames) {
    formContext.getAttribute(name)?.setRequiredLevel(level);
  }
}

/**
 * Locks (or unlocks) every field on the form/grid row, optionally sparing an
 * allow-list, the "make this record read-only from script" workhorse.
 */
export function setAllFieldsDisabled(
  formContext: FormContextLike,
  disabled: boolean,
  options?: { except?: string[] }
): void {
  const except = new Set(options?.except ?? []);
  formContext.data.entity.attributes.forEach((attribute) => {
    if (except.has(attribute.getName())) {
      return;
    }
    attribute.controls.forEach((control) => {
      if (control && isDisableable(control)) {
        control.setDisabled(disabled);
      }
    });
  });
}

/** Convenience aliases that read naturally at call sites. */
export function lockAllFields(formContext: FormContextLike, options?: { except?: string[] }): void {
  setAllFieldsDisabled(formContext, true, options);
}

export function unlockAllFields(
  formContext: FormContextLike,
  options?: { except?: string[] }
): void {
  setAllFieldsDisabled(formContext, false, options);
}

/** Form type as a readable union instead of the raw XrmEnum integer. */
export type FormType =
  | "undefined"
  | "create"
  | "update"
  | "readonly"
  | "disabled"
  | "bulkedit"
  | "other";

export function getFormType(formContext: FormContextLike): FormType {
  switch (formContext.ui?.getFormType?.()) {
    case 0:
      return "undefined";
    case 1:
      return "create";
    case 2:
      return "update";
    case 3:
      return "readonly";
    case 4:
      return "disabled";
    case 6:
      return "bulkedit";
    default:
      return "other";
  }
}
