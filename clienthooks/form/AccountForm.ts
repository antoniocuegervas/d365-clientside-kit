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
}
