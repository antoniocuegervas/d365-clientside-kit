import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";

/**
 * Canonical multi-query merged grid: rows from TWO FetchXML sources
 * my open opportunities and opportunities won in the last 30 days , 
 * combined into one native-looking grid. No native subgrid can union result
 * sets; the ViewModel merges, the presentational grid displays.
 */
export class MergedGridViewModel {
  readonly rows = new Observable<IGridRow[]>([]);
  readonly loading = new Observable<boolean>(true);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    void this.load();
  }

  readonly load = async (): Promise<void> => {
    this.loading.value = true;
    try {
      const openFetch = `
        <fetch version='1.0' output-format='xml-platform' mapping='logical' top='25'>
          <entity name='opportunity'>
            <attribute name='name' />
            <attribute name='customerid' />
            <attribute name='estimatedvalue' />
            <attribute name='opportunityid' />
            <filter type='and'>
              <condition attribute='statecode' operator='eq' value='0' />
            </filter>
            <order attribute='estimatedvalue' descending='true' />
          </entity>
        </fetch>`;
      const wonFetch = `
        <fetch version='1.0' output-format='xml-platform' mapping='logical' top='25'>
          <entity name='opportunity'>
            <attribute name='name' />
            <attribute name='customerid' />
            <attribute name='estimatedvalue' />
            <attribute name='opportunityid' />
            <attribute name='actualclosedate' />
            <filter type='and'>
              <condition attribute='statecode' operator='eq' value='1' />
              <condition attribute='actualclosedate' operator='last-x-days' value='30' />
            </filter>
            <order attribute='actualclosedate' descending='true' />
          </entity>
        </fetch>`;
      const [open, recentlyWon] = await Promise.all([
        this.context.webAPI.fetch("opportunity", openFetch),
        this.context.webAPI.fetch("opportunity", wonFetch),
      ]);
      if (this.tracker.isDisposed) {
        return;
      }
      this.rows.value = [
        ...open.entities.map((record) => this.toRow(record, "My open")),
        ...recentlyWon.entities.map((record) => this.toRow(record, "Won (last 30 days)")),
      ];
    } finally {
      if (!this.tracker.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  private toRow(record: Record<string, unknown>, source: string): IGridRow {
    return {
      key: `${source}-${record.opportunityid}`,
      topic: (record.name as string) ?? "",
      customer: LibraryUtils.formattedValue(record, "_customerid_value") ?? "",
      value: LibraryUtils.formattedValue(record, "estimatedvalue") ?? "",
      source,
      recordId: String(record.opportunityid),
    };
  }

  readonly onOpenRecord = (row: IGridRow): void => {
    void this.context.navigation.openForm("opportunity", String(row.recordId));
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
