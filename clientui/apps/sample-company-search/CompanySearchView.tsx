import * as React from "react";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SearchBar } from "../../../shared/controls/presentational/SearchBar";
import { DataGrid, type IGridRow } from "../../../shared/controls/presentational/DataGrid";
import { WaitingMessage } from "../../../shared/controls/presentational/WaitingMessage";
import { SmartViewGrid } from "../../../shared/controls/smart/SmartViewGrid";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import type { CompanySearchViewModel } from "./CompanySearchViewModel";

export interface ICompanySearchViewProps {
  viewModel: CompanySearchViewModel;
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
  toolbar: { display: "flex", columnGap: tokens.spacingHorizontalS, alignItems: "center" },
  detail: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    maxWidth: "480px",
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

/**
 * View layout (top to bottom, like a form):
 *   search bar, then grid (saved view until a search runs), then detail panel.
 */
export class CompanySearchView extends ObserverComponent<ICompanySearchViewProps> {
  constructor(props: ICompanySearchViewProps) {
    super(props);
    const vm = props.viewModel;
    this.observe(vm.hasSearched, vm.searchResults, vm.selectedAccountId, vm.detailLoading, vm.saveMessage);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<ICompanySearchViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  const rows: IGridRow[] = vm.searchResults.value.map((row) => ({
    key: row.id,
    name: row.name,
    city: row.city,
    phone: row.phone,
  }));
  return (
    <div className={styles.page}>
      <Title3>Company Search</Title3>

      <div className={styles.toolbar}>
        <SearchBar
          searchText={vm.searchText}
          onSearch={(text) => void vm.onSearch(text)}
          placeholder="Search active accounts by name"
        />
        <Button
          icon={<ArrowClockwiseRegular />}
          onClick={() => vm.refreshViewGrid.publish()}
          appearance="subtle"
        >
          Refresh
        </Button>
      </div>

      {vm.hasSearched.value ? (
        <DataGrid
          columns={[
            { key: "name", name: "Account Name", width: 260 },
            { key: "city", name: "City", width: 160 },
            { key: "phone", name: "Main Phone", width: 160 },
          ]}
          rows={rows}
          loading={vm.searching}
          emptyMessage="No accounts match your search."
          selectedKey={vm.selectedAccountId}
          onRowClick={(row) => void vm.onAccountSelected(row.key)}
        />
      ) : (
        // 99%-native path: the entity's saved grid view, exactly as the form
        // designer defined it, impossible to embed natively in a webresource.
        // Paged server-side and double-click a row to open the record.
        <SmartViewGrid
          entity="account"
          pageSize={25}
          refresh={vm.refreshViewGrid}
          selectedRecordId={vm.selectedAccountId}
          onRecordSelected={(id) => void vm.onAccountSelected(id)}
        />
      )}

      <Divider />

      {vm.selectedAccountId.value === null ? (
        <div className={styles.hint}>Select an account to edit its details.</div>
      ) : vm.detailLoading.value ? (
        <WaitingMessage message="Loading account…" />
      ) : (
        <div className={styles.detail}>
          <SmartTextField entity="account" attribute="name" value={vm.detailName} />
          <SmartOptionSet entity="account" attribute="industrycode" value={vm.detailIndustry} />
          <SmartLookup entity="account" attribute="parentaccountid" value={vm.detailParentAccount} />
          <div>
            <Button appearance="primary" onClick={() => void vm.onSaveDetail()}>
              Save
            </Button>
          </div>
          {vm.saveMessage.value ? <div className={styles.hint}>{vm.saveMessage.value}</div> : null}
        </div>
      )}
    </div>
  );
};
