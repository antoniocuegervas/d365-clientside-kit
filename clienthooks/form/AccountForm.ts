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
   * OnSave example demonstrating the notification helpers, register on
   * the Account form's OnSave (pass execution context). Surfaces field-level
   * nudges when recommended fields are blank, without blocking the save.
   *
   *   Function: CrmClientSide.Account.Form.onSave
   */
  readonly onSave = (executionContext: Xrm.Events.EventContext): void => {
    const formContext = AccountForm.formContextOf(executionContext);

    // N-07: plain field notification (warning icon + tooltip).
    const PHONE_ID = "account-phone-recommended";
    const phone = formContext.getAttribute("telephone1")?.getValue();
    if (phone) {
      LibraryUtils.clearFieldNotification(formContext, "telephone1", PHONE_ID);
    } else {
      LibraryUtils.setFieldNotification(
        formContext,
        "telephone1",
        "A main phone is recommended for new accounts.",
        PHONE_ID
      );
    }

    // N-12: rich, actionable notification, a recommendation with a clickable
    // "fix it" action. Cleared with the same N-07 helper (no separate remover).
    const SITE_ID = "account-website-recommended";
    const website = formContext.getAttribute("websiteurl")?.getValue();
    if (website) {
      LibraryUtils.clearFieldNotification(formContext, "websiteurl", SITE_ID);
    } else {
      LibraryUtils.addFieldNotification(formContext, "websiteurl", {
        messages: ["No website captured for this account."],
        notificationLevel: "RECOMMENDATION",
        uniqueId: SITE_ID,
        actions: [
          {
            message: "Start one (https://)",
            actions: [() => formContext.getAttribute("websiteurl")?.setValue("https://")],
          },
        ],
      });
    }
  };
}
