import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../shared/reactivity/ObservableArray";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";

/** One merged activity in domain terms. The View maps these to grid rows. */
export interface IActivityRow {
  id: string;
  entity: string;
  type: string;
  subject: string;
  regarding: string;
  due: string;
  /** Raw scheduled-end used for cross-type sorting; not displayed. */
  dueSort: string | null;
  status: string;
}

/**
 * Canonical "data model doesn't fit one native control" scenario: tasks, phone
 * calls, and appointments unified into ONE native-looking list. Native subgrids
 * show one activity type; this ViewModel runs three FetchXML queries,
 * normalizes the rows, merges, and sorts; the View maps the result to grid rows.
 *
 * This deliberately hand-merges per type rather than querying activitypointer
 * (which would let a single SmartViewGrid do it): the point is the multi-source
 * merge pattern you reach for when each type needs its own columns or filters.
 * Because the merged set lives in memory, paging is client-side (see the View).
 */
export class ActivitiesGridViewModel {
  readonly activities = new ObservableArray<IActivityRow>();
  readonly loading = new Observable<boolean>(true);
  /** Current 1-based page for the in-memory client-side pager. */
  readonly page = new Observable<number>(1);
  /** Rows per page. The merged set is small, so a modest page keeps it scannable. */
  readonly pageSize = 20;

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    void this.load();
  }

  readonly nextPage = (): void => {
    this.page.value = this.page.value + 1;
  };

  readonly previousPage = (): void => {
    this.page.value = Math.max(1, this.page.value - 1);
  };

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
      this.activities.value = [...tasks, ...calls, ...appointments].sort((a, b) =>
        String(a.dueSort ?? "9999").localeCompare(String(b.dueSort ?? "9999"))
      );
      // A reload (e.g. Refresh) resets to the first page so the pager can't point
      // past the new result set.
      this.page.value = 1;
    } finally {
      if (!this.tracker.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  private async fetchActivity(entity: string, typeLabel: string): Promise<IActivityRow[]> {
    const fetchXml = `
      <fetch version='1.0' output-format='xml-platform' mapping='logical' top='25'>
        <entity name='${entity}'>
          <attribute name='subject' />
          <attribute name='scheduledend' />
          <attribute name='regardingobjectid' />
          <attribute name='statecode' />
          <attribute name='activityid' />
          <filter type='and'>
            <condition attribute='statecode' operator='eq' value='0' />
          </filter>
          <order attribute='scheduledend' descending='false' />
        </entity>
      </fetch>`;
    const result = await this.context.webAPI.fetch(entity, fetchXml);
    return result.entities.map((record) => ({
      id: String(record.activityid),
      entity,
      type: typeLabel,
      subject: (record.subject as string) ?? "",
      regarding: LibraryUtils.formattedValue(record, "_regardingobjectid_value") ?? "",
      due: LibraryUtils.formattedValue(record, "scheduledend") ?? "",
      dueSort: (record.scheduledend as string) ?? null,
      status: LibraryUtils.formattedValue(record, "statecode") ?? "",
    }));
  }

  readonly onOpenActivity = (entity: string, recordId: string): void => {
    void this.context.navigation.openForm(entity, recordId);
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
