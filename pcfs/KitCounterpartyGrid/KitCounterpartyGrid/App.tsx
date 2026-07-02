import * as React from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { SmartComponent } from "../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../shared/reactivity/Observable";
import type { IActivityTypeInfo } from "../../../shared/context/IViewModelContext";
import type { IGridColumn, IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { normalizeGuid, type IXrmLookupValue } from "../../../shared/utils/EntityModel";
import { CounterpartyGridView } from "../../../shared/features/counterparty/CounterpartyGridView";
import { ActivityCommandBar } from "../../../shared/features/counterparty/ActivityCommandBar";
import {
  counterpartyColumns,
  subjectLinkColumn,
  type OpenActivity,
} from "../../../shared/features/counterparty/CounterpartyCell";
import {
  applyCounterparty,
  resolveCounterparties,
  type ICounterpartyInfo,
} from "../../../shared/features/counterparty/counterparty";

/** Page size the control requests, so the subgrid pages instead of showing a stub few. */
const PAGE_SIZE = 10;

export interface ICounterpartyGridAppProps {
  /** The bound Activities subgrid (activitypointer) the control renders over. */
  dataset: ComponentFramework.PropertyTypes.DataSet;
  /**
   * The host form's record (the account), so a new activity is filed against it
   * (regarding + any mapped parties), matching the form's own timeline. Undefined
   * when the control is not hosted on a record form.
   */
  host?: IXrmLookupValue;
}

interface ICounterpartyGridAppState {
  /** Resolved counterparty + role per activity id, filled after the party query. */
  counterparties: Map<string, ICounterpartyInfo>;
  /** Activity types for the command bar's New flyout. */
  activityTypes: IActivityTypeInfo[];
}

/**
 * The counterparty dataset PCF's grid body. Columns and base rows are derived
 * straight from the bound subgrid in render(), so the view's own columns paint
 * immediately. The synthesized Counterparty column (the lead external party as a
 * link, its role inline or a "(+N more)" popover) fills in after one activityparty
 * query for the visible page resolves (show the activities first, then fill
 * Counterparty once the party query returns), stored in state and keyed by
 * activity id. State is set only when the visible id set changes, so the resolve
 * cannot retrigger itself.
 *
 * Counterparty is a render-only column: sortable within the loaded page but not a
 * view/Advanced-Find/Export column.
 */
export class CounterpartyGridApp extends SmartComponent<
  ICounterpartyGridAppProps,
  ICounterpartyGridAppState
> {
  /** The id set we last resolved, so the party query runs once per page. */
  private resolvedSignature = "";
  /** Selected row key; drives the highlight and the command bar's state. */
  private readonly selectedKey = new Observable<string | null>(null);
  /** Set once the desired page size has been requested, so it is not re-applied. */
  private pageSizeApplied = false;

  constructor(props: ICounterpartyGridAppProps) {
    super(props);
    this.state = { counterparties: new Map(), activityTypes: [] };
  }

  override componentDidMount(): void {
    this.resolveForCurrentPage();
    void this.loadActivityTypes();
  }

  /** Asks the dataset for a usable page size once (a subgrid often defaults tiny). */
  private ensurePageSize(): void {
    const paging = this.props.dataset.paging as {
      pageSize?: number;
      setPageSize?: (size: number) => void;
    };
    if (this.pageSizeApplied || typeof paging.setPageSize !== "function") {
      return;
    }
    this.pageSizeApplied = true;
    if (paging.pageSize !== PAGE_SIZE) {
      paging.setPageSize(PAGE_SIZE);
      this.props.dataset.refresh();
    }
  }

  private async loadActivityTypes(): Promise<void> {
    try {
      const activityTypes = await this.vmContext.metadata.getActivityTypes();
      if (!this.isDisposed) {
        this.setState({ activityTypes });
      }
    } catch {
      // Leave the New flyout empty rather than break the grid.
    }
  }

  override componentDidUpdate(): void {
    this.resolveForCurrentPage();
  }

  /** Runs the party query once per visible page (guarded so it cannot loop). */
  private resolveForCurrentPage(): void {
    const dataset = this.props.dataset;
    if (dataset.loading) {
      return;
    }
    this.ensurePageSize();
    const ids = dataset.sortedRecordIds;
    const signature = ids.join(",");
    if (signature === this.resolvedSignature) {
      return;
    }
    this.resolvedSignature = signature;
    if (ids.length === 0) {
      this.setState({ counterparties: new Map() });
      return;
    }
    void this.loadCounterparties(ids, signature);
  }

  private async loadCounterparties(ids: string[], signature: string): Promise<void> {
    try {
      const counterparties = await resolveCounterparties(this.vmContext, ids);
      // Only the page still on screen may write: paging quickly back and forth
      // overlaps these loads, and a slow page's map must not land under the
      // current one.
      if (!this.isDisposed && signature === this.resolvedSignature) {
        this.setState({ counterparties });
      }
    } catch (error) {
      // Leave the counterparty cells blank rather than break the grid, but log
      // the reason, and forget the signature so the next updateView for this
      // page retries instead of showing blank columns forever.
      console.error("Counterparty resolution failed", error);
      if (!this.isDisposed && signature === this.resolvedSignature) {
        this.resolvedSignature = "";
      }
    }
  }

  /** Opens a row's activity (the Subject link, a double-click, and Edit). */
  private readonly openActivity: OpenActivity = (row) => {
    this.navigate(String(row.entityName ?? ""), String(row.recordId ?? ""));
  };

  private readonly navigate = (entity: string, id: string): void => {
    if (entity && id) {
      void this.vmContext.navigation.openForm(entity, id);
    }
  };

  /**
   * New flyout: open a create form for the chosen activity type, filed against the
   * host record (createFromEntity applies the account-to-activity mapping, so
   * regarding and any mapped parties prefill, the same as the form's timeline).
   */
  private readonly onCreate = (logicalName: string): void => {
    const host = this.props.host;
    void this.vmContext.navigation.openForm(
      host ? { entityName: logicalName, createFromEntity: host } : { entityName: logicalName }
    );
  };

  /** Edit: open the selected activity (entity resolved from its dataset record). */
  private readonly onEdit = (): void => {
    const id = this.selectedKey.value;
    const record = id ? this.props.dataset.records[id] : undefined;
    if (!record) {
      return;
    }
    const reference = record.getNamedReference() as { etn?: string; entityType?: string } | undefined;
    this.navigate(reference?.etn ?? reference?.entityType ?? "", id!);
  };

  private readonly onRefresh = (): void => {
    this.props.dataset.refresh();
  };

  private readonly onLoadMore = (): void => this.props.dataset.paging.loadNextPage();

  private renderCommandBar(): React.ReactNode {
    return (
      <ActivityCommandBar
        selectedKey={this.selectedKey}
        activityTypes={this.state.activityTypes}
        onCreate={this.onCreate}
        onEdit={this.onEdit}
        onRefresh={this.onRefresh}
      />
    );
  }

  private renderPager(): React.ReactNode {
    const paging = this.props.dataset.paging;
    return (
      <LoadMore
        hasMore={paging.hasNextPage}
        shown={this.props.dataset.sortedRecordIds.length}
        total={paging.totalResultCount ?? 0}
        onLoadMore={this.onLoadMore}
      />
    );
  }

  // No search box here on purpose: the dataset loads a page at a time (Load more),
  // so a client-side search would only see loaded rows, and the counterparty is
  // synthesized off the dataset, so it cannot be pushed to a server-side filter.
  // The webresource showcase, which loads its rows in one shot, keeps the search.
  override render(): React.ReactNode {
    const dataset = this.props.dataset;
    const columns = buildColumns(dataset, this.navigate, this.openActivity);
    if (dataset.loading) {
      return (
        <CounterpartyGridView
          columns={columns}
          rows={[]}
          loading={true}
          onOpenRow={this.openActivity}
          selectedKey={this.selectedKey}
          commandBar={this.renderCommandBar()}
        />
      );
    }
    const counterparties = this.state.counterparties;
    const rows = dataset.sortedRecordIds.map((id) =>
      buildRow(dataset, id, counterparties.get(normalizeGuid(id)))
    );
    return (
      <CounterpartyGridView
        columns={columns}
        rows={rows}
        onOpenRow={this.openActivity}
        selectedKey={this.selectedKey}
        commandBar={this.renderCommandBar()}
        pager={this.renderPager()}
      />
    );
  }
}

const usePagerStyles = makeStyles({
  pager: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
  },
  info: { color: tokens.colorNeutralForeground3 },
});

/**
 * Load-more control for the dataset. The host's paging appends the next page
 * rather than replacing it, so this is "load more" (no back step), hidden once
 * every page is loaded.
 */
const LoadMore: React.FC<{
  hasMore: boolean;
  shown: number;
  total: number;
  onLoadMore: () => void;
}> = (props) => {
  const styles = usePagerStyles();
  if (!props.hasMore) {
    return null;
  }
  return (
    <div className={styles.pager}>
      <Button size="small" appearance="subtle" onClick={props.onLoadMore}>
        Load more
      </Button>
      <Text size={200} className={styles.info}>
        {props.total > 0 ? `${props.shown} of ${props.total}` : `${props.shown} shown`}
      </Text>
    </div>
  );
};

/** A showcase column cap, in case a mis-bound view dumps far too many columns. */
const MAX_VIEW_COLUMNS = 6;

/**
 * The bound view's columns (the real curation surface is a slim "Activities
 * (Counterparty)" view), then the synthesized Counterparty column. Widths are
 * designed by data type: visualSizeFactor is a width RATIO, not pixels, so it
 * can't be used as a px width.
 */
function buildColumns(
  dataset: ComponentFramework.PropertyTypes.DataSet,
  onNavigate: (entity: string, id: string) => void,
  onOpenActivity: OpenActivity
): IGridColumn[] {
  const viewColumns: IGridColumn[] = [...dataset.columns]
    .filter((column) => !column.isHidden)
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_VIEW_COLUMNS)
    .map((column) =>
      // The subject is the way into the record (a link), so a row click can
      // select instead of navigate, like a native subgrid.
      column.name === "subject"
        ? subjectLinkColumn(column.name, column.displayName, designedWidth(column.dataType), onOpenActivity)
        : {
            key: column.name,
            name: column.displayName,
            width: designedWidth(column.dataType),
            align: isNumeric(column.dataType) ? ("end" as const) : undefined,
            sortable: !column.disableSorting,
          }
    );
  return [...viewColumns, ...counterpartyColumns(onNavigate)];
}

/** A sensible px width for a column, keyed off its manifest data type. */
function designedWidth(dataType: string | null | undefined): number {
  if (!dataType) return 200;
  if (dataType.startsWith("DateAndTime")) return 150;
  if (dataType.startsWith("Lookup")) return 180;
  if (dataType === "Multiple") return 260;
  if (dataType === "OptionSet" || dataType === "TwoOptions") return 130;
  if (isNumeric(dataType)) return 120;
  return 200;
}

function isNumeric(dataType: string | null | undefined): boolean {
  return (
    dataType === "Whole.None" ||
    dataType === "Decimal" ||
    dataType === "FP" ||
    dataType === "Money" ||
    dataType === "Currency"
  );
}

/** One grid row from a dataset record, merged with its resolved counterparty. */
function buildRow(
  dataset: ComponentFramework.PropertyTypes.DataSet,
  id: string,
  info: ICounterpartyInfo | undefined
): IGridRow {
  const record = dataset.records[id];
  const reference = record.getNamedReference() as { etn?: string; entityType?: string } | undefined;
  const row: IGridRow = {
    key: id,
    recordId: id,
    entityName: reference?.etn ?? reference?.entityType ?? "",
  };
  for (const column of dataset.columns) {
    row[column.name] = record.getFormattedValue(column.name) || record.getValue(column.name) || "";
  }
  return applyCounterparty(row, info);
}
