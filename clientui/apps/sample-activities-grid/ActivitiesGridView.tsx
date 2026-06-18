import * as React from "react";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import type { ActivitiesGridViewModel } from "./ActivitiesGridViewModel";

export interface IActivitiesGridViewProps {
  viewModel: ActivitiesGridViewModel;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    height: "100%",
    boxSizing: "border-box",
    overflowY: "auto",
  },
  toolbar: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
});

export class ActivitiesGridView extends ObserverComponent<IActivitiesGridViewProps> {
  constructor(props: IActivitiesGridViewProps) {
    super(props);
    this.observe(props.viewModel.activities);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IActivitiesGridViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  const rows: IGridRow[] = vm.activities.value.map((row) => ({
    key: `${row.entity}-${row.id}`,
    type: row.type,
    subject: row.subject,
    regarding: row.regarding,
    due: row.due,
    status: row.status,
    entity: row.entity,
    recordId: row.id,
  }));
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title3>My Open Activities, All Types</Title3>
        <Button
          icon={<ArrowClockwiseRegular />}
          appearance="subtle"
          onClick={() => void vm.load()}
        >
          Refresh
        </Button>
      </div>
      <DataGrid
        columns={[
          { key: "type", name: "Activity Type", width: 130 },
          { key: "subject", name: "Subject", width: 280 },
          { key: "regarding", name: "Regarding", width: 200 },
          { key: "due", name: "Due", width: 150 },
          { key: "status", name: "Status", width: 110 },
        ]}
        rows={rows}
        loading={vm.loading}
        emptyMessage="No open activities."
        onRowClick={(row) => vm.onOpenActivity(String(row.entity), String(row.recordId))}
      />
    </div>
  );
};
