import * as React from "react";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { SmartBooleanField } from "../../../shared/controls/smart/SmartBooleanField";
import { SmartNumberField } from "../../../shared/controls/smart/SmartNumberField";
import { SmartDatePicker } from "../../../shared/controls/smart/SmartDatePicker";
import type { OpportunitySearchViewModel } from "./OpportunitySearchViewModel";

export interface IOpportunitySearchViewProps {
  viewModel: OpportunitySearchViewModel;
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
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    maxWidth: "900px",
  },
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS },
  summary: { color: tokens.colorNeutralForeground3 },
});

/**
 * The View is a filter form built almost entirely from metadata-aware blocks:
 * option lists, precision, and date formats come from Dataverse. A few labels
 * are overridden here to phrase them as filter prompts ("Topic contains").
 */
export class OpportunitySearchView extends ObserverComponent<IOpportunitySearchViewProps> {
  constructor(props: IOpportunitySearchViewProps) {
    super(props);
    const vm = props.viewModel;
    this.observe(vm.results, vm.searching, vm.resultSummary);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IOpportunitySearchViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  const rows: IGridRow[] = vm.results.value.map((row) => ({
    key: row.id,
    topic: row.topic,
    customer: row.customer,
    value: row.value,
    closing: row.closing,
    rating: row.rating,
  }));
  return (
    <div className={styles.page}>
      <Title3>Opportunity Search</Title3>

      <div className={styles.filterGrid}>
        <SmartTextField entity="opportunity" attribute="name" value={vm.topicContains} label="Topic contains" />
        <SmartLookup entity="opportunity" attribute="customerid" value={vm.customer} targetEntity="account" />
        <SmartOptionSet entity="opportunity" attribute="opportunityratingcode" value={vm.rating} />
        <SmartBooleanField entity="opportunity" attribute="decisionmaker" value={vm.decisionMaker} />
        <SmartNumberField entity="opportunity" attribute="estimatedvalue" value={vm.minValue} label="Min. est. value" />
        <SmartDatePicker entity="opportunity" attribute="estimatedclosedate" value={vm.closingAfter} label="Closing after" />
        <SmartDatePicker entity="opportunity" attribute="estimatedclosedate" value={vm.closingBefore} label="Closing before" />
      </div>

      <div className={styles.actions}>
        <Button appearance="primary" onClick={() => void vm.onSearch()} disabled={vm.searching.value}>
          {vm.searching.value ? "Searching…" : "Search"}
        </Button>
        <Button onClick={vm.onClear}>Clear</Button>
      </div>

      <Divider />
      {vm.resultSummary.value ? <div className={styles.summary}>{vm.resultSummary.value}</div> : null}
      <DataGrid
        columns={[
          { key: "topic", name: "Topic", width: 260 },
          { key: "customer", name: "Customer", width: 180 },
          { key: "value", name: "Est. Value", width: 120 },
          { key: "closing", name: "Est. Close Date", width: 140 },
          { key: "rating", name: "Rating", width: 100 },
        ]}
        rows={rows}
        loading={vm.searching}
        emptyMessage="Run a search to see opportunities."
        onRowClick={(row) => vm.onOpenRecord(row.key)}
      />
    </div>
  );
};
