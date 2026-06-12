import { ClientHook } from "../shared/ClientHook";

/**
 * OOTB ribbon hook example: a command that opens the unified clientui
 * shell with an app key + payload, the standard launch pattern.
 *
 *   Command action: CrmClientSide.Account.Ribbon.openCompanySearch
 *     CrmParameter: PrimaryControl
 *   Enable rule:    CrmClientSide.Account.Ribbon.isRecordSaved
 *     CrmParameter: PrimaryControl
 */
export class AccountRibbon extends ClientHook {
  /**
   * The deployed shell webresource name. Override per org if the publisher
   * prefix differs (never hardcode a customer prefix).
   */
  webResourceName = "new_clientui.html";

  readonly openCompanySearch = (primaryControl: unknown): void => {
    const formContext = AccountRibbon.formContextOf(primaryControl);
    const accountId = formContext.data?.entity?.getId?.() ?? null;
    void this.context.navigation.openClientUI(this.webResourceName, "sample-company-search", {
      accountId,
    });
  };

  /** Enable rule: only light up the button once the record is saved. */
  readonly isRecordSaved = (primaryControl: unknown): boolean => {
    const formContext = AccountRibbon.formContextOf(primaryControl);
    return !!formContext.data?.entity?.getId?.();
  };
}
