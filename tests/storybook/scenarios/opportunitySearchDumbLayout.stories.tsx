import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { BooleanField } from "../../../shared/controls/presentational/BooleanField";
import { NumberField } from "../../../shared/controls/presentational/NumberField";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";
import { DataGrid } from "../../../shared/controls/presentational/DataGrid";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import type { IGridColumn, IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { accountRefs, ratingOptions } from "../fixtures";

/**
 * Dumb counterpart of sample-opportunity-search, the "kitchen sink"
 * filter form, every control type at once, composed presentationally with
 * fixture data. Mirrors the live app's filter-grid → actions → results layout.
 */
const meta: Meta = {
  title: "Sample Patterns/Opportunity Search (dumb layout)",
};
export default meta;
type Story = StoryObj;

const resultColumns: IGridColumn[] = [
  { key: "topic", name: "Topic", width: 260 },
  { key: "customer", name: "Customer", width: 180 },
  { key: "value", name: "Est. Value", width: 120 },
  { key: "closing", name: "Est. Close Date", width: 140 },
  { key: "rating", name: "Rating", width: 100 },
];

const resultRows: IGridRow[] = [
  { key: "1", topic: "100 Licenses renewal", customer: "Contoso Ltd", value: "$95,000.00", closing: "2026-07-30", rating: "Hot" },
  { key: "2", topic: "Server migration project", customer: "Fabrikam Inc", value: "$310,000.00", closing: "2026-08-15", rating: "Warm" },
  { key: "3", topic: "Analytics rollout", customer: "Northwind Traders", value: "$120,000.00", closing: "2026-09-01", rating: "Cold" },
];

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    maxWidth: "900px",
  },
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS },
});

const OpportunitySearchDumbLayout: React.FC = () => {
  const styles = useStyles();
  const topicContains = new Observable<string | null>("renewal");
  const customer = new Observable<IEntityReference | null>(accountRefs[0]);
  const customerResults = new Observable<IEntityReference[]>([]);
  const rating = new Observable<number | null>(1);
  const decisionMaker = new Observable<boolean | null>(true);
  const minValue = new Observable<number | null>(50000);
  const closingAfter = new Observable<Date | null>(new Date(2026, 6, 1));
  const closingBefore = new Observable<Date | null>(new Date(2026, 8, 30));

  return (
    <div className={styles.page}>
      <Title3>Opportunity Search</Title3>

      <div className={styles.filterGrid}>
        <TextField label="Topic contains" value={topicContains} />
        <LookupField
          label="Customer"
          selected={customer}
          results={customerResults}
          onSearchTextChanged={(text) =>
            (customerResults.value = accountRefs.filter((r) =>
              (r.name ?? "").toLowerCase().includes(text.toLowerCase())
            ))
          }
          onChange={(v) => (customer.value = v)}
        />
        <OptionSetField
          label="Rating"
          options={ratingOptions}
          selectedValue={rating}
          onChange={(v) => (rating.value = v)}
        />
        <BooleanField
          label="Decision maker"
          value={decisionMaker}
          trueLabel="Yes"
          falseLabel="No"
        />
        <NumberField label="Min. est. value" value={minValue} precision={2} prefix="$" />
        <DateTimeField label="Closing after" value={closingAfter} />
        <DateTimeField label="Closing before" value={closingBefore} />
      </div>

      <div className={styles.actions}>
        <Button appearance="primary">Search</Button>
        <Button>Clear</Button>
      </div>

      <Divider />
      <DataGrid columns={resultColumns} rows={resultRows} emptyMessage="Run a search to see opportunities." />
    </div>
  );
};

export const Layout: Story = {
  name: "Filter form → results",
  render: () => <OpportunitySearchDumbLayout />,
};
