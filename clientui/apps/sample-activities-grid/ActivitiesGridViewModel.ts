import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";
import { buildFetchXml, condition } from "../../../shared/queries/fetchXml";

/**
 * Canonical "data model doesn't fit one native control" scenario:
 * tasks, phone calls, and appointments unified into ONE native-looking list.
 * Native subgrids show one activity type; this ViewModel runs three FetchXML
 * queries, normalizes the rows, merges, and sorts, the presentational grid
 * just displays supplied rows.
 */
export class ActivitiesGridViewModel {
  readonly rows = new Observable<IGridRow[]>([]);
  readonly loading = new Observable<boolean>(true);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    void this.load();
  }

  readonly load = async (): Promise<void> => {
    this.loading.value = true;
    try {
      // Three sources, one normalized shape, the merge IS the feature.
      const [tasks, calls, appointments] = await Promise.all([
        this.fetchActivity("task", "Task"),
        this.fetchActivity("phonecall", "Phone Call"),
        this.fetchActivity("appointment", "Appointment"),
      ]);
      if (this.tracker.isDisposed) {
        return;
      }
      this.rows.value = [...tasks, ...calls, ...appointments].sort((a, b) =>
        String(a.dueSort ?? "9999").localeCompare(String(b.dueSort ?? "9999"))
      );
    } finally {
      if (!this.tracker.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  private async fetchActivity(entity: string, typeLabel: string): Promise<IGridRow[]> {
    const result = await this.context.webAPI.fetch(
      entity,
      buildFetchXml({
        entity,
        attributes: ["subject", "scheduledend", "regardingobjectid", "statecode", "activityid"],
        filter: condition("statecode", "eq", "0"),
        order: { attribute: "scheduledend" },
        top: 25,
      })
    );
    return result.entities.map((record) => ({
      // Source-prefixed keys keep merged rows unique across entities.
      key: `${entity}-${record.activityid}`,
      type: typeLabel,
      subject: (record.subject as string) ?? "",
      regarding: LibraryUtils.formattedValue(record, "_regardingobjectid_value") ?? "",
      due: LibraryUtils.formattedValue(record, "scheduledend") ?? "",
      dueSort: (record.scheduledend as string) ?? null,
      status: LibraryUtils.formattedValue(record, "statecode") ?? "",
      entity,
      recordId: String(record.activityid),
    }));
  }

  readonly onOpenActivity = (row: IGridRow): void => {
    void this.context.navigation.openForm(String(row.entity), String(row.recordId));
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
