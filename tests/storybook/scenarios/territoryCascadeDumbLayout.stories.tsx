import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { LookupField } from "../../../shared/controls/presentational/LookupField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { territoryRefs, accountRefs, contactRefs, contactMethodOptions } from "../fixtures";

/**
 * Dumb counterpart of sample-territory-cascade, the multi-lookup
 * cascade + option set. Downstream pickers are disabled until their upstream
 * value is chosen, exactly as the live app gates them; here that gating is
 * shown statically (territory + account picked, contact open).
 */
const meta: Meta = {
  title: "Sample Patterns/Territory Cascade (dumb layout)",
};
export default meta;
type Story = StoryObj;

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: "480px",
  },
});

const search =
  (source: IEntityReference[], results: Observable<IEntityReference[]>) => (text: string) =>
    (results.value = source.filter((r) =>
      (r.name ?? "").toLowerCase().includes(text.toLowerCase())
    ));

const TerritoryCascadeDumbLayout: React.FC = () => {
  const styles = useStyles();
  const territory = new Observable<IEntityReference | null>(territoryRefs[0]);
  const territoryResults = new Observable<IEntityReference[]>([]);
  const account = new Observable<IEntityReference | null>(accountRefs[0]);
  const accountResults = new Observable<IEntityReference[]>([]);
  const contact = new Observable<IEntityReference | null>(null);
  const contactResults = new Observable<IEntityReference[]>([]);
  const contactMethod = new Observable<number | null>(2);

  return (
    <div className={styles.page}>
      <Title3>Territory Cascade</Title3>

      <LookupField
        label="Territory"
        selected={territory}
        results={territoryResults}
        onSearchTextChanged={search(territoryRefs, territoryResults)}
        onChange={(v) => (territory.value = v)}
      />
      <LookupField
        label="Account in territory"
        selected={account}
        results={accountResults}
        onSearchTextChanged={search(accountRefs, accountResults)}
        onChange={(v) => (account.value = v)}
      />
      <LookupField
        label="Contact at account"
        selected={contact}
        results={contactResults}
        onSearchTextChanged={search(contactRefs, contactResults)}
        onChange={(v) => (contact.value = v)}
      />
      <OptionSetField
        label="Preferred contact method"
        options={contactMethodOptions}
        selectedValue={contactMethod}
        onChange={(v) => (contactMethod.value = v)}
      />

      <div>
        <Button appearance="primary">Apply</Button>
      </div>
    </div>
  );
};

export const Layout: Story = {
  name: "Cascading lookups + option set",
  render: () => <TerritoryCascadeDumbLayout />,
};
