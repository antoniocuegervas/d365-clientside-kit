import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IGridRow } from "../../../shared/controls/presentational/DataGrid";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";

/**
 * Kitchen-sink composite filter: nearly every control type in one
 * View. The ViewModel's only real job is translating filter Observables into
 * one FetchXML, the fields themselves are all metadata-aware blocks.
 */
export class OpportunitySearchViewModel {
  //#region Filter fields (bound by smart blocks in the View)
  readonly topicContains = new Observable<string | null>(null);
  readonly customer = new Observable<IEntityReference | null>(null);
  readonly rating = new Observable<number | null>(null);
  readonly decisionMaker = new Observable<boolean | null>(null);
  readonly minValue = new Observable<number | null>(null);
  readonly closingAfter = new Observable<Date | null>(null);
  readonly closingBefore = new Observable<Date | null>(null);

  //#endregion

  //#region Results
  readonly rows = new Observable<IGridRow[]>([]);
  readonly searching = new Observable<boolean>(false);
  readonly resultSummary = new Observable<string | null>(null);
  //#endregion

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {}

  readonly onSearch = async (): Promise<void> => {
    this.searching.value = true;
    try {
      const esc = LibraryUtils.escapeXml;
      // Each line is a literal <condition>, included only when its field is set.
      const conditions = [
        `<condition attribute='statecode' operator='eq' value='0' />`,
        this.topicContains.value
          ? `<condition attribute='name' operator='like' value='%${esc(this.topicContains.value)}%' />`
          : "",
        this.customer.value
          ? `<condition attribute='customerid' operator='eq' value='${esc(this.customer.value.id)}' />`
          : "",
        this.rating.value !== null
          ? `<condition attribute='opportunityratingcode' operator='eq' value='${this.rating.value}' />`
          : "",
        this.decisionMaker.value !== null
          ? `<condition attribute='decisionmaker' operator='eq' value='${this.decisionMaker.value ? 1 : 0}' />`
          : "",
        this.minValue.value !== null
          ? `<condition attribute='estimatedvalue' operator='ge' value='${this.minValue.value}' />`
          : "",
        this.closingAfter.value
          ? `<condition attribute='estimatedclosedate' operator='on-or-after' value='${toDateOnly(this.closingAfter.value)}' />`
          : "",
        this.closingBefore.value
          ? `<condition attribute='estimatedclosedate' operator='on-or-before' value='${toDateOnly(this.closingBefore.value)}' />`
          : "",
      ]
        .filter(Boolean)
        .join("\n              ");

      const fetchXml = `
        <fetch version='1.0' output-format='xml-platform' mapping='logical' top='50'>
          <entity name='opportunity'>
            <attribute name='name' />
            <attribute name='customerid' />
            <attribute name='estimatedvalue' />
            <attribute name='estimatedclosedate' />
            <attribute name='opportunityratingcode' />
            <attribute name='opportunityid' />
            <filter type='and'>
              ${conditions}
            </filter>
            <order attribute='estimatedclosedate' descending='false' />
          </entity>
        </fetch>`;

      const result = await this.context.webAPI.fetch("opportunity", fetchXml);
      if (this.tracker.isDisposed) {
        return;
      }
      this.rows.value = result.entities.map((record) => ({
        key: String(record.opportunityid),
        topic: (record.name as string) ?? "",
        customer: LibraryUtils.formattedValue(record, "_customerid_value") ?? "",
        value: LibraryUtils.formattedValue(record, "estimatedvalue") ?? String(record.estimatedvalue ?? ""),
        closing: LibraryUtils.formattedValue(record, "estimatedclosedate") ?? "",
        rating: LibraryUtils.formattedValue(record, "opportunityratingcode") ?? "",
      }));
      this.resultSummary.value = `${result.entities.length} open opportunities`;
    } finally {
      if (!this.tracker.isDisposed) {
        this.searching.value = false;
      }
    }
  };

  readonly onClear = (): void => {
    this.topicContains.value = null;
    this.customer.value = null;
    this.rating.value = null;
    this.decisionMaker.value = null;
    this.minValue.value = null;
    this.closingAfter.value = null;
    this.closingBefore.value = null;
    this.rows.value = [];
    this.resultSummary.value = null;
  };

  readonly onOpenRecord = (row: IGridRow): void => {
    void this.context.navigation.openForm("opportunity", row.key);
  };

  dispose(): void {
    this.tracker.dispose();
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
