import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
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
 */
export class ActivitiesGridViewModel {
  readonly activities = new Observable<IActivityRow[]>([]);
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
      this.activities.value = [...tasks, ...calls, ...appointments].sort((a, b) =>
        String(a.dueSort ?? "9999").localeCompare(String(b.dueSort ?? "9999"))
      );
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
