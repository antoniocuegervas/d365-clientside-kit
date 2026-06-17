import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";
import { buildFetchXml, condition } from "../../../shared/queries/fetchXml";

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
      const attributes = ["name", "customerid", "estimatedvalue", "opportunityid"];
      const [open, recentlyWon] = await Promise.all([
        this.context.webAPI.fetch(
          "opportunity",
          buildFetchXml({
            entity: "opportunity",
            attributes,
            filter: condition("statecode", "eq", "0"),
            order: { attribute: "estimatedvalue", descending: true },
            top: 25,
          })
        ),
        this.context.webAPI.fetch(
          "opportunity",
          buildFetchXml({
            entity: "opportunity",
            attributes: [...attributes, "actualclosedate"],
            filter:
              condition("statecode", "eq", "1") +
              condition("actualclosedate", "last-x-days", "30"),
            order: { attribute: "actualclosedate", descending: true },
            top: 25,
          })
        ),
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
