import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SearchBar } from "../../../shared/controls/presentational/SearchBar";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { accountRefs, accountColumns, accountRows, industryOptions } from "../fixtures";

/**
 * Interactive counterpart of sample-company-search: the same top-to-bottom
 * layout (search bar, grid, detail panel) composed from presentational controls
 * with fixture data only. No CRM, no context, no Xrm. The story plays the
 * ViewModel: it owns the Observables a smart tier would, filters the grid as you
 * type, and loads the detail panel from the selected row. It is the kit's own
 * View + ViewModel + Observable pattern running on fixtures, so a reviewer can
 * exercise the behavior and compare it against the live app side by side.
 */
const meta: Meta = {
  title: "Sample Patterns/Company Search",
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
  toolbar: { display: "flex", columnGap: tokens.spacingHorizontalS, alignItems: "center" },
  detail: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    maxWidth: "480px",
  },
});

interface ICompanySearchBody {
  searchText: Observable<string>;
  rows: IGridRow[];
  selectedKey: Observable<string | null>;
  onSelect: (row: IGridRow) => void;
  onRefresh: () => void;
  detailName: Observable<string | null>;
  detailIndustry: Observable<number | null>;
  detailParent: Observable<IEntityReference | null>;
  parentResults: Observable<IEntityReference[]>;
}

class CompanySearchDemo extends ObserverComponent {
  private readonly searchText = new Observable("");
  private readonly selectedKey = new Observable<string | null>(accountRows[0].key);
  private readonly detailName = new Observable<string | null>(String(accountRows[0].name));
  private readonly detailIndustry = new Observable<number | null>(accountRows[0].industry as number);
  private readonly detailParent = new Observable<IEntityReference | null>(accountRefs[1]);
  private readonly parentResults = new Observable<IEntityReference[]>([]);

  constructor(props: object) {
    super(props);
    // Re-render (and re-filter the grid) when the search text or selection changes.
    this.observe(this.searchText, this.selectedKey);
  }

  private get rows(): IGridRow[] {
    const query = this.searchText.value.trim().toLowerCase();
    return query
      ? accountRows.filter((row) => String(row.name).toLowerCase().includes(query))
      : accountRows;
  }

  private readonly onSelect = (row: IGridRow): void => {
    this.selectedKey.value = row.key;
    this.detailName.value = String(row.name);
    this.detailIndustry.value = (row.industry as number) ?? null;
  };

  private readonly onRefresh = (): void => {
    this.searchText.value = "";
  };

  override render(): React.ReactNode {
    return (
      <Body
        searchText={this.searchText}
        rows={this.rows}
        selectedKey={this.selectedKey}
        onSelect={this.onSelect}
        onRefresh={this.onRefresh}
        detailName={this.detailName}
        detailIndustry={this.detailIndustry}
        detailParent={this.detailParent}
        parentResults={this.parentResults}
      />
    );
  }
}

const Body: React.FC<ICompanySearchBody> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>Company Search</Title3>

      <div className={styles.toolbar}>
        <SearchBar searchText={props.searchText} placeholder="Search active accounts by name" />
        <Button icon={<ArrowClockwiseRegular />} appearance="subtle" onClick={props.onRefresh}>
          Refresh
        </Button>
      </div>

      <DataGrid
        columns={accountColumns}
        rows={props.rows}
        emptyMessage="No accounts match your search."
        selectedKey={props.selectedKey}
        onRowClick={props.onSelect}
      />

      <Divider />

      <div className={styles.detail}>
        <TextField
          label="Account Name"
          value={props.detailName}
          onChange={(v) => (props.detailName.value = v)}
        />
        <OptionSetField
          label="Industry"
          options={industryOptions}
          selectedValue={props.detailIndustry}
          onChange={(v) => (props.detailIndustry.value = v)}
        />
        <LookupField
          label="Parent Account"
          selected={props.detailParent}
          results={props.parentResults}
          onSearchTextChanged={(text) =>
            (props.parentResults.value = accountRefs.filter((r) =>
              (r.name ?? "").toLowerCase().includes(text.toLowerCase())
            ))
          }
          onChange={(v) => (props.detailParent.value = v)}
        />
        <div>
          <Button appearance="primary">Save</Button>
        </div>
      </div>
    </div>
  );
};

export const Layout: Story = {
  name: "Search, grid, detail",
  render: () => <CompanySearchDemo />,
};
