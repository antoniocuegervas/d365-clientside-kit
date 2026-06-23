import * as React from "react";
import { Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import {
  DataGrid,
  type IGridColumn,
  type IGridRow,
} from "../../controls/presentational/DataGrid";
import { PersonaList, type IPersonaItem } from "../../controls/presentational/PersonaList";
import { SearchBar } from "../../controls/presentational/SearchBar";
import { valueOf, type Observable, type OrObservable } from "../../reactivity/Observable";
import { valueOfList, type OrObservableList } from "../../reactivity/ObservableArray";
import { COUNTERPARTY_KEY, type ICounterpartyInfo } from "./counterparty";

export interface ICounterpartyGridViewProps {
  columns: OrObservable<IGridColumn[]>;
  rows: OrObservableList<IGridRow>;
  loading?: OrObservable<boolean>;
  /** Opens a row's activity (double-click / Enter; the Subject link uses it too). */
  onOpenRow: (row: IGridRow) => void;
  /**
   * Host-owned selected row key. A row click sets it (select-only, like a native
   * subgrid); it drives the highlight and the command bar's selection state.
   */
  selectedKey?: Observable<string | null>;
  /**
   * Host-owned live-search text. When set, a search box appears and the loaded
   * rows are filtered by subject or counterparty (client-side, so it narrows the
   * current page).
   */
  searchText?: Observable<string>;
  /** Command bar rendered above the grid (New / Edit / Refresh). */
  commandBar?: React.ReactNode;
  /** Pager rendered below the grid (the PCF wires it to the dataset's paging). */
  pager?: React.ReactNode;
  /** Heading + page chrome shown above the grid. The PCF omits it (the form frames it). */
  title?: string;
}

interface ICounterpartyGridViewState {
  /** Measured host width; 0 until the first resize observation. */
  width: number;
}

/**
 * Below this host width the grid is unreadable, so each row becomes a persona card.
 * This is an intentional responsive affordance, not speculative: a narrow host is a
 * real case (a vertical display, a narrow side pane, or how a model-driven form
 * reflows tab columns), so keep it.
 */
const PERSONA_BREAKPOINT = 560;

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
  },
  // Command bar on the left, search box on the right, like a native subgrid header.
  toolbar: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  toolbarSpacer: { flexGrow: 1 },
  // Wide enough that the "subject or counterparty" placeholder is not clipped.
  search: { width: "300px" },
});

/**
 * Presentational grid for the counterparty scenario, the one place the DataGrid
 * is wired for it, so the sample app (Web API data) and the dataset PCF render
 * identically. It watches its own width and, on a host too narrow for a grid,
 * collapses each row into a persona card instead of forcing a horizontal scroll.
 */
export class CounterpartyGridView extends ObserverComponent<
  ICounterpartyGridViewProps,
  ICounterpartyGridViewState
> {
  private readonly rootRef = React.createRef<HTMLDivElement>();
  private observer: ResizeObserver | undefined;

  constructor(props: ICounterpartyGridViewProps) {
    super(props);
    this.state = { width: 0 };
    this.observe(props.columns, props.rows, props.loading, props.selectedKey, props.searchText);
  }

  override componentDidMount(): void {
    if (this.rootRef.current && typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect.width ?? 0);
        if (Math.abs(width - this.state.width) > 1) {
          this.setState({ width });
        }
      });
      this.observer.observe(this.rootRef.current);
    }
  }

  protected override onUnmount(): void {
    this.observer?.disconnect();
  }

  override render(): React.ReactNode {
    // Width-only sizing: the wrapper fills its host's width but takes its height
    // from the grid's content. Forcing height:100% collapses to 0 in an
    // auto-height host (a dataset PCF's container), which hid the control until a
    // later layout pass. The observer only needs the width (for the persona switch).
    return (
      <div ref={this.rootRef} style={{ width: "100%" }}>
        <Body {...this.props} width={this.state.width} />
      </div>
    );
  }
}

const Body: React.FC<ICounterpartyGridViewProps & { width: number }> = (props) => {
  const styles = useStyles();
  const loading = valueOf(props.loading ?? false);
  const narrow = props.width > 0 && props.width < PERSONA_BREAKPOINT;
  const term = valueOf(props.searchText ?? "").trim().toLowerCase();
  const rows: IGridRow[] = [...valueOfList(props.rows)].filter((row) => matchesSearch(row, term));

  // A row click toggles selection (like a native subgrid); clicking the selected
  // row again clears it, so the New / Refresh actions come back. The Subject link
  // and a double-click open the activity.
  const select = props.selectedKey
    ? (row: IGridRow): void => {
        const current = props.selectedKey!.value;
        props.selectedKey!.value = current === row.key ? null : row.key;
      }
    : undefined;

  const grid =
    narrow && !loading ? (
      <PersonaView {...props} rows={rows} onSelect={select} />
    ) : (
      <DataGrid
        columns={props.columns}
        rows={rows}
        loading={props.loading}
        emptyMessage={term ? "No matching activities." : "No activities."}
        resizableColumns
        selectedKey={props.selectedKey}
        onRowClick={select}
        onItemInvoked={props.onOpenRow}
      />
    );

  const toolbar =
    props.commandBar || props.searchText ? (
      <div className={styles.toolbar}>
        {props.commandBar}
        <div className={styles.toolbarSpacer} />
        {props.searchText ? (
          <div className={styles.search}>
            <SearchBar
              searchText={props.searchText}
              showButton={false}
              placeholder="Search by subject or counterparty"
            />
          </div>
        ) : null}
      </div>
    ) : null;

  const content = (
    <>
      {toolbar}
      {grid}
      {props.pager}
    </>
  );

  if (!props.title) {
    return content;
  }
  return (
    <div className={styles.page}>
      <Title3>{props.title}</Title3>
      {content}
    </div>
  );
};

/** Each row as a persona: the subject names it, the other columns become secondary lines. */
const PersonaView: React.FC<
  ICounterpartyGridViewProps & { rows: IGridRow[]; onSelect?: (row: IGridRow) => void }
> = (props) => {
  const columns = valueOf(props.columns);
  const rows = props.rows;
  const nameKey = columns.find((c) => c.key === "subject")?.key ?? columns[0]?.key;

  const items: IPersonaItem[] = rows.map((row) => ({
    id: row.key,
    name: cellText(row[nameKey]) || "(untitled)",
    secondaryTexts: columns
      .filter((c) => c.key !== nameKey)
      .slice(0, 5)
      .map((c) => {
        const value = cellText(row[c.key]);
        return value ? `${c.name}: ${value}` : "";
      })
      .filter(Boolean),
  }));

  const byKey = new Map(rows.map((row) => [row.key, row]));
  // Tapping a card selects it (the command bar's Edit then opens), mirroring the
  // grid's select-only click.
  const onTap = props.onSelect ?? props.onOpenRow;
  return (
    <PersonaList
      items={items}
      emptyMessage="No activities."
      onItemClick={(item) => {
        const row = byKey.get(item.id);
        if (row) {
          onTap(row);
        }
      }}
    />
  );
};

/**
 * A row matches the live search when its subject or any of its parties contains
 * the term, the hidden "(+N more)" parties included (not just the lead shown in
 * the cell).
 */
function matchesSearch(row: IGridRow, term: string): boolean {
  if (cellText(row.subject).toLowerCase().includes(term)) {
    return true;
  }
  const parties = (row[COUNTERPARTY_KEY] as ICounterpartyInfo | undefined)?.parties ?? [];
  return parties.some((party) => party.name.toLowerCase().includes(term));
}

/** Plain text for a cell value, including the counterparty info object's summary. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object" && "counterparty" in (value as Record<string, unknown>)) {
    return String((value as { counterparty: unknown }).counterparty);
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}
