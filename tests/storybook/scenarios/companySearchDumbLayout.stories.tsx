import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { Observable } from "../../../shared/reactivity/Observable";
import { SearchBar } from "../../../shared/controls/presentational/SearchBar";
import { DataGrid } from "../../../shared/controls/presentational/DataGrid";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { accountRefs, accountColumns, accountRows, industryOptions } from "../fixtures";

/**
 * Dumb counterpart of sample-company-search, the same top-to-bottom
 * layout (search bar → grid → detail panel) composed from presentational
 * controls with fixture data only. No CRM, no context, no Xrm: a reviewer can
 * compare the layout against the live app and against native UCI side by side.
 */
const meta: Meta = {
  title: "Sample Patterns/Company Search (dumb layout)",
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

const CompanySearchDumbLayout: React.FC = () => {
  const styles = useStyles();
  // The story plays the ViewModel: it owns the observables a smart tier would.
  const searchText = new Observable("");
  const detailName = new Observable<string | null>(accountRefs[0].name ?? null);
  const detailIndustry = new Observable<number | null>(6);
  const detailParent = new Observable<IEntityReference | null>(accountRefs[1]);
  const parentResults = new Observable<IEntityReference[]>([]);
  const selectedKey = new Observable<string | null>(accountRows[0].key);

  return (
    <div className={styles.page}>
      <Title3>Company Search</Title3>

      <div className={styles.toolbar}>
        <SearchBar searchText={searchText} placeholder="Search active accounts by name" />
        <Button icon={<ArrowClockwiseRegular />} appearance="subtle">
          Refresh
        </Button>
      </div>

      <DataGrid
        columns={accountColumns}
        rows={accountRows}
        emptyMessage="No accounts match your search."
        selectedKey={selectedKey}
        onRowClick={(row) => (selectedKey.value = row.key)}
      />

      <Divider />

      <div className={styles.detail}>
        <TextField label="Account Name" value={detailName} />
        <OptionSetField
          label="Industry"
          options={industryOptions}
          selectedValue={detailIndustry}
          onChange={(v) => (detailIndustry.value = v)}
        />
        <LookupField
          label="Parent Account"
          selected={detailParent}
          results={parentResults}
          onSearchTextChanged={(text) =>
            (parentResults.value = accountRefs.filter((r) =>
              (r.name ?? "").toLowerCase().includes(text.toLowerCase())
            ))
          }
          onChange={(v) => (detailParent.value = v)}
        />
        <div>
          <Button appearance="primary">Save</Button>
        </div>
      </div>
    </div>
  );
};

export const Layout: Story = {
  name: "Search → grid → detail",
  render: () => <CompanySearchDumbLayout />,
};
