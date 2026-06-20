import * as React from "react";
import {
  Checkbox,
  Skeleton,
  SkeletonItem,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens,
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
  /** Approximate width in px; the last column flexes. */
  width?: number;
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
}

const useStyles = makeStyles({
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    cursor: "pointer",
    userSelect: "none",
  },
  row: { cursor: "default" },
  clickableRow: { cursor: "pointer" },
  selectionCell: { width: "36px" },
  selectedRow: { backgroundColor: tokens.colorNeutralBackground1Selected },
  empty: {
    padding: tokens.spacingVerticalXXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
});

export class DataGrid extends ObserverComponent<IDataGridProps, IDataGridState> {
  constructor(props: IDataGridProps) {
    super(props);
    this.state = { sortColumn: null, sortAscending: true };
    this.observe(
      props.columns,
      props.rows,
      props.loading,
      props.selectedKey,
      props.selectedKeys,
      props.sortState
    );
  }

  private readonly toggleRow = (key: string): void => {
    const current = this.props.selectedKeys?.value ?? [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    if (this.props.selectedKeys) {
      this.props.selectedKeys.value = next;
    }
    this.props.onSelectionChange?.(next);
  };

  private readonly toggleAll = (keys: string[]): void => {
    const current = this.props.selectedKeys?.value ?? [];
    const allSelected = keys.length > 0 && keys.every((k) => current.includes(k));
    const next = allSelected ? [] : keys;
    if (this.props.selectedKeys) {
      this.props.selectedKeys.value = next;
    }
    this.props.onSelectionChange?.(next);
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
        onToggleRow={this.toggleRow}
        onToggleAll={this.toggleAll}
      />
    );
  }
}

const Body: React.FC<
  IDataGridProps & {
    state: IDataGridState;
    sortedRows: IGridRow[];
    onSort: (column: IGridColumn) => void;
    onToggleRow: (key: string) => void;
    onToggleAll: (keys: string[]) => void;
  }
> = (props) => {
  const styles = useStyles();
  const columns = valueOf(props.columns);
  const loading = valueOf(props.loading ?? false);
  const selectedKey = props.selectedKey?.value ?? null;
  const multiSelect = !!props.multiSelect;
  const selectedKeys = props.selectedKeys?.value ?? [];
  const selectedKeySet = new Set(selectedKeys);
  const allKeys = props.sortedRows.map((row) => row.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeySet.has(k));
  const someSelected = !allSelected && allKeys.some((k) => selectedKeySet.has(k));
  const serverSort = props.onColumnSort ? valueOf(props.sortState ?? null) : null;
  const sortDirectionFor = (key: string): "ascending" | "descending" | undefined => {
    if (props.onColumnSort) {
      return serverSort?.columnKey === key
        ? serverSort.descending
          ? "descending"
          : "ascending"
        : undefined;
    }
    return props.state.sortColumn === key
      ? props.state.sortAscending
        ? "ascending"
        : "descending"
      : undefined;
  };

  if (loading) {
    return (
      <Skeleton aria-label="Loading rows">
        {Array.from({ length: props.skeletonRows ?? 5 }, (_, index) => (
          <div key={index} style={{ padding: "6px 0" }}>
            <SkeletonItem size={24} />
          </div>
        ))}
      </Skeleton>
    );
  }

  return (
    <Table size="small" aria-label="Data grid">
      <TableHeader>
        <TableRow>
          {multiSelect ? (
            <TableHeaderCell className={styles.selectionCell}>
              <Checkbox
                aria-label="Select all rows"
                checked={allSelected ? true : someSelected ? "mixed" : false}
                onChange={() => props.onToggleAll(allKeys)}
              />
            </TableHeaderCell>
          ) : null}
          {columns.map((column) => (
            <TableHeaderCell
              key={column.key}
              className={styles.headerCell}
              style={column.width ? { width: column.width } : undefined}
              sortDirection={sortDirectionFor(column.key)}
              onClick={() => props.onSort(column)}
            >
              {column.name}
            </TableHeaderCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.sortedRows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={Math.max(columns.length + (multiSelect ? 1 : 0), 1)}>
              <div className={styles.empty}>{props.emptyMessage ?? "No data available"}</div>
            </TableCell>
          </TableRow>
        ) : (
          props.sortedRows.map((row) => {
            const interactive = !!(props.onRowClick || props.onItemInvoked);
            return (
              <TableRow
                key={row.key}
                className={
                  row.key === selectedKey
                    ? styles.selectedRow
                    : interactive
                      ? styles.clickableRow
                      : styles.row
                }
                tabIndex={props.onItemInvoked ? 0 : undefined}
                onClick={props.onRowClick ? () => props.onRowClick!(row) : undefined}
                onDoubleClick={props.onItemInvoked ? () => props.onItemInvoked!(row) : undefined}
                onKeyDown={
                  props.onItemInvoked
                    ? (event) => {
                        if (event.key === "Enter") {
                          props.onItemInvoked!(row);
                        }
                      }
                    : undefined
                }
              >
                {multiSelect ? (
                  <TableCell
                    className={styles.selectionCell}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Select row ${row.key}`}
                      checked={selectedKeySet.has(row.key)}
                      onChange={() => props.onToggleRow(row.key)}
                    />
                  </TableCell>
                ) : null}
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.onRender ? column.onRender(row) : formatCell(row[column.key])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};

function formatCell(value: unknown): React.ReactNode {
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
