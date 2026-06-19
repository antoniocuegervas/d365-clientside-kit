import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { activityColumns, activityRows } from "../fixtures";

/**
 * Interactive counterpart of sample-activities-grid: tasks, phone calls, and
 * appointments normalized into one list, the kind of unified activity view a
 * single native subgrid cannot show. Composed from the presentational DataGrid
 * with fixture data only. Selecting a row reports the record the live app would
 * open (each row carries its own activity type and id).
 */
const meta: Meta = {
  title: "Sample Patterns/Activities Grid",
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
  },
  toolbar: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
  caption: { color: tokens.colorNeutralForeground3 },
});

interface IActivitiesBody {
  rows: IGridRow[];
  selectedKey: Observable<string | null>;
  opened: Observable<string | null>;
  onOpen: (row: IGridRow) => void;
  onRefresh: () => void;
}

class ActivitiesGridDemo extends ObserverComponent {
  private readonly selectedKey = new Observable<string | null>(null);
  private readonly opened = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    this.observe(this.selectedKey, this.opened);
  }

  private readonly onOpen = (row: IGridRow): void => {
    this.selectedKey.value = row.key;
    this.opened.value = `${String(row.type)}: ${String(row.subject)}`;
  };

  private readonly onRefresh = (): void => {
    this.selectedKey.value = null;
    this.opened.value = null;
  };

  override render(): React.ReactNode {
    return (
      <Body
        rows={activityRows}
        selectedKey={this.selectedKey}
        opened={this.opened}
        onOpen={this.onOpen}
        onRefresh={this.onRefresh}
      />
    );
  }
}

const Body: React.FC<IActivitiesBody> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title3>My Open Activities, All Types</Title3>
        <Button icon={<ArrowClockwiseRegular />} appearance="subtle" onClick={props.onRefresh}>
          Refresh
        </Button>
      </div>
      <DataGrid
        columns={activityColumns}
        rows={props.rows}
        emptyMessage="No open activities."
        selectedKey={props.selectedKey}
        onRowClick={props.onOpen}
      />
      {props.opened.value ? (
        <div className={styles.caption}>Would open {props.opened.value}.</div>
      ) : null}
    </div>
  );
};

export const Layout: Story = {
  name: "Unified activity list",
  render: () => <ActivitiesGridDemo />,
};
