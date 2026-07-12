import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { mergedOpportunityColumns, mergedOpportunityRows } from "../fixtures";

/**
 * Interactive counterpart of sample-merged-grid: one grid whose rows come from
 * two query sources (open pipeline plus recently won), merged into a single
 * list no native subgrid can produce. Composed from the presentational DataGrid
 * with fixture data only. Selecting a row reports the record the live app would
 * open.
 */
const meta: Meta = {
  title: "Sample Patterns/Merged Grid",
  parameters: {
    docs: {
      description: {
        component:
          "One grid whose rows come from two separate queries, merged into a single list no " +
          "native subgrid can produce: my open pipeline plus the deals my team won in the last 30 " +
          "days. The rendered demo composes the presentational DataGrid over fixture rows so a " +
          "reviewer can compare it against a native subgrid pixel for pixel. The Show code panel " +
          "is the real version: a ViewModel that runs both queries, tags each row with its source, " +
          "and concatenates them for the grid.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
    // Mirror the real app's hosting: the shell pins body overflow hidden and the
    // page owns the scroll, so the story reproduces the same vertical space
    // pressure the live app is under.
    height: "100vh",
    overflowY: "auto",
  },
  // In the bounded page column a flex child with its own overflow can shrink to
  // nothing under height pressure; pin the grid so the page scrolls instead,
  // the same posture the real View takes.
  gridRegion: { flexShrink: 0 },
  toolbar: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
  caption: { color: tokens.colorNeutralForeground3 },
});

interface IMergedBody {
  rows: IGridRow[];
  selectedKey: Observable<string | null>;
  opened: Observable<string | null>;
  onOpen: (row: IGridRow) => void;
  onRefresh: () => void;
}

class MergedGridDemo extends ObserverComponent {
  private readonly selectedKey = new Observable<string | null>(null);
  private readonly opened = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    this.observe(this.selectedKey, this.opened);
  }

  private readonly onOpen = (row: IGridRow): void => {
    this.selectedKey.value = row.key;
    this.opened.value = `${String(row.topic)} (${String(row.source)})`;
  };

  private readonly onRefresh = (): void => {
    this.selectedKey.value = null;
    this.opened.value = null;
  };

  override render(): React.ReactNode {
    return (
      <Body
        rows={mergedOpportunityRows}
        selectedKey={this.selectedKey}
        opened={this.opened}
        onOpen={this.onOpen}
        onRefresh={this.onRefresh}
      />
    );
  }
}

const Body: React.FC<IMergedBody> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title3>Pipeline + Recent Wins (merged queries)</Title3>
        <Button icon={<ArrowClockwiseRegular />} appearance="subtle" onClick={props.onRefresh}>
          Refresh
        </Button>
      </div>
      <div className={styles.gridRegion}>
        <DataGrid
          columns={mergedOpportunityColumns}
          rows={props.rows}
          emptyMessage="Nothing in the pipeline."
          selectedKey={props.selectedKey}
          onRowClick={props.onOpen}
        />
      </div>
      {props.opened.value ? (
        <div className={styles.caption}>Would open {props.opened.value}.</div>
      ) : null}
    </div>
  );
};

export const Layout: Story = {
  name: "Merged multi-query grid",
  render: () => <MergedGridDemo />,
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `// One grid, rows merged from TWO queries no single native subgrid can show:
//   1) my open opportunities
//   2) opportunities my team won in the last 30 days
// The ViewModel runs both, tags each row with where it came from, then
// concatenates. The View binds the merged rows to a DataGrid (native look).
class PipelineViewModel {
  readonly rows = new Observable<IGridRow[]>([]);
  readonly selectedKey = new Observable<string | null>(null);

  async load(ctx: IViewModelContext): Promise<void> {
    const [open, won] = await Promise.all([
      ctx.webAPI.fetch("opportunity", MY_OPEN_FETCHXML),
      ctx.webAPI.fetch("opportunity", TEAM_WON_LAST_30_DAYS_FETCHXML),
    ]);
    this.rows.value = [
      ...open.entities.map((e) => toRow(e, "My open")),
      ...won.entities.map((e) => toRow(e, "Team won (30d)")),
    ];
  }

  open(row: IGridRow, ctx: IViewModelContext): void {
    void ctx.navigation.openForm("opportunity", String(row.key));
  }
}

// The View is an ObserverComponent that observes vm.rows and renders the grid.
<DataGrid
  columns={mergedOpportunityColumns}
  rows={vm.rows}
  selectedKey={vm.selectedKey}
  onRowClick={(row) => vm.open(row, ctx)}
/>`,
      },
    },
  },
};
