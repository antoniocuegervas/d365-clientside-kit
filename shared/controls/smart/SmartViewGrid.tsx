import * as React from "react";
import { Link } from "@fluentui/react-components";
import { SmartComponent } from "../../context/ViewModelContextProvider";
import type {
  AttributeKind,
  IEntityMetadata,
  IViewDefinition,
} from "../../context/IViewModelContext";
import { Observable, type Unsubscribe } from "../../reactivity/Observable";
import { ObservableArray } from "../../reactivity/ObservableArray";
import type { ObservableEvent } from "../../reactivity/ObservableEvent";
import { LibraryUtils } from "../../utils/LibraryUtils";
import { DataGrid, type IGridColumn, type IGridRow } from "../presentational/DataGrid";
import { DegradedState } from "../presentational/DegradedState";
import { Pagination } from "../presentational/Pagination";

// Query composition, FetchXML paging, cell readers, and dynamic-column logic
// are defined at the BOTTOM of this file (grid-internal, exported there only
// for unit tests, not re-exported from the kit barrel).

export interface ISmartViewGridProps {
  /** Entity logical name, e.g. "account". */
  entity: string;
  /** Saved view (savedquery) id. Omit to use the entity's default grid view. */
  viewId?: string;
  /** Saved view by display name, resolved when `viewId` is absent. */
  viewName?: string;
  /** Programmatic refresh channel: publish to re-run the view query. */
  refresh?: ObservableEvent<void>;
  /**
   * Quick-find text. Contains-matched against `quickFindFields` (or the
   * entity's primary name when those are omitted), ANDed over the view query.
   */
  quickFind?: Observable<string>;
  /** Fields the quick-find text searches. Default: the entity's primary name. */
  quickFindFields?: string[];
  /** Declarative eq/ne filters, re-queried server-side on change. */
  filters?: Observable<ISmartViewGridFilter[]>;
  /**
   * Optional sort spec the grid reads and writes. The grid keeps its own sort
   * internally, so `serverSort` works without this; pass it only to seed an
   * initial sort or to read the current one.
   */
  orderBy?: Observable<ISortSpec | null>;
  /**
   * The on/off switch for sorting. When true, header clicks sort on the server
   * by re-querying. When false or omitted, the grid does not sort at all (it
   * never sorts a loaded page in memory).
   */
  serverSort?: boolean;
  /**
   * Dynamic/polymorphic columns, keyed by layout column name (to replace
   * that column's rendering) or a synthetic `calc_*` key (appended to the grid).
   * Each resolves its cell from 2+ source fields with per-source formatting.
   */
  columnOverrides?: Record<string, IDynamicColumnSpec>;
  /**
   * Page size. When set, the grid pages server-side and shows a
   * Pagination control. Omit for the whole result set in one query.
   */
  pageSize?: number;
  /**
   * Paging mode. `"simple"` (default) is forward-cookie next/prev over
   * `@odata.nextLink`, visited pages cached so "previous" is instant.
   * `"rich"` enables jump-to-any-page, first/last, and a total count via
   * FetchXML `page`/`count` (the only server-side random-page mechanism in
   * Dataverse). Requires `pageSize`.
   */
  pagination?: "simple" | "rich";
  /**
   * Raised on every page change. For the `overrideFetchXml` + rich case
   * the grid is controlled: it raises this and the host re-supplies that page's
   * FetchXML (host owns the `page`/`count` injection).
   */
  onPageChange?: (pageNumber: number) => void;
  /**
   * Host-supplied total page count, for the `overrideFetchXml` + rich
   * case where the grid can't compute it. Null when unknown (degrades to
   * next/prev). Ignored for the saved-view path (the grid computes it).
   */
  pageCount?: Observable<number | null>;
  /** Host-supplied total record count, for the "X–Y of N" label in override mode. */
  totalRecordCount?: Observable<number | null>;
  /** Host-owned current page, the grid writes its page changes here. */
  currentPage?: Observable<number>;
  /**
   * Override mode: when this holds a FetchXML string, the host supplies
   * the query while the view still supplies the layout, the standard
   * "native look, custom data" path. Null/empty falls back to the saved query.
   */
  overrideFetchXml?: Observable<string | null>;
  /** Row click → the record id behind the row. */
  onRecordSelected?: (recordId: string, row: IGridRow) => void;
  /** Host-owned selected record id for row highlight. */
  selectedRecordId?: Observable<string | null>;
  /**
   * Row invoke (double-click / Enter), distinct from select. Defaults
   * to opening the record's form; pass to override.
   */
  onItemInvoked?: (recordId: string, row: IGridRow) => void;
  /** Enable multi-select checkboxes. */
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
 * `?savedQuery={id}` with quick find / filters / server sort layered on top,
 * resolves headers from metadata, and feeds a presentational DataGrid. An
 * `overrideFetchXml` observable swaps the data source while keeping the view's
 * layout.
 */
export class SmartViewGrid extends SmartComponent<ISmartViewGridProps, ISmartViewGridState> {
  /** This wrapper is the host for grid data. */
  private readonly columns = new Observable<IGridColumn[]>([]);
  private readonly rows = new ObservableArray<IGridRow>();
  /** Grid-owned sort, used when the host does not supply an `orderBy`. */
  private readonly internalSort = new Observable<ISortSpec | null>(null);
  private readonly loading = new Observable<boolean>(true);
  private readonly page = new Observable<number>(1);
  private readonly hasNextPage = new Observable<boolean>(false);
  /** Rich-mode total page count / record count (null = unknown). */
  private readonly pageCountObs = new Observable<number | null>(null);
  private readonly totalCountObs = new Observable<number | null>(null);
  /** Records on the current page, for the pagination range label. */
  private readonly pageRecordCount = new Observable<number | null>(0);
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
      props.orderBy,
      this.internalSort
    );
  }

  override componentDidMount(): void {
    const reload = () => void this.loadRows();
    this.track(this.props.refresh?.subscribe(reload));
    this.track(this.props.filters?.subscribe(reload));
    this.track(this.sortTarget().subscribe(reload));
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

  /** The active sort source: the host's `orderBy` when given, else the grid's own. */
  private sortTarget(): Observable<ISortSpec | null> {
    return this.props.orderBy ?? this.internalSort;
  }

  private richMode(): boolean {
    return this.props.pagination === "rich" && !!this.props.pageSize;
  }

  /** Rich paging the grid drives itself (saved view, no host override). */
  private isRichSavedView(): boolean {
    return this.richMode() && !this.props.overrideFetchXml;
  }

  protected override onUnmount(): void {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    if (this.quickFindTimer) {
      clearTimeout(this.quickFindTimer);
    }
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
        // Never surface raw SDK text; log for developers, show a friendly banner.
        console.error("SmartViewGrid view load failed", error);
        this.loading.value = false;
        this.setState({
          loadError: "This view could not be loaded in this environment.",
        });
      }
    }
  }

  /**
   * Column headers come from attribute display names, resolved against each
   * column's OWNING entity (`relatedEntity` for link-entity/aliased columns,
   * else the view's root). Attribute kinds are captured so cells render
   * type-aware: lookup columns become clickable links that openForm.
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
        // Sorting is opt-in through `serverSort` and always done on the query, so
        // only real root attributes are sortable: lookups, link-entity columns,
        // and DisableSorting cells can't ride the savedQuery `$orderby` (a
        // platform boundary). Without `serverSort` nothing is sortable, so the
        // grid never sorts a single page of rows in memory.
        const serverSortable =
          !!this.props.serverSort &&
          kind !== "lookup" &&
          !column.relatedEntity &&
          !column.disableSorting;
        const base: IGridColumn = {
          key: column.name,
          name: header,
          width: column.width,
          sortable: serverSortable,
        };
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

  /** Builds a grid column for a dynamic/polymorphic spec. */
  private toDynamicColumn(key: string, spec: IDynamicColumnSpec, width?: number): IGridColumn {
    return {
      key,
      name: spec.header,
      width,
      // A dynamic column derives its cell from 2+ source fields, so there is no
      // single server field to order by; it is not sortable.
      sortable: false,
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

  /** Composes `?savedQuery=…` with quick find / filters / `$orderby` / `$top`. */
  private buildQueryOptions(view: IViewDefinition): string {
    // Page size rides the odata.maxpagesize preference (see loadRows), NOT
    // $top: $top caps the result and suppresses the nextLink simple paging
    // follows, leaving the grid stuck on page one.
    return buildSavedQueryOptions(view.id, {
      quickFindText: this.props.quickFind?.value,
      quickFindFields: this.effectiveQuickFindFields(),
      filters: this.props.filters?.value,
      orderBy: this.sortTarget().value,
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
          // `_attr_value` triplet.
          const cell = column.relatedEntity
            ? aliasedLookupCell(record, column.name)
            : lookupCell(record, column.name);
          row[column.name] = cell ?? "";
        } else {
          row[column.name] = LibraryUtils.formattedValue(record, column.name) ?? record[column.name] ?? "";
        }
      }
      // Dynamic/polymorphic columns: resolve a node per spec.
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
    // Rich saved-view paging is page-driven via FetchXML, load page 1
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
            this.buildQueryOptions(view),
            this.props.pageSize
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
      this.pageRecordCount.value = rows.length;
    } finally {
      if (!this.isDisposed) {
        this.loading.value = false;
      }
    }
  }

  /** Composes the rich-mode FetchXML: view query + filters/quick-find/sort. */
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
    const orderBy = this.sortTarget().value;
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
      const mapped = this.mapRows(view, result.entities);
      this.rows.value = mapped;
      this.pageRecordCount.value = mapped.length;
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
    const pageData = this.pageRows.get(pageNumber) ?? [];
    this.rows.value = pageData;
    this.pageRecordCount.value = pageData.length;
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
      // Re-send the page size: the nextLink cookie does not carry it, and without
      // it the server returns its default page size instead of pageSize rows.
      const result = await this.vmContext.webAPI.retrieveMultipleByUrl(
        nextLink,
        this.props.pageSize
      );
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
    // Server sort: record the new spec and re-query. Writes to the host's
    // orderBy when supplied, otherwise to the grid's own sort state.
    this.sortTarget().value = { attribute: columnKey, descending };
  };

  /**
   * Invoke (double-click / Enter): override prop, else open the record's form.
   * Activity views are special-cased: `activitypointer` is not an
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
      // The row carries the real type in the activitytypecode formatted value
      // (e.g. "phonecall"). Normalize casing and whitespace: entity logical names
      // are always lowercase, so a stray case or space difference would otherwise
      // route us to a form that does not exist. See the activity-type gotcha for
      // the locale limit of reading the formatted value.
      const rawType = row.activitytypecode;
      const realType = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
      if (!realType) {
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
      return <DegradedState message={this.state.loadError} />;
    }
    const sort = this.sortTarget().value;
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
              pageRecordCount={this.pageRecordCount}
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
              pageSize={this.props.pageSize}
              pageRecordCount={this.pageRecordCount}
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

// Grid-internal helpers, inlined so the grid is understandable from one file
// (no scavenger hunt across helper modules). Exported for unit tests only; the
// kit barrel does NOT re-export these.

/** Root-entity attributes only, dotted (link-entity) names can't be filtered/sorted. */
const isRootAttribute = (field: string): boolean => !field.includes(".");

/** XML-escapes a value for a FetchXML attribute literal. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

//#region savedQuery OData composition

export interface ISmartViewGridFilter {
  attribute: string;
  /** Comparison operator. Default "eq". */
  operator?: "eq" | "ne";
  /** Skipped entirely when null/undefined. */
  value: string | number | boolean | null | undefined;
}

export interface ISortSpec {
  attribute: string;
  descending?: boolean;
}

export interface IViewQueryParams {
  quickFindText?: string;
  quickFindFields?: string[];
  filters?: ISmartViewGridFilter[];
  orderBy?: ISortSpec | null;
  top?: number;
}

/** quickFind AND filter1 AND … , or undefined when nothing applies. Root attrs only. */
export function composeFilterExpression(params: IViewQueryParams): string | undefined {
  const clauses: string[] = [];
  const text = params.quickFindText?.trim();
  if (text) {
    const escaped = LibraryUtils.escapeODataString(text);
    const contains = (params.quickFindFields ?? [])
      .filter(isRootAttribute)
      .map((field) => `contains(${field},'${escaped}')`);
    if (contains.length === 1) {
      clauses.push(contains[0]);
    } else if (contains.length > 1) {
      clauses.push(`(${contains.join(" or ")})`);
    }
  }
  for (const filter of params.filters ?? []) {
    if (filter.value === null || filter.value === undefined) {
      continue;
    }
    if (!isRootAttribute(filter.attribute)) {
      continue;
    }
    clauses.push(`${filter.attribute} ${filter.operator ?? "eq"} ${LibraryUtils.formatODataValue(filter.value)}`);
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

/** e.g. "createdon desc", undefined for link-entity attributes or no sort. */
export function composeOrderBy(orderBy: ISortSpec | null | undefined): string | undefined {
  if (!orderBy || !isRootAttribute(orderBy.attribute)) {
    return undefined;
  }
  return `${orderBy.attribute}${orderBy.descending ? " desc" : " asc"}`;
}

/** Builds `?savedQuery=…[&$filter=…][&$orderby=…][&$top=…]`. */
export function buildSavedQueryOptions(viewId: string, params: IViewQueryParams): string {
  const parts = [`savedQuery=${viewId}`];
  const filter = composeFilterExpression(params);
  if (filter) {
    parts.push(`$filter=${filter}`);
  }
  const orderBy = composeOrderBy(params.orderBy);
  if (orderBy) {
    parts.push(`$orderby=${orderBy}`);
  }
  if (params.top) {
    parts.push(`$top=${params.top}`);
  }
  return `?${parts.join("&")}`;
}

//#endregion

//#region FetchXML mutation for rich paging

export interface IFetchPagingOptions {
  /** 1-based page → `page` attribute. */
  page: number;
  /** Page size → `count` attribute. */
  count: number;
  /** Add `returntotalrecordcount='true'` to fetch the (capped) total once. */
  returnTotalRecordCount?: boolean;
}

export interface IFetchCondition {
  attribute: string;
  operator: string;
  value?: string | number | boolean;
}

/** Sets page/count (+ optional total) on the root <fetch>, stripping conflicting attrs. */
export function setFetchPaging(fetchXml: string, options: IFetchPagingOptions): string {
  return fetchXml.replace(/<fetch\b([^>]*?)(\/?)>/, (_match, attrs: string, selfClose: string) => {
    const cleaned = attrs.replace(
      /\s+(page|count|top|paging-cookie|returntotalrecordcount)="[^"]*"/g,
      ""
    );
    let injected = ` page="${options.page}" count="${options.count}"`;
    if (options.returnTotalRecordCount) {
      injected += ` returntotalrecordcount="true"`;
    }
    return `<fetch${cleaned}${injected}${selfClose}>`;
  });
}

/** Inserts a `<filter type>` with conditions just inside the root `<entity>`. Root attrs only. */
export function addRootFilter(
  fetchXml: string,
  conditions: IFetchCondition[],
  type: "and" | "or" = "and"
): string {
  const usable = conditions.filter((condition) => isRootAttribute(condition.attribute));
  if (usable.length === 0) {
    return fetchXml;
  }
  const inner = usable
    .map((condition) => {
      const valueAttr =
        condition.value === undefined ? "" : ` value="${xmlEscape(String(condition.value))}"`;
      return `<condition attribute="${condition.attribute}" operator="${condition.operator}"${valueAttr} />`;
    })
    .join("");
  const filterXml = `<filter type="${type}">${inner}</filter>`;
  return fetchXml.replace(/(<entity\b[^>]*>)/, `$1${filterXml}`);
}

/** Replaces the root entity's `<order>` with a single host order. Root attrs only. */
export function setRootOrder(fetchXml: string, attribute: string, descending: boolean): string {
  if (!isRootAttribute(attribute)) {
    return fetchXml;
  }
  const withoutOrders = fetchXml
    .replace(/<order\b[^>]*\/>/g, "")
    .replace(/<order\b[^>]*>\s*<\/order>/g, "");
  const orderXml = `<order attribute="${attribute}" descending="${descending ? "true" : "false"}" />`;
  return withoutOrders.replace(/(<\/entity>)/, `${orderXml}$1`);
}

//#endregion

//#region Web API record cell readers

export interface ILookupCell {
  id: string;
  name: string;
  /** Target entity logical name from the lookuplogicalname annotation. */
  target: string;
}

/** Reads a root lookup from the `_attr_value` triplet, or null when empty. */
export function lookupCell(
  record: Record<string, unknown>,
  attributeLogicalName: string
): ILookupCell | null {
  const idKey = `_${attributeLogicalName}_value`;
  const id = record[idKey];
  if (id === null || id === undefined || id === "") {
    return null;
  }
  const name = record[`${idKey}@OData.Community.Display.V1.FormattedValue`];
  const target = record[`${idKey}@Microsoft.Dynamics.CRM.lookuplogicalname`];
  return {
    id: String(id),
    name: name !== undefined ? String(name) : "",
    target: target !== undefined ? String(target) : "",
  };
}

/** Splits an aliased layout column (`alias.attr`) into its parts. */
export function splitAliasedColumn(columnName: string): { alias?: string; logicalName: string } {
  const dot = columnName.indexOf(".");
  if (dot < 0) {
    return { logicalName: columnName };
  }
  return { alias: columnName.slice(0, dot), logicalName: columnName.slice(dot + 1) };
}

/** Reads a link-entity lookup from its alias-qualified keys, or null when empty. */
export function aliasedLookupCell(
  record: Record<string, unknown>,
  columnName: string
): ILookupCell | null {
  const id = record[columnName];
  if (id === null || id === undefined || id === "") {
    return null;
  }
  const name = record[`${columnName}@OData.Community.Display.V1.FormattedValue`];
  const target = record[`${columnName}@Microsoft.Dynamics.CRM.lookuplogicalname`];
  return {
    id: String(id),
    name: name !== undefined ? String(name) : "",
    target: target !== undefined ? String(target) : "",
  };
}

//#endregion

//#region Dynamic / polymorphic columns

export interface IDynamicColumnSource {
  /** Source attribute (supports the aliased "alias.attr" form). */
  field: string;
  kind?: "lookup" | "text" | "formatted" | "custom";
  render?: (row: IGridRow, value: unknown) => React.ReactNode;
}

export interface IDynamicColumnSpec {
  header: string;
  /** Probed in order; the first source with a value renders the cell. */
  sources: IDynamicColumnSource[];
  filter?: (criteria: unknown) => string;
}

export interface IResolvedSource {
  source: IDynamicColumnSource;
  value: unknown;
  /** True when `value` is an ILookupCell (render as a link). */
  isLookup: boolean;
}

const hasValue = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== "";

/** Reads one source's value per its kind, or null when empty. */
function readSource(
  record: Record<string, unknown>,
  source: IDynamicColumnSource
): IResolvedSource | null {
  if (source.kind === "lookup") {
    const cell = lookupCell(record, source.field);
    return cell ? { source, value: cell, isLookup: true } : null;
  }
  if (source.kind === "formatted") {
    const formatted = LibraryUtils.formattedValue(record, source.field);
    return hasValue(formatted) ? { source, value: formatted, isLookup: false } : null;
  }
  const raw = record[source.field];
  if (hasValue(raw)) {
    return { source, value: raw, isLookup: false };
  }
  const formatted = LibraryUtils.formattedValue(record, source.field);
  return hasValue(formatted) ? { source, value: formatted, isLookup: false } : null;
}

/** First source (in order) that has a value, or null when all are empty. */
export function resolveDynamicSource(
  record: Record<string, unknown>,
  spec: IDynamicColumnSpec
): IResolvedSource | null {
  for (const source of spec.sources) {
    const resolved = readSource(record, source);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
//#endregion
