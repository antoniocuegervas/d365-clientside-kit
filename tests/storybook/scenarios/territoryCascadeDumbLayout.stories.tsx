import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { territoryRefs, accountRefs, contactRefs, contactMethodOptions } from "../fixtures";

/**
 * Interactive counterpart of sample-territory-cascade: the multi-lookup cascade
 * plus option set. Pick a territory and the account lookup enables and scopes to
 * accounts in that territory; pick an account and the contact lookup enables and
 * scopes to its contacts. Changing an upstream pick resets everything below it,
 * exactly as the live ViewModel gates and clears them, here over fixture data.
 */
const meta: Meta = {
  title: "Sample Patterns/Territory Cascade",
  parameters: {
    docs: {
      description: {
        component:
          "Cascading lookups: pick a territory and the account lookup enables and scopes to that " +
          "territory; pick an account and the contact lookup enables and scopes to its contacts. " +
          "Changing an upstream pick clears everything below it. The rendered demo runs over " +
          "fixtures. The Show code panel is the real version: each SmartLookup is gated on its " +
          "parent and scoped with a `filter` built from the parent's id.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

// Fixture relationships the smart tier would resolve from Dataverse filters.
const accountsByTerritory: Record<string, IEntityReference[]> = {
  [territoryRefs[0].id]: [accountRefs[0], accountRefs[1]], // EMEA
  [territoryRefs[1].id]: [accountRefs[2], accountRefs[3]], // Americas
  [territoryRefs[2].id]: [], // APAC: none yet
};
const contactsByAccount: Record<string, IEntityReference[]> = {
  [accountRefs[0].id]: [contactRefs[0]],
  [accountRefs[1].id]: [contactRefs[1]],
  [accountRefs[2].id]: [contactRefs[2]],
  [accountRefs[3].id]: [],
};

const byName = (text: string) => (ref: IEntityReference): boolean =>
  (ref.name ?? "").toLowerCase().includes(text.toLowerCase());

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: "480px",
    boxSizing: "border-box",
    // Mirror the real app's hosting: the shell pins body overflow hidden and the
    // page owns the scroll, so the story reproduces the same vertical space
    // pressure the live app is under.
    height: "100vh",
    overflowY: "auto",
  },
  summary: { color: tokens.colorNeutralForeground3 },
});

interface ITerritoryBody {
  territory: Observable<IEntityReference | null>;
  territoryResults: Observable<IEntityReference[]>;
  account: Observable<IEntityReference | null>;
  accountResults: Observable<IEntityReference[]>;
  contact: Observable<IEntityReference | null>;
  contactResults: Observable<IEntityReference[]>;
  contactMethod: Observable<number | null>;
  summary: Observable<string | null>;
  onTerritory: (v: IEntityReference | null) => void;
  onAccount: (v: IEntityReference | null) => void;
  searchTerritory: (text: string) => void;
  searchAccount: (text: string) => void;
  searchContact: (text: string) => void;
  onApply: () => void;
}

class TerritoryCascadeDemo extends ObserverComponent {
  private readonly territory = new Observable<IEntityReference | null>(null);
  private readonly territoryResults = new Observable<IEntityReference[]>([]);
  private readonly account = new Observable<IEntityReference | null>(null);
  private readonly accountResults = new Observable<IEntityReference[]>([]);
  private readonly contact = new Observable<IEntityReference | null>(null);
  private readonly contactResults = new Observable<IEntityReference[]>([]);
  private readonly contactMethod = new Observable<number | null>(null);
  private readonly summary = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    // Re-render on each pick so the gating (disabled state) and downstream
    // resets are reflected immediately.
    this.observe(this.territory, this.account, this.contact, this.summary);
  }

  private readonly onTerritory = (v: IEntityReference | null): void => {
    this.territory.value = v;
    this.account.value = null;
    this.contact.value = null;
  };

  private readonly onAccount = (v: IEntityReference | null): void => {
    this.account.value = v;
    this.contact.value = null;
  };

  private readonly searchTerritory = (text: string): void => {
    this.territoryResults.value = territoryRefs.filter(byName(text));
  };

  private readonly searchAccount = (text: string): void => {
    const pool = this.territory.value ? accountsByTerritory[this.territory.value.id] ?? [] : [];
    this.accountResults.value = pool.filter(byName(text));
  };

  private readonly searchContact = (text: string): void => {
    const pool = this.account.value ? contactsByAccount[this.account.value.id] ?? [] : [];
    this.contactResults.value = pool.filter(byName(text));
  };

  private readonly onApply = (): void => {
    const contact = this.contact.value;
    if (!contact) {
      this.summary.value = "Pick a contact first.";
      return;
    }
    const method =
      contactMethodOptions.find((o) => o.value === this.contactMethod.value)?.label ?? "unchanged";
    this.summary.value = `Preferred contact method (${method}) saved for ${contact.name ?? contact.id}.`;
  };

  override render(): React.ReactNode {
    return (
      <Body
        territory={this.territory}
        territoryResults={this.territoryResults}
        account={this.account}
        accountResults={this.accountResults}
        contact={this.contact}
        contactResults={this.contactResults}
        contactMethod={this.contactMethod}
        summary={this.summary}
        onTerritory={this.onTerritory}
        onAccount={this.onAccount}
        searchTerritory={this.searchTerritory}
        searchAccount={this.searchAccount}
        searchContact={this.searchContact}
        onApply={this.onApply}
      />
    );
  }
}

const Body: React.FC<ITerritoryBody> = (props) => {
  const styles = useStyles();
  const hasTerritory = props.territory.value !== null;
  const hasAccount = props.account.value !== null;
  return (
    <div className={styles.page}>
      <Title3>Territory Cascade</Title3>

      <LookupField
        label="Territory"
        selected={props.territory}
        results={props.territoryResults}
        onSearchTextChanged={props.searchTerritory}
        onChange={props.onTerritory}
      />
      <LookupField
        key={`account-${props.territory.value?.id ?? "none"}`}
        label="Account in territory"
        selected={props.account}
        results={props.accountResults}
        onSearchTextChanged={props.searchAccount}
        onChange={props.onAccount}
        disabled={!hasTerritory}
      />
      <LookupField
        key={`contact-${props.account.value?.id ?? "none"}`}
        label="Contact at account"
        selected={props.contact}
        results={props.contactResults}
        onSearchTextChanged={props.searchContact}
        onChange={(v) => (props.contact.value = v)}
        disabled={!hasAccount}
      />
      <OptionSetField
        label="Preferred contact method"
        options={contactMethodOptions}
        selectedValue={props.contactMethod}
        onChange={(v) => (props.contactMethod.value = v)}
      />

      <div>
        <Button appearance="primary" onClick={props.onApply} disabled={!props.contact.value}>
          Apply
        </Button>
      </div>
      {props.summary.value ? <div className={styles.summary}>{props.summary.value}</div> : null}
    </div>
  );
};

export const Layout: Story = {
  name: "Cascading lookups, option set",
  render: () => <TerritoryCascadeDemo />,
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `// Cascading lookups. The ViewModel clears every downstream pick when an
// upstream one changes, so a stale child can never survive a parent edit.
class TerritoryCascadeViewModel {
  readonly territory = new Observable<IEntityReference | null>(null);
  readonly account = new Observable<IEntityReference | null>(null);
  readonly contact = new Observable<IEntityReference | null>(null);

  onTerritory = (v: IEntityReference | null) => {
    this.territory.value = v;
    this.account.value = null; // reset everything below
    this.contact.value = null;
  };
  onAccount = (v: IEntityReference | null) => {
    this.account.value = v;
    this.contact.value = null;
  };
}

// Each SmartLookup is gated on its parent (disabled until set) and scoped with
// a filter built from the parent's id, so the search only offers valid records.
<SmartLookup entity="lead" attribute="territoryid" value={vm.territory} onChange={vm.onTerritory} />
<SmartLookup
  entity="lead"
  attribute="parentaccountid"
  value={vm.account}
  onChange={vm.onAccount}
  disabled={!vm.territory.value}
  filter={\`_territoryid_value eq \${vm.territory.value?.id}\`}
/>
<SmartLookup
  entity="lead"
  attribute="parentcontactid"
  value={vm.contact}
  disabled={!vm.account.value}
  filter={\`_parentcustomerid_value eq \${vm.account.value?.id}\`}
/>`,
      },
    },
  },
};
