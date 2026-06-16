import * as LibraryUtils from "../../shared/utils/LibraryUtils";
import { ClientHook } from "../shared/ClientHook";

/**
 * OOTB form hook example: register on the Account main form's OnLoad
 * with "pass execution context as first parameter" checked.
 *
 *   Library: <prefix>clienthooks.js
 *   Function: CrmClientSide.Account.Form.onLoad
 *
 * This is a TEMPLATE demonstrating LibraryUtils field manipulation, projects
 * copy the pattern, they don't ship this file's rules.
 */
export class AccountForm extends ClientHook {
  /** Arrow property so CRM can call the handler unbound. */
  readonly onLoad = (executionContext: Xrm.Events.EventContext): void => {
    const formContext = AccountForm.formContextOf(executionContext);
    const formType = LibraryUtils.getFormType(formContext);

    // Credit fields make no sense until the record exists.
    LibraryUtils.setFieldsVisible(
      formContext,
      ["creditonhold", "creditlimit"],
      formType !== "create"
    );

    // Account number is system-assigned here, visible but locked.
    LibraryUtils.setFieldsDisabled(formContext, ["accountnumber"], true);

    // Nudge for a phone number without hard-blocking the save.
    LibraryUtils.setFieldsRequired(formContext, ["telephone1"], "recommended");
  };

  /**
   * OnSave example demonstrating the N-07 notification helpers, register
   * on the Account form's OnSave (pass execution context). Surfaces a field-level
   * warning when a recommended field is blank, without blocking the save.
   *
   *   Function: CrmClientSide.Account.Form.onSave
   */
  readonly onSave = (executionContext: Xrm.Events.EventContext): void => {
    const formContext = AccountForm.formContextOf(executionContext);
    const NOTIFY_ID = "account-phone-recommended";
    const phone = formContext.getAttribute("telephone1")?.getValue();
    if (phone) {
      LibraryUtils.clearFieldNotification(formContext, "telephone1", NOTIFY_ID);
    } else {
      LibraryUtils.setFieldNotification(
        formContext,
        "telephone1",
        "A main phone is recommended for new accounts.",
        NOTIFY_ID
      );
    }
  };
}
