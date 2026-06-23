import type { IActivityTypeInfo, IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../shared/reactivity/ObservableArray";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";
import { normalizeGuid } from "../../../shared/utils/EntityModel";
import type { IGridColumn, IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { applyCounterparty, resolveCounterparties } from "../../../shared/features/counterparty/counterparty";
import { counterpartyColumns, subjectLinkColumn } from "../../../shared/features/counterparty/CounterpartyCell";

/**
 * The webresource-shell counterpart of the dataset PCF: it shows the same
 * cross-type activity grid (Counterparty + Role synthesized from the
 * activityparty rows), sourcing a page of activities through the Web API
 * instead of a bound subgrid. Lets the grid be exercised in the samples shell,
 * where the iteration loop is far shorter than a PCF deploy.
 */
export class CounterpartyGridViewModel {
  readonly columns = new Observable<IGridColumn[]>([]);
  readonly rows = new ObservableArray<IGridRow>();
  readonly loading = new Observable<boolean>(true);
  /** Selected row key; null means nothing selected. */
  readonly selectedKey = new Observable<string | null>(null);
  /** Live-search text, filters the loaded rows by subject or counterparty. */
  readonly searchText = new Observable<string>("");
  /** Activity types for the command bar's New flyout. */
  readonly activityTypes = new Observable<IActivityTypeInfo[]>([]);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    this.columns.value = [
      { key: "type", name: "Activity Type", width: 150 },
      subjectLinkColumn("subject", "Subject", 280, this.openActivity),
      { key: "regarding", name: "Regarding", width: 200 },
      ...counterpartyColumns(this.navigate),
    ];
    void this.load();
    void this.loadActivityTypes();
  }

  private readonly navigate = (entity: string, id: string): void => {
    void this.context.navigation.openForm(entity, id);
  };

  private async loadActivityTypes(): Promise<void> {
    try {
      const types = await this.context.metadata.getActivityTypes();
      if (!this.tracker.isDisposed) {
        this.activityTypes.value = types;
      }
    } catch {
      // Leave the New flyout empty rather than break the grid.
    }
  }

  readonly load = async (): Promise<void> => {
    this.loading.value = true;
    try {
      const result = await this.context.webAPI.fetch("activitypointer", activityFetch());
      if (this.tracker.isDisposed) {
        return;
      }
      const rows = result.entities.map(toRow);
      // Two-phase, the same shape the PCF uses: show the activities at once, then
      // fill Counterparty + Role after one activityparty query for the page.
      this.rows.value = rows;
      const info = await resolveCounterparties(
        this.context,
        rows.map((row) => String(row.recordId))
      );
      if (this.tracker.isDisposed) {
        return;
      }
      this.rows.value = rows.map((row) =>
        applyCounterparty({ ...row }, info.get(normalizeGuid(String(row.recordId))))
      );
    } finally {
      if (!this.tracker.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  /** Opens a row's activity (the Subject link, a double-click, and Edit). */
  readonly openActivity = (row: IGridRow): void => {
    const entity = String(row.entityName ?? "");
    const id = String(row.recordId ?? "");
    if (entity && id) {
      void this.context.navigation.openForm(entity, id);
    }
  };

  /** New flyout: open a blank form for the chosen activity type. */
  readonly onCreate = (logicalName: string): void => {
    void this.context.navigation.openForm(logicalName);
  };

  /** Edit: open the selected activity. */
  readonly onEdit = (): void => {
    const key = this.selectedKey.value;
    const row = key ? this.rows.value.find((candidate) => candidate.key === key) : undefined;
    if (row) {
      this.openActivity(row);
    }
  };

  readonly onRefresh = (): void => {
    void this.load();
  };

  dispose(): void {
    this.tracker.dispose();
  }
}

/** One grid row from an activitypointer record (the counterparty cells fill later). */
function toRow(record: Record<string, unknown>): IGridRow {
  return {
    key: String(record.activityid),
    recordId: String(record.activityid),
    // activitypointer has no openable form of its own; the real type code (e.g. "Phone Call")
    // collapses to its entity logical name ("phonecall") for openForm.
    entityName: (LibraryUtils.formattedValue(record, "activitytypecode") ?? "")
      .toLowerCase()
      .replace(/\s+/g, ""),
    type: LibraryUtils.formattedValue(record, "activitytypecode") ?? "",
    subject: (record.subject as string) ?? "",
    regarding: LibraryUtils.formattedValue(record, "_regardingobjectid_value") ?? "",
  };
}

/** A page of recent activities that are filed against a record (so each has a counterparty to find). */
function activityFetch(): string {
  return `
    <fetch version='1.0' output-format='xml-platform' mapping='logical' top='25'>
      <entity name='activitypointer'>
        <attribute name='activityid' />
        <attribute name='subject' />
        <attribute name='activitytypecode' />
        <attribute name='regardingobjectid' />
        <filter type='and'>
          <condition attribute='regardingobjectid' operator='not-null' />
        </filter>
        <order attribute='createdon' descending='true' />
      </entity>
    </fetch>`;
}
