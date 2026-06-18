import * as React from "react";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import type { MergedGridViewModel } from "./MergedGridViewModel";

export interface IMergedGridViewProps {
  viewModel: MergedGridViewModel;
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

export class MergedGridView extends ObserverComponent<IMergedGridViewProps> {
  constructor(props: IMergedGridViewProps) {
    super(props);
    this.observe(props.viewModel.results);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IMergedGridViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  // Map domain results to presentational grid rows (key uniqueness is a grid
  // concern, so the source-prefixed key is built here, not in the ViewModel).
  const rows: IGridRow[] = vm.results.value.map((row) => ({
    key: `${row.source}-${row.id}`,
    topic: row.topic,
    customer: row.customer,
    value: row.value,
    source: row.source,
    recordId: row.id,
  }));
  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Title3>Pipeline + Recent Wins (merged queries)</Title3>
        <Button icon={<ArrowClockwiseRegular />} appearance="subtle" onClick={() => void vm.load()}>
          Refresh
        </Button>
      </div>
      <DataGrid
        columns={[
          { key: "topic", name: "Topic", width: 280 },
          { key: "customer", name: "Customer", width: 200 },
          { key: "value", name: "Est. Value", width: 130 },
          { key: "source", name: "Source Query", width: 170 },
        ]}
        rows={rows}
        loading={vm.loading}
        emptyMessage="Nothing in the pipeline."
        onRowClick={(row) => vm.onOpenRecord(String(row.recordId))}
      />
    </div>
  );
};
