/**
 * FormContextUtils is the one place for form/grid field manipulation a CRM dev
 * would otherwise copy-paste as raw Xrm snippets: lock/unlock, show/hide/disable,
 * required level, and field/form notifications.
 *
 * Every method takes the form context handed to the event handler
 * (`executionContext.getFormContext()`). On editable grids the same call shape
 * works against the selected row's context, so hooks share code between forms
 * and grids.
 *
 * It lives in utils, not ClientHook, because both clienthooks and clientui
 * webresources need these helpers, so they can't sit in the hooks base class.
 * They don't depend on IViewModelContext; they operate on the form context CRM
 * provides.
 */

type FormContextLike = Xrm.FormContext;

/** Controls that support setDisabled (standard field controls do). */
function isDisableable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).setDisabled === "function";
}

function isHideable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).setVisible === "function";
}

/** Controls that support set/clearNotification (standard field controls do). */
function isNotifiable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).setNotification === "function";
}

/** Controls that support the rich addNotification API (standard field controls do). */
function isRichNotifiable(control: Xrm.Controls.Control): control is Xrm.Controls.StandardControl {
  return typeof (control as Xrm.Controls.StandardControl).addNotification === "function";
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
      continue; // attribute not on this form, does nothing, matching CRM script habits
    }
    attribute.controls.forEach((control) => {
      if (control) {
        action(control);
      }
    });
  }
}

/** Form-level notification severity. */
export type FormNotificationLevel = "ERROR" | "WARNING" | "INFO";

/** One clickable action inside a rich field notification. */
export interface FieldNotificationAction {
  /** Link text for the action. */
  message: string;
  /** Handlers invoked when the user clicks the action. */
  actions: Array<() => void>;
}

/**
 * Options for a rich field notification, mirroring the platform's
 * `Xrm.Controls.AddControlNotificationOptions` with kit-owned types (option B).
 */
export interface FieldNotificationOptions {
  /** Notification lines shown in the flyout. */
  messages: string[];
  /** Severity; the platform defaults to a recommendation when omitted. */
  notificationLevel?: "ERROR" | "RECOMMENDATION";
  /** Identifies the notification so it can be cleared via clearFieldNotification. */
  uniqueId: string;
  /** Optional clickable "fix this" affordances. */
  actions?: FieldNotificationAction[];
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

export class FormContextUtils {
  /** Shows or hides all controls bound to the given attributes. */
  static setFieldsVisible(
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
  static setFieldsDisabled(
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
  static setFieldsRequired(
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
   * allow-list. The "make this record read-only from script" helper.
   */
  static setAllFieldsDisabled(
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

  /** Locks every field (optionally sparing an allow-list). */
  static lockAllFields(formContext: FormContextLike, options?: { except?: string[] }): void {
    FormContextUtils.setAllFieldsDisabled(formContext, true, options);
  }

  /** Unlocks every field (optionally sparing an allow-list). */
  static unlockAllFields(formContext: FormContextLike, options?: { except?: string[] }): void {
    FormContextUtils.setAllFieldsDisabled(formContext, false, options);
  }

  /**
   * Sets a field-level notification (the warning icon + tooltip beside a field)
   * on every control bound to the attribute. `uniqueId` identifies the
   * notification so it can be cleared later. No-op when the field isn't on the form.
   */
  static setFieldNotification(
    formContext: FormContextLike,
    attributeName: string,
    message: string,
    uniqueId: string
  ): void {
    forEachAttributeControl(formContext, [attributeName], (control) => {
      if (isNotifiable(control)) {
        control.setNotification(message, uniqueId);
      }
    });
  }

  /** Clears the field-level notification with `uniqueId` from the attribute's controls. */
  static clearFieldNotification(
    formContext: FormContextLike,
    attributeName: string,
    uniqueId: string
  ): void {
    forEachAttributeControl(formContext, [attributeName], (control) => {
      if (isNotifiable(control)) {
        control.clearNotification(uniqueId);
      }
    });
  }

  /**
   * Adds a rich, actionable field notification, severity, multiple lines, and
   * clickable actions, on every control bound to the attribute. This is
   * the platform's `control.addNotification`, a step up from the plain
   * {@link FormContextUtils.setFieldNotification}. Clear it with
   * {@link FormContextUtils.clearFieldNotification} (same `uniqueId`); there is no
   * separate remover. No-op when the field isn't on the form or the control
   * doesn't support rich notifications (e.g. some editable grid cells).
   */
  static addFieldNotification(
    formContext: FormContextLike,
    attributeName: string,
    options: FieldNotificationOptions
  ): void {
    forEachAttributeControl(formContext, [attributeName], (control) => {
      if (isRichNotifiable(control)) {
        control.addNotification(options as Xrm.Controls.AddControlNotificationOptions);
      }
    });
  }

  /**
   * Shows a form-level notification banner at the top of the form.
   * `uniqueId` identifies it for later clearing. Returns whether the platform
   * accepted it.
   */
  static setFormNotification(
    formContext: FormContextLike,
    message: string,
    level: FormNotificationLevel,
    uniqueId: string
  ): boolean {
    return formContext.ui?.setFormNotification?.(message, level, uniqueId) ?? false;
  }

  /** Clears the form-level notification with `uniqueId`. */
  static clearFormNotification(formContext: FormContextLike, uniqueId: string): boolean {
    return formContext.ui?.clearFormNotification?.(uniqueId) ?? false;
  }

  /** Form type as a readable union instead of the raw XrmEnum integer. */
  static getFormType(formContext: FormContextLike): FormType {
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
}
