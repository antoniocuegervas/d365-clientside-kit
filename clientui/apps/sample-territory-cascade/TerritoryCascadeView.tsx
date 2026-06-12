import * as React from "react";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SmartLookup } from "../../../shared/controls/smart/SmartLookup";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import type { TerritoryCascadeViewModel } from "./TerritoryCascadeViewModel";

export interface ITerritoryCascadeViewProps {
  viewModel: TerritoryCascadeViewModel;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: "480px",
  },
  summary: { color: tokens.colorNeutralForeground3 },
});

export class TerritoryCascadeView extends ObserverComponent<ITerritoryCascadeViewProps> {
  constructor(props: ITerritoryCascadeViewProps) {
    super(props);
    const vm = props.viewModel;
    // Cascading filters depend on upstream values, re-render on every pick.
    this.observe(vm.territory, vm.account, vm.contact, vm.summary);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<ITerritoryCascadeViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>Territory Cascade</Title3>

      <SmartLookup entity="account" attribute="territoryid" value={vm.territory} label="Territory" />
      {/* key remounts the lookup when its filter scope changes, clearing stale results */}
      <SmartLookup
        key={`account-${vm.territory.value?.id ?? "any"}`}
        entity="account"
        attribute="parentaccountid"
        value={vm.account}
        label="Account in territory"
        filter={vm.accountFilter}
        disabled={!vm.territory.value}
      />
      <SmartLookup
        key={`contact-${vm.account.value?.id ?? "any"}`}
        entity="contact"
        attribute="parentcustomerid"
        value={vm.contact}
        label="Contact at account"
        targetEntity="contact"
        filter={vm.contactFilter}
        disabled={!vm.account.value}
      />
      <SmartOptionSet
        entity="contact"
        attribute="preferredcontactmethodcode"
        value={vm.contactMethod}
      />

      <div>
        <Button appearance="primary" onClick={() => void vm.onApply()} disabled={!vm.contact.value}>
          Apply
        </Button>
      </div>
      {vm.summary.value ? <div className={styles.summary}>{vm.summary.value}</div> : null}
    </div>
  );
};
