import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../shared/reactivity/ObservableArray";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import { LibraryUtils } from "../../../shared/utils/LibraryUtils";

/** One merged pipeline row in domain terms. The View maps these to grid rows. */
export interface IPipelineRow {
  id: string;
  topic: string;
  customer: string;
  value: string;
  source: string;
}

/**
 * Canonical multi-query merged grid: rows from two FetchXML sources (my open
 * opportunities and opportunities won in the last 30 days) combined into one
 * native-looking grid. No native subgrid can union result sets, so the
 * ViewModel merges; the View maps the result to grid rows.
 */
export class MergedGridViewModel {
  readonly results = new ObservableArray<IPipelineRow>();
  readonly loading = new Observable<boolean>(true);
  /** Neutral message when the queries fail to run (e.g. the entity is absent). */
  readonly loadError = new Observable<string | null>(null);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    void this.load();
  }

  readonly load = async (): Promise<void> => {
    this.loading.value = true;
    this.loadError.value = null;
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
      this.results.value = [
        ...open.entities.map((record) => this.toRow(record, "My open")),
        ...recentlyWon.entities.map((record) => this.toRow(record, "Won (last 30 days)")),
      ];
    } catch (error) {
      if (!this.tracker.isDisposed) {
        // A failed query (e.g. the opportunity entity is not in this environment)
        // must not read as an empty pipeline. Never surface raw SDK text: log it
        // for developers and show a neutral degraded banner instead.
        console.error("Merged grid load failed", error);
        this.results.value = [];
        this.loadError.value = "This data could not be loaded in this environment.";
      }
    } finally {
      if (!this.tracker.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  private toRow(record: Record<string, unknown>, source: string): IPipelineRow {
    return {
      id: String(record.opportunityid),
      topic: (record.name as string) ?? "",
      customer: LibraryUtils.formattedValue(record, "_customerid_value") ?? "",
      value: LibraryUtils.formattedValue(record, "estimatedvalue") ?? "",
      source,
    };
  }

  readonly onOpenRecord = (recordId: string): void => {
    void this.context.navigation.openForm("opportunity", recordId);
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
