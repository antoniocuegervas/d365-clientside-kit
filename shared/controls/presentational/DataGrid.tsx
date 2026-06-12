import * as React from "react";
import {
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
}

export interface IGridRow {
  /** Stable row key (usually the record id, or source-prefixed for merges). */
  key: string;
  [field: string]: unknown;
}

export interface IDataGridProps {
  columns: OrObservable<IGridColumn[]>;
  rows: OrObservable<IGridRow[]>;
  /** Skeleton shimmer while the host loads (no layout shift). */
  loading?: OrObservable<boolean>;
  emptyMessage?: string;
  onRowClick?: (row: IGridRow) => void;
  /** Host-owned selected row key for highlight; optional. */
  selectedKey?: Observable<string | null>;
  /** Rows shown while loading. Default 5. */
  skeletonRows?: number;
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
    this.observe(props.columns, props.rows, props.loading, props.selectedKey);
  }

  private readonly handleSort = (column: IGridColumn): void => {
    if (column.sortable === false) {
      return;
    }
    this.setState((previous) => ({
      sortColumn: column.key,
      sortAscending: previous.sortColumn === column.key ? !previous.sortAscending : true,
    }));
  };

  private sortedRows(): IGridRow[] {
    const rows = [...valueOf(this.props.rows)];
    const { sortColumn, sortAscending } = this.state;
    if (!sortColumn) {
      return rows;
    }
    const direction = sortAscending ? 1 : -1;
    return rows.sort((a, b) => direction * compareCells(a[sortColumn], b[sortColumn]));
  }

  override render(): React.ReactNode {
    return (
      <Body
        {...this.props}
        state={this.state}
        sortedRows={this.sortedRows()}
        onSort={this.handleSort}
      />
    );
  }
}

const Body: React.FC<
  IDataGridProps & {
    state: IDataGridState;
    sortedRows: IGridRow[];
    onSort: (column: IGridColumn) => void;
  }
> = (props) => {
  const styles = useStyles();
  const columns = valueOf(props.columns);
  const loading = valueOf(props.loading ?? false);
  const selectedKey = props.selectedKey?.value ?? null;

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
          {columns.map((column) => (
            <TableHeaderCell
              key={column.key}
              className={styles.headerCell}
              style={column.width ? { width: column.width } : undefined}
              sortDirection={
                props.state.sortColumn === column.key
                  ? props.state.sortAscending
                    ? "ascending"
                    : "descending"
                  : undefined
              }
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
            <TableCell colSpan={Math.max(columns.length, 1)}>
              <div className={styles.empty}>{props.emptyMessage ?? "No data available"}</div>
            </TableCell>
          </TableRow>
        ) : (
          props.sortedRows.map((row) => (
            <TableRow
              key={row.key}
              className={
                row.key === selectedKey
                  ? styles.selectedRow
                  : props.onRowClick
                    ? styles.clickableRow
                    : styles.row
              }
              onClick={props.onRowClick ? () => props.onRowClick!(row) : undefined}
            >
              {columns.map((column) => (
                <TableCell key={column.key}>
                  {column.onRender ? column.onRender(row) : formatCell(row[column.key])}
                </TableCell>
              ))}
            </TableRow>
          ))
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
