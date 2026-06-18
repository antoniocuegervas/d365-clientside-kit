import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { BooleanField } from "../../../shared/controls/presentational/BooleanField";
import { NumberField } from "../../../shared/controls/presentational/NumberField";
import { DateTimeField } from "../../../shared/controls/presentational/DateTimeField";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import type { IGridColumn } from "../../../shared/controls/presentational/DataGrid";
import { accountRefs, ratingOptions } from "../fixtures";

/**
 * Interactive counterpart of sample-opportunity-search, the "kitchen sink"
 * filter form, every control type at once, composed presentationally with
 * fixture data. Set the filters and press Search: each one narrows the result
 * grid against a small in-memory dataset (the story plays the smart tier's
 * FetchXML with a client-side predicate). Clear resets the form. Mirrors the
 * live app's filter-grid, actions, results layout.
 */
const meta: Meta = {
  title: "Sample Patterns/Opportunity Search",
};
export default meta;
type Story = StoryObj;

interface IOpportunity {
  key: string;
  topic: string;
  customer: string;
  valueNum: number;
  closing: Date;
  rating: number;
  decisionMaker: boolean;
}

const opportunities: IOpportunity[] = [
  { key: "1", topic: "100 Licenses renewal", customer: "Contoso Ltd", valueNum: 95000, closing: new Date(2026, 6, 30), rating: 1, decisionMaker: true },
  { key: "2", topic: "Server migration project", customer: "Fabrikam Inc", valueNum: 310000, closing: new Date(2026, 7, 15), rating: 2, decisionMaker: true },
  { key: "3", topic: "Analytics rollout", customer: "Northwind Traders", valueNum: 120000, closing: new Date(2026, 8, 1), rating: 3, decisionMaker: false },
  { key: "4", topic: "Support contract renewal", customer: "Adventure Works", valueNum: 58000, closing: new Date(2026, 5, 20), rating: 2, decisionMaker: false },
  { key: "5", topic: "Hardware refresh", customer: "Contoso Ltd", valueNum: 210000, closing: new Date(2026, 9, 10), rating: 1, decisionMaker: true },
];

interface ICriteria {
  topic: string;
  customer: IEntityReference | null;
  rating: number | null;
  decisionMaker: boolean | null;
  minValue: number | null;
  after: Date | null;
  before: Date | null;
}

const SHOW_ALL: ICriteria = {
  topic: "",
  customer: null,
  rating: null,
  decisionMaker: null,
  minValue: null,
  after: null,
  before: null,
};

const resultColumns: IGridColumn[] = [
  { key: "topic", name: "Topic", width: 260 },
  { key: "customer", name: "Customer", width: 180 },
  { key: "value", name: "Est. Value", width: 120 },
  { key: "closing", name: "Est. Close Date", width: 140 },
  { key: "rating", name: "Rating", width: 100 },
];

function matches(opportunity: IOpportunity, c: ICriteria): boolean {
  if (c.topic && !opportunity.topic.toLowerCase().includes(c.topic.toLowerCase())) return false;
  if (c.customer && opportunity.customer !== c.customer.name) return false;
  if (c.rating !== null && opportunity.rating !== c.rating) return false;
  if (c.decisionMaker !== null && opportunity.decisionMaker !== c.decisionMaker) return false;
  if (c.minValue !== null && opportunity.valueNum < c.minValue) return false;
  if (c.after && opportunity.closing < c.after) return false;
  if (c.before && opportunity.closing > c.before) return false;
  return true;
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toRow(opportunity: IOpportunity): IGridRow {
  return {
    key: opportunity.key,
    topic: opportunity.topic,
    customer: opportunity.customer,
    value: `$${opportunity.valueNum.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    closing: localDate(opportunity.closing),
    rating: ratingOptions.find((o) => o.value === opportunity.rating)?.label ?? "",
  };
}

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
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS, alignItems: "center" },
  summary: { color: tokens.colorNeutralForeground3, marginLeft: tokens.spacingHorizontalS },
});

interface IOpportunityBody {
  topicContains: Observable<string | null>;
  customer: Observable<IEntityReference | null>;
  customerResults: Observable<IEntityReference[]>;
  rating: Observable<number | null>;
  decisionMaker: Observable<boolean | null>;
  minValue: Observable<number | null>;
  closingAfter: Observable<Date | null>;
  closingBefore: Observable<Date | null>;
  rows: IGridRow[];
  onSearch: () => void;
  onClear: () => void;
}

class OpportunitySearchDemo extends ObserverComponent {
  private readonly topicContains = new Observable<string | null>("");
  private readonly customer = new Observable<IEntityReference | null>(null);
  private readonly customerResults = new Observable<IEntityReference[]>([]);
  private readonly rating = new Observable<number | null>(null);
  private readonly decisionMaker = new Observable<boolean | null>(null);
  private readonly minValue = new Observable<number | null>(null);
  private readonly closingAfter = new Observable<Date | null>(null);
  private readonly closingBefore = new Observable<Date | null>(null);
  // The applied search. The grid follows this snapshot, not the live filter
  // fields, so editing a filter and pressing Search behaves like the real app.
  private readonly criteria = new Observable<ICriteria>(SHOW_ALL);

  constructor(props: object) {
    super(props);
    this.observe(this.criteria);
  }

  private get rows(): IGridRow[] {
    return opportunities.filter((o) => matches(o, this.criteria.value)).map(toRow);
  }

  private readonly onSearch = (): void => {
    this.criteria.value = {
      topic: this.topicContains.value ?? "",
      customer: this.customer.value,
      rating: this.rating.value,
      decisionMaker: this.decisionMaker.value,
      minValue: this.minValue.value,
      after: this.closingAfter.value,
      before: this.closingBefore.value,
    };
  };

  private readonly onClear = (): void => {
    this.topicContains.value = "";
    this.customer.value = null;
    this.rating.value = null;
    this.decisionMaker.value = null;
    this.minValue.value = null;
    this.closingAfter.value = null;
    this.closingBefore.value = null;
    this.criteria.value = SHOW_ALL;
  };

  override render(): React.ReactNode {
    return (
      <Body
        topicContains={this.topicContains}
        customer={this.customer}
        customerResults={this.customerResults}
        rating={this.rating}
        decisionMaker={this.decisionMaker}
        minValue={this.minValue}
        closingAfter={this.closingAfter}
        closingBefore={this.closingBefore}
        rows={this.rows}
        onSearch={this.onSearch}
        onClear={this.onClear}
      />
    );
  }
}

const Body: React.FC<IOpportunityBody> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>Opportunity Search</Title3>

      <div className={styles.filterGrid}>
        <TextField
          label="Topic contains"
          value={props.topicContains}
          onChange={(v) => (props.topicContains.value = v)}
        />
        <LookupField
          label="Customer"
          selected={props.customer}
          results={props.customerResults}
          onSearchTextChanged={(text) =>
            (props.customerResults.value = accountRefs.filter((r) =>
              (r.name ?? "").toLowerCase().includes(text.toLowerCase())
            ))
          }
          onChange={(v) => (props.customer.value = v)}
        />
        <OptionSetField
          label="Rating"
          options={ratingOptions}
          selectedValue={props.rating}
          onChange={(v) => (props.rating.value = v)}
        />
        <BooleanField
          label="Decision maker"
          value={props.decisionMaker}
          trueLabel="Yes"
          falseLabel="No"
          onChange={(v) => (props.decisionMaker.value = v)}
        />
        <NumberField
          label="Min. est. value"
          value={props.minValue}
          precision={2}
          prefix="$"
          onChange={(v) => (props.minValue.value = v)}
        />
        <DateTimeField
          label="Closing after"
          value={props.closingAfter}
          onChange={(v) => (props.closingAfter.value = v)}
        />
        <DateTimeField
          label="Closing before"
          value={props.closingBefore}
          onChange={(v) => (props.closingBefore.value = v)}
        />
      </div>

      <div className={styles.actions}>
        <Button appearance="primary" onClick={props.onSearch}>
          Search
        </Button>
        <Button onClick={props.onClear}>Clear</Button>
        <span className={styles.summary}>{props.rows.length} matching</span>
      </div>

      <Divider />
      <DataGrid
        columns={resultColumns}
        rows={props.rows}
        emptyMessage="No opportunities match these filters."
      />
    </div>
  );
};

export const Layout: Story = {
  name: "Filter form, results",
  render: () => <OpportunitySearchDemo />,
};
