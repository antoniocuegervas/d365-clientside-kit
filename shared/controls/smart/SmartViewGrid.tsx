import * as React from "react";
import { Link } from "@fluentui/react-components";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type {
  AttributeKind,
  IEntityMetadata,
  IViewDefinition,
} from "../../context/IViewModelContext";
import { Observable, type Unsubscribe } from "../../reactivity/Observable";
import type { ObservableEvent } from "../../reactivity/ObservableEvent";
import {
  aliasedLookupCell,
  formattedValue,
  lookupCell,
  splitAliasedColumn,
  type ILookupCell,
} from "../../utils/odata";
import { DataGrid, type IGridColumn, type IGridRow } from "../presentational/DataGrid";
import { Pagination } from "../presentational/Pagination";
import { resolveDynamicSource, type IDynamicColumnSpec } from "./dynamicColumns";

export type {
  IDynamicColumnSpec,
  IDynamicColumnSource,
  IResolvedSource,
} from "./dynamicColumns";
import {
  buildSavedQueryOptions,
  type ISmartViewGridFilter,
  type ISortSpec,
} from "./viewGridQuery";
import { addRootFilter, setFetchPaging, setRootOrder, type IFetchCondition } from "./fetchXmlPaging";

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
   * Dynamic/polymorphic columns (G-16), keyed by layout column name (to replace
   * that column's rendering) or a synthetic `calc_*` key (appended to the grid).
   * Each resolves its cell from 2+ source fields with per-source formatting.
   */
  columnOverrides?: Record<string, IDynamicColumnSpec>;
  /**
   * Page size (G-01). When set, the grid pages server-side and shows a
   * Pagination control. Omit for the whole result set in one query.
   */
  pageSize?: number;
  /**
   * Paging mode (N-04). `"simple"` (default) is forward-cookie next/prev over
   * `@odata.nextLink`, visited pages cached so "previous" is instant.
   * `"rich"` enables jump-to-any-page, first/last, and a total count via
   * FetchXML `page`/`count` (the only server-side random-page mechanism in
   * Dataverse). Requires `pageSize`.
   */
  pagination?: "simple" | "rich";
  /**
   * Raised on every page change (N-04). For the `overrideFetchXml` + rich case
   * the grid is controlled: it raises this and the host re-supplies that page's
   * FetchXML (host owns the `page`/`count` injection).
   */
  onPageChange?: (pageNumber: number) => void;
  /**
   * Host-supplied total page count (N-04), for the `overrideFetchXml` + rich
   * case where the grid can't compute it. Null when unknown (degrades to
   * next/prev). Ignored for the saved-view path (the grid computes it).
   */
  pageCount?: Observable<number | null>;
  /** Host-supplied total record count (N-04), for the "X–Y of N" label in override mode. */
  totalRecordCount?: Observable<number | null>;
  /** Host-owned current page (N-04), the grid writes its page changes here. */
  currentPage?: Observable<number>;
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
  /**
   * Row invoke (double-click / Enter), distinct from select (G-01). Defaults
   * to opening the record's form; pass to override.
   */
  onItemInvoked?: (recordId: string, row: IGridRow) => void;
  /** Enable multi-select checkboxes (G-01). */
  multiSelect?: boolean;
  /** Host-owned set of selected record ids for multi-select. */
  selectedRecordIds?: Observable<string[]>;
  /** Raised when the multi-select set changes. */
  onSelectedRecords?: (recordIds: string[]) => void;
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
  /** Rich-mode total page count / record count (null = unknown). */
  private readonly pageCountObs = new Observable<number | null>(null);
  private readonly totalCountObs = new Observable<number | null>(null);
  /** Cache of visited pages (1-based) and the nextLink that follows each. */
  private readonly pageRows = new Map<number, IGridRow[]>();
  private readonly pageNextLink = new Map<number, string | undefined>();
  private readonly subscriptions: Unsubscribe[] = [];
  private readonly columnKinds = new Map<string, AttributeKind>();
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
    // Rich override mode: mirror host-supplied totals into the grid's observables.
    if (this.props.pageCount) {
      this.pageCountObs.value = this.props.pageCount.value;
      this.track(this.props.pageCount.subscribe((value) => (this.pageCountObs.value = value)));
    }
    if (this.props.totalRecordCount) {
      this.totalCountObs.value = this.props.totalRecordCount.value;
      this.track(this.props.totalRecordCount.subscribe((value) => (this.totalCountObs.value = value)));
    }
    void this.initialize();
  }

  private richMode(): boolean {
    return this.props.pagination === "rich" && !!this.props.pageSize;
  }

  /** Rich paging the grid drives itself (saved view, no host override). */
  private isRichSavedView(): boolean {
    return this.richMode() && !this.props.overrideFetchXml;
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

  /**
   * Column headers come from attribute display names, resolved against each
   * column's OWNING entity (`relatedEntity` for link-entity/aliased columns,
   * else the view's root), N-01. Attribute kinds are captured so cells render
   * type-aware (G-01), lookup columns become clickable links that openForm.
   */
  private async resolveColumns(view: IViewDefinition): Promise<IGridColumn[]> {
    const overrides = this.props.columnOverrides ?? {};
    const layoutColumns = await Promise.all(
      view.columns.map(async (column) => {
        const override = overrides[column.name];
        if (override) {
          return this.toDynamicColumn(column.name, override, column.width);
        }
        const owningEntity = column.relatedEntity ?? view.entityLogicalName;
        const { logicalName } = splitAliasedColumn(column.name);
        let header = column.name;
        let kind: AttributeKind | undefined;
        try {
          const attribute = await this.vmContext.metadata.getAttributeMetadata(
            owningEntity,
            logicalName
          );
          header = attribute.displayName;
          kind = attribute.kind;
          this.columnKinds.set(column.name, kind);
        } catch {
          // metadata unavailable for this column, keep the raw name, no kind
        }
        const base: IGridColumn = { key: column.name, name: header, width: column.width };
        // Lookups, link-entity columns, and DisableSorting cells can't be
        // sorted through the savedQuery layer (T-01 boundary).
        if (kind === "lookup" || column.relatedEntity || column.disableSorting) {
          base.sortable = false;
        }
        if (kind === "lookup") {
          base.onRender = (row) => this.renderLookupCell(row[column.name]);
        }
        return base;
      })
    );
    // Synthetic calc_* override columns (not in the layout) are appended.
    const layoutNames = new Set(view.columns.map((column) => column.name));
    for (const [key, spec] of Object.entries(overrides)) {
      if (!layoutNames.has(key)) {
        layoutColumns.push(this.toDynamicColumn(key, spec));
      }
    }
    return layoutColumns;
  }

  /** Builds a grid column for a dynamic/polymorphic spec (G-16). */
  private toDynamicColumn(key: string, spec: IDynamicColumnSpec, width?: number): IGridColumn {
    return {
      key,
      name: spec.header,
      width,
      sortable: !!spec.sort?.comparator,
      comparator: spec.sort?.comparator,
      onRender: (row) => row[key] as React.ReactNode,
    };
  }

  /** Resolves a dynamic cell to a node by probing the spec's sources in order. */
  private renderDynamicCell(
    spec: IDynamicColumnSpec,
    record: Record<string, unknown>,
    row: IGridRow
  ): React.ReactNode {
    const resolved = resolveDynamicSource(record, spec);
    if (!resolved) {
      return "";
    }
    if (resolved.source.render) {
      return resolved.source.render(row, resolved.value);
    }
    if (resolved.isLookup) {
      return this.renderLookupCell(resolved.value);
    }
    return String(resolved.value);
  }

  /** Renders a lookup cell as a link that opens the referenced record's form. */
  private renderLookupCell(value: unknown): React.ReactNode {
    if (!value || typeof value === "string") {
      return (value as string) ?? "";
    }
    const cell = value as ILookupCell;
    if (!cell.id || !cell.target) {
      return cell.name ?? "";
    }
    return (
      <Link
        href="#"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.vmContext.navigation.openForm(cell.target, cell.id);
        }}
      >
        {cell.name || "(open)"}
      </Link>
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
    const overrides = this.props.columnOverrides ?? {};
    return records.map((record, index) => {
      const row: IGridRow = { key: String(record[idAttribute] ?? index) };
      for (const column of view.columns) {
        if (overrides[column.name]) {
          continue; // resolved below as a dynamic cell
        }
        if (this.columnKinds.get(column.name) === "lookup") {
          // Related-entity lookups ride alias-qualified keys, not the
          // `_attr_value` triplet (N-01).
          const cell = column.relatedEntity
            ? aliasedLookupCell(record, column.name)
            : lookupCell(record, column.name);
          row[column.name] = cell ?? "";
        } else {
          row[column.name] = formattedValue(record, column.name) ?? record[column.name] ?? "";
        }
      }
      // Dynamic/polymorphic columns (G-16): resolve a node per spec.
      for (const [key, spec] of Object.entries(overrides)) {
        row[key] = this.renderDynamicCell(spec, record, row);
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
    // Rich saved-view paging is page-driven via FetchXML (N-04), load page 1
    // and request the total once.
    if (this.isRichSavedView()) {
      await this.loadRichPage(1, true);
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
      // Simple forward-cookie paging cache (not rich, rich is page-driven and
      // host-controlled in the override case).
      if (this.props.pageSize && !this.richMode()) {
        this.pageRows.clear();
        this.pageNextLink.clear();
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

  /** Composes the rich-mode FetchXML: view query + filters/quick-find/sort (N-04). */
  private buildRichFetchXml(view: IViewDefinition): string {
    let fetch = view.fetchXml;
    // Declarative filters → one AND filter (root attributes only).
    const filters: IFetchCondition[] = (this.props.filters?.value ?? [])
      .filter((filter) => filter.value !== null && filter.value !== undefined)
      .map((filter) => ({
        attribute: filter.attribute,
        operator: filter.operator ?? "eq",
        value: filter.value as string | number | boolean,
      }));
    if (filters.length > 0) {
      fetch = addRootFilter(fetch, filters, "and");
    }
    // Quick find → one OR filter of `like` conditions across the search fields.
    const text = this.props.quickFind?.value?.trim();
    if (text) {
      const conditions: IFetchCondition[] = this.effectiveQuickFindFields().map((field) => ({
        attribute: field,
        operator: "like",
        value: `%${text}%`,
      }));
      if (conditions.length > 0) {
        fetch = addRootFilter(fetch, conditions, "or");
      }
    }
    // Server sort.
    const orderBy = this.props.orderBy?.value;
    if (orderBy) {
      fetch = setRootOrder(fetch, orderBy.attribute, !!orderBy.descending);
    }
    return fetch;
  }

  /** Fetches a specific page via FetchXML `page`/`count` (rich saved-view path). */
  private async loadRichPage(target: number, requestTotal: boolean): Promise<void> {
    const view = this.view;
    if (!view || target < 1) {
      return;
    }
    this.loading.value = true;
    try {
      const paged = setFetchPaging(this.buildRichFetchXml(view), {
        page: target,
        count: this.props.pageSize!,
        returnTotalRecordCount: requestTotal,
      });
      const result = await this.vmContext.webAPI.fetchPage(view.entityLogicalName, paged);
      if (this.isDisposed) {
        return;
      }
      this.rows.value = this.mapRows(view, result.entities);
      this.page.value = target;
      this.syncCurrentPage(target);
      if (requestTotal) {
        if (typeof result.totalRecordCount === "number" && !result.totalRecordCountLimitExceeded) {
          this.totalCountObs.value = result.totalRecordCount;
          this.pageCountObs.value = Math.max(
            1,
            Math.ceil(result.totalRecordCount / this.props.pageSize!)
          );
        } else {
          // Unknown/over-cap total, degrade to next/prev via moreRecords.
          this.totalCountObs.value = null;
          this.pageCountObs.value = null;
        }
      }
      this.hasNextPage.value =
        result.moreRecords ??
        (typeof this.pageCountObs.value === "number" ? target < this.pageCountObs.value : false);
    } finally {
      if (!this.isDisposed) {
        this.loading.value = false;
      }
    }
  }

  /** Jump to a page (rich): saved-view fetches it; override mode hands off to the host. */
  private readonly goToPage = async (target: number): Promise<void> => {
    if (!this.view || target < 1) {
      return;
    }
    const pageCount = this.pageCountObs.value;
    if (typeof pageCount === "number" && target > pageCount) {
      return;
    }
    if (this.isRichSavedView()) {
      await this.loadRichPage(target, false);
    } else {
      // Override + rich: the grid is controlled, track the page and let the
      // host re-supply the rows via overrideFetchXml.
      this.page.value = target;
      this.syncCurrentPage(target);
    }
    this.props.onPageChange?.(target);
  };

  private syncCurrentPage(page: number): void {
    if (this.props.currentPage && this.props.currentPage.value !== page) {
      this.props.currentPage.value = page;
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

  /**
   * Invoke (double-click / Enter): override prop, else open the record's form.
   * Activity views are special-cased (N-08): `activitypointer` is not an
   * openable form, so the real activity type is resolved per row from the
   * `activitytypecode` formatted value (e.g. "phonecall") and the id from
   * `activityid` (the row key). A readable error surfaces when the view doesn't
   * carry `activitytypecode`.
   */
  private readonly handleItemInvoked = (row: IGridRow): void => {
    if (this.props.onItemInvoked) {
      this.props.onItemInvoked(row.key, row);
      return;
    }
    const view = this.view;
    if (!view) {
      return;
    }
    if (view.entityLogicalName === "activitypointer") {
      const realType = row.activitytypecode;
      if (typeof realType !== "string" || !realType) {
        void this.vmContext.navigation.openErrorDialog({
          message: "Activity Type Code is required on the view to open the records.",
        });
        return;
      }
      void this.vmContext.navigation.openForm(realType, row.key);
      return;
    }
    void this.vmContext.navigation.openForm(view.entityLogicalName, row.key);
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
          onItemInvoked={this.handleItemInvoked}
          multiSelect={this.props.multiSelect}
          selectedKeys={this.props.selectedRecordIds}
          onSelectionChange={this.props.onSelectedRecords}
          onColumnSort={this.props.serverSort ? this.handleColumnSort : undefined}
          sortState={sort ? { columnKey: sort.attribute, descending: !!sort.descending } : null}
        />
        {this.props.pageSize ? (
          this.richMode() ? (
            <Pagination
              page={this.page}
              pageCount={this.pageCountObs}
              totalRecordCount={this.totalCountObs}
              pageSize={this.props.pageSize}
              hasNextPage={this.hasNextPage}
              onFirst={() => void this.goToPage(1)}
              onPrevious={() => void this.goToPage(this.page.value - 1)}
              onNext={() => void this.goToPage(this.page.value + 1)}
              onLast={() => void this.goToPage(this.pageCountObs.value ?? this.page.value)}
              onGoToPage={(pageNumber) => void this.goToPage(pageNumber)}
              disabled={this.loading}
            />
          ) : (
            <Pagination
              page={this.page}
              hasNextPage={this.hasNextPage}
              onPrevious={this.goPrevious}
              onNext={() => void this.goNext()}
              disabled={this.loading}
            />
          )
        ) : null}
      </>
    );
  }
}
