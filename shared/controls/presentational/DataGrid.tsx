import * as React from "react";
import { kitStrings } from "../../localization/kitStrings";
import {
  DataGrid as FluentDataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Skeleton,
  SkeletonItem,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
  type TableColumnDefinition,
} from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import { valueOfList, type OrObservableList } from "../../reactivity/ObservableArray";

/**
 * Read-only data grid, THE limitation-bypass control. Renders
 * supplied rows with native model-driven grid styling. Where rows come from
 * (single view, merged FetchXML queries, multi-activity normalization) is
 * entirely the host's business: presentational rendering vs row supply.
 */

export interface IGridColumn {
  /** Row property to display. */
  key: string;
  /** Column header text. */
  name: string;
  /** Designed width in px; columns grow from this to share slack, and scroll when too narrow. */
  width?: number;
  /** Cell alignment. Default "start"; "end" right-aligns numeric/currency columns. */
  align?: "start" | "end";
  /** Custom cell renderer; default renders the row value as text. */
  onRender?: (row: IGridRow) => React.ReactNode;
  /** Client-side sortability. Default true. */
  sortable?: boolean;
  /**
   * Custom client-side comparator for this column (e.g. dynamic columns whose
   * value isn't a single comparable cell). Used in place of the default cell
   * comparison when sorting on this column.
   */
  comparator?: (a: IGridRow, b: IGridRow) => number;
}

export interface IGridRow {
  /** Stable row key (usually the record id, or source-prefixed for merges). */
  key: string;
  [field: string]: unknown;
}

export interface IDataGridProps {
  columns: OrObservable<IGridColumn[]>;
  rows: OrObservableList<IGridRow>;
  /** Skeleton shimmer while the host loads (no layout shift). */
  loading?: OrObservable<boolean>;
  emptyMessage?: string;
  onRowClick?: (row: IGridRow) => void;
  /**
   * Row invoke (double-click / Enter), distinct from select. The smart grid
   * defaults this to "open the record".
   */
  onItemInvoked?: (row: IGridRow) => void;
  /** Host-owned selected row key for highlight; optional. */
  selectedKey?: Observable<string | null>;
  /** Enable multi-select checkboxes. */
  multiSelect?: boolean;
  /** Host-owned set of selected row keys for multi-select. */
  selectedKeys?: Observable<string[]>;
  /** Raised when the multi-select set changes. */
  onSelectionChange?: (keys: string[]) => void;
  /** Rows shown while loading. Default 5. */
  skeletonRows?: number;
  /** Opt-in column resizing (drag the header edge). Default off. */
  resizableColumns?: boolean;
  /**
   * Server-side sort mode: when set, header clicks call this instead of sorting
   * the loaded page in memory, and the host re-supplies sorted rows. The header
   * indicator follows {@link sortState}.
   */
  onColumnSort?: (columnKey: string, descending: boolean) => void;
  /** Controlled sort indicator for server-sort mode. */
  sortState?: OrObservable<{ columnKey: string; descending: boolean } | null>;
}

interface IDataGridState {
  sortColumn: string | null;
  sortAscending: boolean;
  /** Per-column widths the user has dragged, keyed by column key; overrides the designed width. */
  widthOverrides: Record<string, number>;
}

/** Floor a column can be dragged down to. */
const MIN_COLUMN_WIDTH = 60;

const useStyles = makeStyles({
  // Horizontal scroll when fixed columns sum wider than the host slot, so the
  // rightmost column scrolls into view instead of clipping.
  scroll: { overflowX: "auto", width: "100%" },
  grid: { minWidth: "fit-content" },
  // Default cell text: one line, clipped with an ellipsis (the full value rides
  // along as the title on hover).
  cell: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
    minWidth: 0,
  },
  cellEnd: { textAlign: "right" },
  headerEnd: { width: "100%", textAlign: "right" },
  // Header text matches native UCI: semibold in a muted grey.
  headerCell: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  // A hairline under the header, the rule native subgrids anchor their header on.
  headerRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  // Anchor for the resize handle pinned to the header cell's right edge.
  headerCellResizable: { position: "relative" },
  resizeHandle: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "6px",
    cursor: "col-resize",
    userSelect: "none",
    touchAction: "none",
    ":hover": { backgroundColor: tokens.colorNeutralStroke1 },
  },
  row: { cursor: "default" },
  // Hover tint on a clickable row, matching the native UCI read-only grid (the
  // whole row greys on hover).
  clickableRow: {
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  // Selected row, matching native UCI: a light-blue fill from the brand-inverted
  // ramp plus a left accent bar (the way native subgrids mark the active row).
  // Hovering a selected row deepens the blue, and the cell under the cursor gets
  // an extra translucent grey on top, the way native stacks hover over selection.
  selectedRow: {
    backgroundColor: tokens.colorBrandBackgroundInvertedHover,
    boxShadow: `inset 3px 0 0 0 ${tokens.colorBrandStroke1}`,
    ":hover": { backgroundColor: tokens.colorBrandBackgroundInvertedSelected },
    '& [role="gridcell"]:hover': { backgroundColor: "rgba(0, 0, 0, 0.1)" },
  },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
  // The loading skeleton reads as a moving wave between two stencil colours.
  // Fluent's defaults sit too close together to see on a white surface, so widen
  // the gap: a darker base (the bar) and a bright sweep on top, so the animation
  // is actually perceptible, not just the bars.
  loadingSkeleton: {
    "--colorNeutralStencil1": tokens.colorNeutralStroke1,
    "--colorNeutralStencil2": tokens.colorNeutralBackground1,
  },
});

export class DataGrid extends ObserverComponent<IDataGridProps, IDataGridState> {
  constructor(props: IDataGridProps) {
    super(props);
    this.state = { sortColumn: null, sortAscending: true, widthOverrides: {} };
    this.observe(
      props.columns,
      props.rows,
      props.loading,
      props.selectedKey,
      props.selectedKeys,
      props.sortState
    );
  }

  override componentDidUpdate(prevProps: IDataGridProps): void {
    // A host that swaps an Observable prop's identity on a reused instance
    // (rebuilding its ViewModel without changing the grid's key) must not
    // leave the grid listening to the old instances.
    if (
      prevProps.columns !== this.props.columns ||
      prevProps.rows !== this.props.rows ||
      prevProps.loading !== this.props.loading ||
      prevProps.selectedKey !== this.props.selectedKey ||
      prevProps.selectedKeys !== this.props.selectedKeys ||
      prevProps.sortState !== this.props.sortState
    ) {
      this.reobserve(
        this.props.columns,
        this.props.rows,
        this.props.loading,
        this.props.selectedKey,
        this.props.selectedKeys,
        this.props.sortState
      );
    }
  }

  private readonly handleSelectionChange = (keys: string[]): void => {
    if (this.props.selectedKeys) {
      this.props.selectedKeys.value = keys;
    }
    this.props.onSelectionChange?.(keys);
  };

  private readonly handleResize = (key: string, width: number): void => {
    this.setState((previous) => ({
      widthOverrides: { ...previous.widthOverrides, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) },
    }));
  };

  private readonly handleSort = (column: IGridColumn): void => {
    if (column.sortable === false) {
      return;
    }
    // Server-sort mode: delegate to the host, which re-supplies sorted rows.
    if (this.props.onColumnSort) {
      const current = valueOf(this.props.sortState ?? null);
      const descending = current?.columnKey === column.key ? !current.descending : false;
      this.props.onColumnSort(column.key, descending);
      return;
    }
    this.setState((previous) => ({
      sortColumn: column.key,
      sortAscending: previous.sortColumn === column.key ? !previous.sortAscending : true,
    }));
  };

  private sortedRows(): IGridRow[] {
    const rows = [...valueOfList(this.props.rows)];
    // Server-sort mode: rows arrive pre-sorted; never reorder in memory.
    if (this.props.onColumnSort) {
      return rows;
    }
    const { sortColumn, sortAscending } = this.state;
    if (!sortColumn) {
      return rows;
    }
    const direction = sortAscending ? 1 : -1;
    const column = valueOf(this.props.columns).find((c) => c.key === sortColumn);
    const compare = column?.comparator
      ? column.comparator
      : (a: IGridRow, b: IGridRow) => compareCells(a[sortColumn], b[sortColumn]);
    return rows.sort((a, b) => direction * compare(a, b));
  }

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        state={this.state}
        sortedRows={this.sortedRows()}
        onSort={this.handleSort}
        onSelectKeys={this.handleSelectionChange}
        onResize={this.handleResize}
      />
    );
  }
}

const Body: React.FC<
  IDataGridProps & {
    state: IDataGridState;
    sortedRows: IGridRow[];
    onSort: (column: IGridColumn) => void;
    onSelectKeys: (keys: string[]) => void;
    onResize: (key: string, width: number) => void;
  }
> = (props) => {
  const styles = useStyles();
  const columns = valueOf(props.columns);
  const loading = valueOf(props.loading ?? false);
  const selectedKey = props.selectedKey?.value ?? null;
  const resizable = !!props.resizableColumns;
  const overrides = props.state.widthOverrides;

  // Column width: a dragged override pins the column (no flex-grow); otherwise it
  // grows from its designed width to share any slack, so the row fills wide hosts
  // proportionally and scrolls narrow ones (it never shrinks below its width).
  // Fluent's own column sizing is unused: it doesn't apply widths in an embedded
  // host, so the grid owns widths through these inline styles and a drag handle.
  const columnStyle = (columnId: string | number): React.CSSProperties | undefined => {
    const override = overrides[columnId];
    const width = override ?? columns.find((c) => c.key === columnId)?.width;
    if (!width) {
      return { flexGrow: 1, flexBasis: 0, minWidth: 0 };
    }
    return { flexBasis: width, flexGrow: override != null ? 0 : 1, flexShrink: 0, minWidth: 0 };
  };

  // Drag a header edge: pin the column to the width under the cursor, live.
  const startResize = (event: React.PointerEvent, key: string): void => {
    event.preventDefault();
    event.stopPropagation();
    const cell = (event.currentTarget as HTMLElement).parentElement;
    const startWidth = cell ? cell.getBoundingClientRect().width : 150;
    const startX = event.clientX;
    const onMove = (move: PointerEvent): void => props.onResize(key, startWidth + (move.clientX - startX));
    const onUp = (): void => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  // Memoized so the column defs keep a stable identity across renders (rows change
  // far more often than columns), so Fluent's table features don't rebuild their
  // internal state every render. Declared before the loading return so the hook
  // order never changes between renders.
  const tableColumns: TableColumnDefinition<IGridRow>[] = React.useMemo(
    () =>
      columns.map((column) =>
        createTableColumn<IGridRow>({
          columnId: column.key,
          // Fluent treats a two-parameter compare as a sortable header and a
          // zero-parameter one as static. Return 0 either way, so Fluent's stable
          // sort never reorders the rows the grid already sorted.
          compare: column.sortable === false ? () => 0 : (_a: IGridRow, _b: IGridRow) => 0,
          renderHeaderCell: () =>
            column.align === "end" ? <span className={styles.headerEnd}>{column.name}</span> : column.name,
          renderCell: (row) =>
            column.onRender ? (
              column.onRender(row)
            ) : (
              <span
                className={column.align === "end" ? mergeClasses(styles.cell, styles.cellEnd) : styles.cell}
                title={formatCell(row[column.key])}
              >
                {formatCell(row[column.key])}
              </span>
            ),
        })
      ),
    [columns, styles]
  );

  if (loading) {
    return (
      <Skeleton aria-label={kitStrings().loadingRows} className={styles.loadingSkeleton}>
        {Array.from({ length: props.skeletonRows ?? 5 }, (_, index) => (
          <div key={index} style={{ padding: "6px 0" }}>
            <SkeletonItem size={24} />
          </div>
        ))}
      </Skeleton>
    );
  }

  // The sort indicator is fully controlled here: server mode follows the host's
  // sortState, client mode the grid's own. Fluent only paints the arrow.
  const serverSort = props.onColumnSort ? valueOf(props.sortState ?? null) : null;
  const sortState: { sortColumn: string | undefined; sortDirection: "ascending" | "descending" } =
    props.onColumnSort
      ? {
          sortColumn: serverSort?.columnKey,
          sortDirection: serverSort?.descending ? "descending" : "ascending",
        }
      : {
          sortColumn: props.state.sortColumn ?? undefined,
          sortDirection: props.state.sortAscending ? "ascending" : "descending",
        };

  return (
    <div className={styles.scroll}>
      <FluentDataGrid
        size="small"
        items={props.sortedRows}
        columns={tableColumns}
        getRowId={(row) => (row as IGridRow).key}
        sortable
        sortState={sortState}
        onSortChange={(_event, data) => {
          const column = columns.find((c) => c.key === data.sortColumn);
          if (column) {
            props.onSort(column);
          }
        }}
        selectionMode={props.multiSelect ? "multiselect" : undefined}
        selectedItems={props.multiSelect ? new Set(props.selectedKeys?.value ?? []) : undefined}
        onSelectionChange={(_event, data) =>
          props.onSelectKeys(Array.from(data.selectedItems, String))
        }
        selectionAppearance="none"
        aria-label={kitStrings().dataGridLabel}
        className={styles.grid}
      >
        <DataGridHeader>
          <DataGridRow
            className={styles.headerRow}
            selectionCell={props.multiSelect ? { "aria-label": kitStrings().selectAllRows } : undefined}
          >
            {(column) => (
              <DataGridHeaderCell
                className={mergeClasses(styles.headerCell, resizable && styles.headerCellResizable)}
                style={columnStyle(column.columnId)}
              >
                {column.renderHeaderCell()}
                {resizable ? (
                  <span
                    className={styles.resizeHandle}
                    role="separator"
                    aria-label={kitStrings().resizeColumn(String(column.columnId))}
                    onPointerDown={(event) => startResize(event, String(column.columnId))}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  />
                ) : null}
              </DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        {props.sortedRows.length === 0 ? (
          <div className={styles.empty}>{props.emptyMessage ?? kitStrings().noDataAvailable}</div>
        ) : (
          <DataGridBody<IGridRow>>
            {({ item, rowId }) => (
              <DataGridRow<IGridRow>
                key={rowId}
                className={
                  item.key === selectedKey
                    ? styles.selectedRow
                    : props.onRowClick || props.onItemInvoked
                      ? styles.clickableRow
                      : styles.row
                }
                onClick={props.onRowClick ? () => props.onRowClick!(item) : undefined}
                onDoubleClick={props.onItemInvoked ? () => props.onItemInvoked!(item) : undefined}
                onKeyDown={
                  props.onItemInvoked
                    ? (event: React.KeyboardEvent) => {
                        if (event.key === "Enter") {
                          props.onItemInvoked!(item);
                        }
                      }
                    : undefined
                }
              >
                {(column) => (
                  <DataGridCell style={columnStyle(column.columnId)}>
                    {column.renderCell(item)}
                  </DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        )}
      </FluentDataGrid>
    </div>
  );
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}

function compareCells(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return -1;
  }
  if (b === null || b === undefined) {
    return 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  return String(a).localeCompare(String(b));
}
