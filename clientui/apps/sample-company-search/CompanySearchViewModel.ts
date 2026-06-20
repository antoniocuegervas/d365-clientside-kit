import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableEvent } from "../../../shared/reactivity/ObservableEvent";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { EntityReference } from "../../../shared/utils/EntityModel";

/**
 * Flagship "99% native" scenario: a saved-view account grid that the platform
 * cannot embed in a webresource, with quick-find search over that view, a command
 * bar, selection, and an editable detail panel; all of it looks like form
 * controls. Search is the grid's own quick-find (the View binds `searchText` to
 * it), so there is one grid, not a separate results grid.
 */
export class CompanySearchViewModel {
  //#region Search state
  /** Quick-find text; the saved-view grid filters on it (bound in the View). */
  readonly searchText = new Observable<string>("");
  //#endregion

  //#region Saved-view grid control
  readonly refreshViewGrid = new ObservableEvent<void>();

  //#endregion

  //#region Selection + detail panel
  readonly selectedAccountId = new Observable<string | null>(null);
  /** Multi-select set for the grid command bar's bulk actions. */
  readonly selectedAccountIds = new Observable<string[]>([]);
  readonly detailName = new Observable<string | null>(null);
  readonly detailParentAccount = new Observable<IEntityReference | null>(null);
  readonly detailIndustry = new Observable<number | null>(null);
  readonly detailLoading = new Observable<boolean>(false);
  readonly saveMessage = new Observable<string | null>(null);
  //#endregion

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    // Typing in search re-filters the grid; drop any stale bulk selection so the
    // command bar never acts on rows that are no longer shown.
    this.tracker.add(this.searchText.subscribe(() => (this.selectedAccountIds.value = [])));
  }

  //#region Handlers
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
        // The standard CRM error surface: the native error dialog plus a
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
  };

  /** Command bar: open the account create form. */
  readonly onNew = (): void => {
    void this.context.navigation.openForm("account");
  };

  /** Command bar: delete the selected accounts, after a confirm. Destructive. */
  readonly onDeleteSelected = async (): Promise<void> => {
    const ids = this.selectedAccountIds.value;
    if (ids.length === 0) {
      return;
    }
    const confirmed = await this.context.navigation.openConfirmDialog({
      title: "Delete accounts",
      text: `Delete ${ids.length} selected account${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
    });
    if (!confirmed || this.tracker.isDisposed) {
      return;
    }
    try {
      await Promise.all(ids.map((id) => this.context.webAPI.deleteRecord("account", id)));
    } catch (error) {
      if (!this.tracker.isDisposed) {
        void this.context.navigation.openErrorDialog({
          message: "Could not delete the selected accounts.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    if (this.tracker.isDisposed) {
      return;
    }
    this.selectedAccountIds.value = [];
    this.selectedAccountId.value = null;
    this.saveMessage.value = null;
    this.refreshViewGrid.publish();
  };

  //#endregion

  dispose(): void {
    this.tracker.dispose();
  }
}
