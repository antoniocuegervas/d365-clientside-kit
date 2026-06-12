/**
 * clienthooks bundle entry, everything exported here becomes the
 * `CrmClientSide` UMD global that CRM form/ribbon/grid registrations call:
 *
 *   CrmClientSide.<Entity>.Form.<handler>
 *   CrmClientSide.<Entity>.Ribbon.<handler>
 *   CrmClientSide.LockedGrid.<handler>        (reusable, non-entity)
 *
 * These hooks are TEMPLATES: copy the pattern for project entities;
 * webresource app logic stays in clientui ViewModels, not here.
 */
import { AccountForm } from "./form/AccountForm";
import { AccountRibbon } from "./ribbon/AccountRibbon";
import { LockedGrid as LockedGridHook } from "./grid/LockedGrid";

export const Account = {
  Form: new AccountForm(),
  Ribbon: new AccountRibbon(),
};

export const LockedGrid = new LockedGridHook();
