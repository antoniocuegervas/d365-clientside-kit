import { ClientHook } from "../shared/ClientHook";

/**
 * OOTB ribbon hook example: commands that open the unified clientui shell with
 * an app key + payload, the standard launch pattern. One opens a centered modal
 * dialog, the other a side pane beside the form, both from a command-bar button.
 *
 *   Command action: CrmClientSide.Account.Ribbon.openCompanySearch
 *     CrmParameter: PrimaryControl
 *   Command action: CrmClientSide.Account.Ribbon.openCompanySearchPane
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

  /** Open the company-search app as a centered modal dialog. */
  readonly openCompanySearch = (primaryControl: unknown): void => {
    void this.context.navigation.openClientUI(
      this.webResourceName,
      "sample-company-search",
      { accountId: this.accountIdOf(primaryControl) },
      { title: "Company Search" }
    );
  };

  /** Open the same app as a side pane that sits beside the form (non-modal). */
  readonly openCompanySearchPane = (primaryControl: unknown): void => {
    void this.context.navigation.openClientUI(
      this.webResourceName,
      "sample-company-search",
      { accountId: this.accountIdOf(primaryControl) },
      { mode: "side", width: 480, title: "Company Search" }
    );
  };

  /** Enable rule: only light up the button once the record is saved. */
  readonly isRecordSaved = (primaryControl: unknown): boolean => {
    return !!this.accountIdOf(primaryControl);
  };

  private accountIdOf(primaryControl: unknown): string | null {
    const formContext = AccountRibbon.formContextOf(primaryControl);
    return formContext.data?.entity?.getId?.() ?? null;
  }
}
