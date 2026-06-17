import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableEvent } from "../../../shared/reactivity/ObservableEvent";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IGridRow } from "../../../shared/controls/presentational/DataGrid";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { EntityReference } from "../../../shared/utils/EntityModel";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";

/**
 * Flagship "99% native" scenario: a saved-view account grid that the
 * platform cannot embed in a webresource, plus code-level search, refresh,
 * selection, and an editable detail panel, all looking like form controls.
 */
export class CompanySearchViewModel {
  // --- Search state ----------------------------------------------------
  readonly searchText = new Observable<string>("");
  readonly searchRows = new Observable<IGridRow[]>([]);
  readonly searching = new Observable<boolean>(false);
  /** True once a search ran, switches the View from saved view to results. */
  readonly hasSearched = new Observable<boolean>(false);

  // --- Saved-view grid control ------------------------------------------
  readonly refreshViewGrid = new ObservableEvent<void>();

  // --- Selection + detail panel -----------------------------------------
  readonly selectedAccountId = new Observable<string | null>(null);
  readonly detailName = new Observable<string | null>(null);
  readonly detailParentAccount = new Observable<IEntityReference | null>(null);
  readonly detailIndustry = new Observable<number | null>(null);
  readonly detailLoading = new Observable<boolean>(false);
  readonly saveMessage = new Observable<string | null>(null);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {}

  // --- Handlers ----------------------------------------------------------
  readonly onSearch = async (text: string): Promise<void> => {
    if (!text.trim()) {
      // Empty search returns the View to the native saved-view experience.
      this.hasSearched.value = false;
      return;
    }
    this.searching.value = true;
    this.hasSearched.value = true;
    try {
      const fetchXml =
        `<fetch version="1.0" output-format="xml-platform" mapping="logical" top="50">` +
        `<entity name="account">` +
        `<attribute name="name" /><attribute name="address1_city" />` +
        `<attribute name="telephone1" /><attribute name="accountid" />` +
        `<filter type="and">` +
        `<condition attribute="name" operator="like" value="%${LibraryUtils.escapeXml(text.trim())}%" />` +
        `<condition attribute="statecode" operator="eq" value="0" /></filter>` +
        `<order attribute="name" descending="false" /></entity></fetch>`;
      const result = await this.context.webAPI.fetch("account", fetchXml);
      if (this.tracker.isDisposed) {
        return;
      }
      this.searchRows.value = result.entities.map((record) => ({
        key: String(record.accountid),
        name: (record.name as string) ?? "",
        city: (record.address1_city as string) ?? "",
        phone: (record.telephone1 as string) ?? "",
      }));
    } finally {
      if (!this.tracker.isDisposed) {
        this.searching.value = false;
      }
    }
  };

  readonly onAccountSelected = async (accountId: string): Promise<void> => {
    this.selectedAccountId.value = accountId;
    this.detailLoading.value = true;
    this.saveMessage.value = null;
    try {
      const record = await this.context.webAPI.retrieveRecord(
        "account",
        accountId,
        "?$select=name,industrycode,_parentaccountid_value"
      );
      if (this.tracker.isDisposed) {
        return;
      }
      this.detailName.value = (record.name as string) ?? null;
      this.detailIndustry.value = (record.industrycode as number) ?? null;
      this.detailParentAccount.value = EntityReference.fromODataRecord(record, "parentaccountid");
    } finally {
      if (!this.tracker.isDisposed) {
        this.detailLoading.value = false;
      }
    }
  };

  readonly onSaveDetail = async (): Promise<void> => {
    const accountId = this.selectedAccountId.value;
    if (!accountId) {
      return;
    }
    const parent = this.detailParentAccount.value;
    try {
      await this.context.webAPI.updateRecord("account", accountId, {
        name: this.detailName.value,
        industrycode: this.detailIndustry.value,
        "parentaccountid@odata.bind": parent ? `/accounts(${parent.id})` : null,
      });
    } catch (error) {
      if (!this.tracker.isDisposed) {
        // The idiomatic CRM error surface (N-02): native error chrome plus a
        // Download Log File button when details are present.
        void this.context.navigation.openErrorDialog({
          message: "Could not save the account.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (this.tracker.isDisposed) {
      return;
    }
    this.saveMessage.value = "Saved.";
    this.refreshViewGrid.publish();
    if (this.hasSearched.value) {
      void this.onSearch(this.searchText.value);
    }
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
