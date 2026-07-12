import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Caption1,
  Divider,
  Dropdown,
  Option,
  Text,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";

/**
 * The samples hub shell (title, intro, sample picker, and the swappable stage)
 * recreated on fixture data, the way the other dumb-layout stories recreate their
 * screens. No app registry and no clientui module are imported: the picker lists
 * fixture app names and the stage shows a placeholder, so the hub's chrome renders
 * with zero CRM. The Form hosted story adds the "Hosted beside ... record ..."
 * line the shell shows when it runs beside a form.
 */
const meta: Meta = {
  title: "Sample Patterns/Samples Hub",
  parameters: {
    docs: {
      description: {
        component:
          "One deployed webresource hosts every sample and swaps between them at runtime. This " +
          "recreates that chrome (heading, intro, the sample dropdown, and the stage) on fixtures, " +
          "so the layout is reviewable without an org. The Form hosted variant shows the chrome " +
          "line that names the hosting record when the shell is embedded on a form.",
      },
    },
  },
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
    // Mirror the real app's hosting: the shell pins body overflow hidden and the
    // page owns the scroll, so the story reproduces the same vertical space
    // pressure the live app is under.
    height: "100vh",
    overflowY: "auto",
  },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: "640px" },
  hosted: { color: tokens.colorNeutralForeground3 },
  picker: { maxWidth: "420px" },
  divider: { flexGrow: 0 },
  stage: { display: "flex", flexDirection: "column" },
  // A placeholder standing in for the running sample, so the stage is not empty.
  placeholder: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "160px",
    padding: tokens.spacingHorizontalXXL,
    color: tokens.colorNeutralForeground3,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
});

/** Fixture app names, standing in for the runtime registry the real hub reads. */
const sampleApps = [
  { key: "company-search", title: "Company Search" },
  { key: "counterparty-grid", title: "Counterparty Activities" },
  { key: "new-account-wizard", title: "New Account Wizard" },
  { key: "opportunity-search", title: "Opportunity Search" },
];

interface IHostedRecord {
  entityName: string;
  recordId: string;
}

class SamplesHubDemo extends ObserverComponent<{ hostedRecord?: IHostedRecord }> {
  /** Hub-owned state: which sample is on stage. */
  private readonly selectedKey = new Observable<string | null>(sampleApps[0].key);

  constructor(props: { hostedRecord?: IHostedRecord }) {
    super(props);
    this.observe(this.selectedKey);
  }

  override render(): React.ReactNode {
    return <Body selectedKey={this.selectedKey} hostedRecord={this.props.hostedRecord} />;
  }
}

const Body: React.FC<{ selectedKey: Observable<string | null>; hostedRecord?: IHostedRecord }> = ({
  selectedKey,
  hostedRecord,
}) => {
  const styles = useStyles();
  const currentKey = selectedKey.value;
  const current = sampleApps.find((app) => app.key === currentKey);
  return (
    <div className={styles.page}>
      <Title3>Sample Apps</Title3>
      <div className={styles.intro}>
        One deployed webresource hosts every sample and swaps between them at runtime, the kit's{" "}
        <code>?app=</code> registry in action. Pick a sample to run a metadata-aware View and
        ViewModel built from the shared controls. Each one targets standard Dataverse entities, so
        it works on any environment.
      </div>
      {hostedRecord ? (
        <Caption1 className={styles.hosted}>
          Hosted beside {hostedRecord.entityName} record {hostedRecord.recordId}
        </Caption1>
      ) : null}
      <div className={styles.picker}>
        <Dropdown
          placeholder="Pick a sample to run"
          value={current ? current.title : ""}
          selectedOptions={currentKey ? [currentKey] : []}
          onOptionSelect={(_event, data) => {
            selectedKey.value = data.optionValue ?? null;
          }}
        >
          {sampleApps.map((app) => (
            <Option key={app.key} value={app.key} text={app.title}>
              {app.title}
            </Option>
          ))}
        </Dropdown>
      </div>
      <Divider className={styles.divider} />
      <div className={styles.stage}>
        {current ? (
          <div className={styles.placeholder}>
            <Text>{current.title} runs on this stage.</Text>
          </div>
        ) : (
          <Text className={styles.intro}>Pick a sample above to run it.</Text>
        )}
      </div>
    </div>
  );
};

export const Layout: Story = {
  name: "Hub chrome and stage",
  render: () => <SamplesHubDemo />,
};

export const FormHosted: Story = {
  name: "Hosted beside a record",
  render: () => (
    <SamplesHubDemo hostedRecord={{ entityName: "contact", recordId: "e1f2a3b4-0000-0000-0000-000000000001" }} />
  ),
};
