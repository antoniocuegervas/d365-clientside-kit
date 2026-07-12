import * as React from "react";
import { Button, Divider, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SearchBar } from "../../../shared/controls/presentational/SearchBar";
import { GridCommandBar } from "../../../shared/controls/presentational/GridCommandBar";
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
  // In the bounded page column a flex child with its own overflow can shrink to
  // nothing under height pressure; pin the grid so the page scrolls instead.
  gridRegion: { flexShrink: 0 },
  // Fluent's Divider defaults to flex-grow: 1; in a flex column that makes it grow
  // vertically and push everything below it down, so pin it to 0.
  divider: { flexGrow: 0 },
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
 *   search bar, then the saved-view grid (filtered live by its quick-find), then
 *   the detail panel.
 */
export class CompanySearchView extends ObserverComponent<ICompanySearchViewProps> {
  constructor(props: ICompanySearchViewProps) {
    super(props);
    const vm = props.viewModel;
    this.observe(vm.selectedAccountId, vm.selectedAccountIds, vm.detailLoading, vm.saveMessage);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<ICompanySearchViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>Company Search</Title3>

      <div className={styles.toolbar}>
        <SearchBar
          searchText={vm.searchText}
          showButton={false}
          placeholder="Search active accounts by name"
        />
      </div>

      <GridCommandBar
        selectedCount={vm.selectedAccountIds.value.length}
        onNew={vm.onNew}
        onDelete={() => void vm.onDeleteSelected()}
        onRefresh={() => vm.refreshViewGrid.publish()}
      />

      {/* The entity's saved grid view, exactly as the form designer defined it,
          impossible to embed natively in a webresource. The search box feeds the
          grid's own quick-find, so one grid both lists and searches: server-paged,
          server-filtered, with the view's columns. Double-click a row to open it. */}
      <div className={styles.gridRegion}>
        <SmartViewGrid
          entity="account"
          pageSize={25}
          refresh={vm.refreshViewGrid}
          quickFind={vm.searchText}
          multiSelect
          selectedRecordIds={vm.selectedAccountIds}
          selectedRecordId={vm.selectedAccountId}
          onRecordSelected={(id) => void vm.onAccountSelected(id)}
        />
      </div>

      <Divider className={styles.divider} />

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
