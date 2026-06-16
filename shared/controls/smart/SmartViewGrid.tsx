import * as React from "react";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type { IEntityMetadata, IViewDefinition } from "../../context/IViewModelContext";
import { Observable, type Unsubscribe } from "../../reactivity/Observable";
import type { ObservableEvent } from "../../reactivity/ObservableEvent";
import { formattedValue } from "../../utils/odata";
import { DataGrid, type IGridColumn, type IGridRow } from "../presentational/DataGrid";
import { Pagination } from "../presentational/Pagination";
import {
  buildSavedQueryOptions,
  type ISmartViewGridFilter,
  type ISortSpec,
} from "./viewGridQuery";

export type { ISmartViewGridFilter, ISortSpec } from "./viewGridQuery";

export interface ISmartViewGridProps {
  /** Entity logical name, e.g. "account". */
  entity: string;
  /** Saved view (savedquery) id. Omit to use the entity's default grid view. */
  viewId?: string;
  /** Saved view by display name (G-05), resolved when `viewId` is absent. */
  viewName?: string;
  /** Programmatic refresh channel, publish to re-run the view query (#2). */
  refresh?: ObservableEvent<void>;
  /**
   * Quick-find text (G-01). Contains-matched against `quickFindFields` (or the
   * entity's primary name when those are omitted), ANDed over the view query.
   */
  quickFind?: Observable<string>;
  /** Fields the quick-find text searches. Default: the entity's primary name. */
  quickFindFields?: string[];
  /** Declarative eq/ne filters (G-01), re-queried server-side on change. */
  filters?: Observable<ISmartViewGridFilter[]>;
  /** Server-side sort spec (G-01). Header clicks update it when `serverSort`. */
  orderBy?: Observable<ISortSpec | null>;
  /** Enable header-click server sorting (writes `orderBy`). */
  serverSort?: boolean;
  /**
   * Page size (G-01). When set, the grid pages server-side (`$top` + nextLink)
   * and shows a Pagination control. Visited pages are cached so "previous" is
   * instant. Omit for the whole result set in one query.
   */
  pageSize?: number;
  /**
   * Override mode (G-01): when this holds a FetchXML string, the host supplies
   * the query while the view still supplies the layout, the canonical
   * "native look, custom data" path. Null/empty falls back to the saved query.
   */
  overrideFetchXml?: Observable<string | null>;
  /** Row click → the record id behind the row. */
  onRecordSelected?: (recordId: string, row: IGridRow) => void;
  /** Host-owned selected record id for row highlight. */
  selectedRecordId?: Observable<string | null>;
  emptyMessage?: string;
}

interface ISmartViewGridState {
  loadError?: string;
}

/**
 * Read-only saved-view grid: one view id (or name) in, native-looking
 * grid out. The smart tier loads the view for its layout, runs its data via
 * `?savedQuery={id}` with quick find / filters / server sort layered on top
 * (T-01 + G-01), resolves headers from metadata, and feeds a presentational
 * DataGrid. An `overrideFetchXml` observable swaps the data source while
 * keeping the view's layout.
 */
export class SmartViewGrid extends SmartComponent<ISmartViewGridProps, ISmartViewGridState> {
  /** This wrapper is the host for grid data. */
  private readonly columns = new Observable<IGridColumn[]>([]);
  private readonly rows = new Observable<IGridRow[]>([]);
  private readonly loading = new Observable<boolean>(true);
  private readonly page = new Observable<number>(1);
  private readonly hasNextPage = new Observable<boolean>(false);
  /** Cache of visited pages (1-based) and the nextLink that follows each. */
  private readonly pageRows = new Map<number, IGridRow[]>();
  private readonly pageNextLink = new Map<number, string | undefined>();
  private readonly subscriptions: Unsubscribe[] = [];
  private quickFindTimer: ReturnType<typeof setTimeout> | undefined;
  private view: IViewDefinition | undefined;
  private entityMeta: IEntityMetadata | undefined;

  constructor(props: ISmartViewGridProps) {
    super(props);
    this.state = {};
    this.observe(
      this.columns,
      this.rows,
      this.loading,
      this.page,
      this.hasNextPage,
      props.selectedRecordId,
      props.orderBy
    );
  }

  override componentDidMount(): void {
    const reload = () => void this.loadRows();
    this.track(this.props.refresh?.subscribe(reload));
    this.track(this.props.filters?.subscribe(reload));
    this.track(this.props.orderBy?.subscribe(reload));
    this.track(this.props.overrideFetchXml?.subscribe(reload));
    // Quick find fires per keystroke, debounce the re-query.
    this.track(this.props.quickFind?.subscribe(() => this.scheduleQuickFindReload()));
    void this.initialize();
  }

  override componentWillUnmount(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    if (this.quickFindTimer) {
      clearTimeout(this.quickFindTimer);
    }
    super.componentWillUnmount();
  }

  private track(unsubscribe: Unsubscribe | undefined): void {
    if (unsubscribe) {
      this.subscriptions.push(unsubscribe);
    }
  }

  private scheduleQuickFindReload(): void {
    if (this.quickFindTimer) {
      clearTimeout(this.quickFindTimer);
    }
    this.quickFindTimer = setTimeout(() => void this.loadRows(), 300);
  }

  private async initialize(): Promise<void> {
    try {
      const view = this.props.viewId
        ? await this.vmContext.metadata.getView(this.props.entity, this.props.viewId)
        : this.props.viewName
          ? await this.vmContext.metadata.getViewByName(this.props.entity, this.props.viewName)
          : await this.vmContext.metadata.getView(this.props.entity);
      if (this.isDisposed) {
        return;
      }
      this.view = view;
      this.entityMeta = await this.vmContext.metadata.getEntityMetadata(view.entityLogicalName);
      if (this.isDisposed) {
        return;
      }
      this.columns.value = await this.resolveColumns(view);
      await this.loadRows();
    } catch (error) {
      if (!this.isDisposed) {
        this.loading.value = false;
        this.setState({
          loadError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Column headers come from attribute display names; aliased/linked columns fall back to the raw name. */
  private async resolveColumns(view: IViewDefinition): Promise<IGridColumn[]> {
    return Promise.all(
      view.columns.map(async (column) => {
        let header = column.name;
        try {
          const attribute = await this.vmContext.metadata.getAttributeMetadata(
            view.entityLogicalName,
            column.name
          );
          header = attribute.displayName;
        } catch {
          // linked-entity or aliased column, keep the raw name
        }
        return { key: column.name, name: header, width: column.width } satisfies IGridColumn;
      })
    );
  }

  private effectiveQuickFindFields(): string[] {
    if (this.props.quickFindFields && this.props.quickFindFields.length > 0) {
      return this.props.quickFindFields;
    }
    return this.entityMeta ? [this.entityMeta.primaryNameAttribute] : [];
  }

  /** Composes `?savedQuery=…` with quick find / filters / `$orderby` / `$top` (T-01 + G-01). */
  private buildQueryOptions(view: IViewDefinition): string {
    return buildSavedQueryOptions(view.id, {
      quickFindText: this.props.quickFind?.value,
      quickFindFields: this.effectiveQuickFindFields(),
      filters: this.props.filters?.value,
      orderBy: this.props.orderBy?.value,
      top: this.props.pageSize,
    });
  }

  private mapRows(view: IViewDefinition, records: Array<Record<string, unknown>>): IGridRow[] {
    const idAttribute = this.entityMeta?.primaryIdAttribute ?? `${view.entityLogicalName}id`;
    return records.map((record, index) => {
      const row: IGridRow = { key: String(record[idAttribute] ?? index) };
      for (const column of view.columns) {
        row[column.name] = formattedValue(record, column.name) ?? record[column.name] ?? "";
      }
      return row;
    });
  }

  /** Loads the first page, resetting any paging cache (called on every query change). */
  private async loadRows(): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }
    this.loading.value = true;
    try {
      const override = this.props.overrideFetchXml?.value;
      const result = override
        ? await this.vmContext.webAPI.fetch(view.entityLogicalName, override)
        : await this.vmContext.webAPI.retrieveMultipleRecords(
            view.entityLogicalName,
            this.buildQueryOptions(view)
          );
      if (this.isDisposed) {
        return;
      }
      const rows = this.mapRows(view, result.entities);
      this.pageRows.clear();
      this.pageNextLink.clear();
      if (this.props.pageSize) {
        this.pageRows.set(1, rows);
        this.pageNextLink.set(1, result.nextLink);
        this.page.value = 1;
        this.hasNextPage.value = !!result.nextLink;
      }
      this.rows.value = rows;
    } finally {
      if (!this.isDisposed) {
        this.loading.value = false;
      }
    }
  }

  private applyPage(pageNumber: number): void {
    this.rows.value = this.pageRows.get(pageNumber) ?? [];
    this.page.value = pageNumber;
    this.hasNextPage.value =
      this.pageRows.has(pageNumber + 1) || !!this.pageNextLink.get(pageNumber);
  }

  private readonly goNext = async (): Promise<void> => {
    const view = this.view;
    if (!view) {
      return;
    }
    const target = this.page.value + 1;
    if (this.pageRows.has(target)) {
      this.applyPage(target);
      return;
    }
    const nextLink = this.pageNextLink.get(this.page.value);
    if (!nextLink) {
      return;
    }
    this.loading.value = true;
    try {
      const result = await this.vmContext.webAPI.retrieveMultipleByUrl(nextLink);
      if (this.isDisposed) {
        return;
      }
      this.pageRows.set(target, this.mapRows(view, result.entities));
      this.pageNextLink.set(target, result.nextLink);
      this.applyPage(target);
    } finally {
      if (!this.isDisposed) {
        this.loading.value = false;
      }
    }
  };

  private readonly goPrevious = (): void => {
    const target = this.page.value - 1;
    if (target >= 1) {
      this.applyPage(target);
    }
  };

  private readonly handleRowClick = (row: IGridRow): void => {
    if (this.props.selectedRecordId) {
      this.props.selectedRecordId.value = row.key;
    }
    this.props.onRecordSelected?.(row.key, row);
  };

  private readonly handleColumnSort = (columnKey: string, descending: boolean): void => {
    if (this.props.orderBy) {
      this.props.orderBy.value = { attribute: columnKey, descending };
    }
  };

  override render(): React.ReactNode {
    if (this.state.loadError) {
      return <div role="alert">Could not load view: {this.state.loadError}</div>;
    }
    const sort = this.props.orderBy?.value;
    return (
      <>
        <DataGrid
          columns={this.columns}
          rows={this.rows}
          loading={this.loading}
          emptyMessage={this.props.emptyMessage}
          onRowClick={
            this.props.onRecordSelected || this.props.selectedRecordId
              ? this.handleRowClick
              : undefined
          }
          selectedKey={this.props.selectedRecordId}
          onColumnSort={this.props.serverSort ? this.handleColumnSort : undefined}
          sortState={sort ? { columnKey: sort.attribute, descending: !!sort.descending } : null}
        />
        {this.props.pageSize ? (
          <Pagination
            page={this.page}
            hasNextPage={this.hasNextPage}
            onPrevious={this.goPrevious}
            onNext={() => void this.goNext()}
            disabled={this.loading}
          />
        ) : null}
      </>
    );
  }
}
