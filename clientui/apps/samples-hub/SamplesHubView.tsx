import * as React from "react";
import {
  Divider,
  Dropdown,
  Option,
  Title3,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { Observable } from "../../../shared/reactivity/Observable";
import { getApp, listApps } from "../../registry";
import type { IAppHost } from "../../AppContract";

/**
 * Samples hub: ONE deployed webresource that swaps between sample
 * apps at runtime, demonstrates dynamic app switching without separate
 * deployments. The dropdown is shell chrome, not a CRM field, so it uses
 * Fluent directly rather than a kit field control.
 */
export interface ISamplesHubProps {
  host: IAppHost;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    height: "100%",
    boxSizing: "border-box",
  },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: "640px" },
  picker: { maxWidth: "420px" },
  // Fluent's Divider defaults to flex-grow: 1; in a flex column that makes it grow
  // vertically and push the hosted sample down, so pin it to 0.
  divider: { flexGrow: 0 },
  stage: { flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" },
  // The hosted sample fills the stage and stacks from the top, so its `height:
  // 100%` resolves and its content does not float to the middle as panels appear.
  stageItem: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
  },
});

export class SamplesHubView extends ObserverComponent<ISamplesHubProps> {
  /** Hub-owned state: which sample is on stage. */
  readonly selectedKey = new Observable<string | null>(null);

  constructor(props: ISamplesHubProps) {
    super(props);
    this.observe(this.selectedKey);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} selectedKey={this.selectedKey} />;
  }
}

const Body: React.FC<ISamplesHubProps & { selectedKey: Observable<string | null> }> = ({
  host,
  selectedKey,
}) => {
  const styles = useStyles();
  // Every registered app except the hub itself is demonstrable.
  const samples = listApps().filter((app) => app.key !== "samples");
  const currentKey = selectedKey.value;
  const current = currentKey ? getApp(currentKey) : undefined;

  return (
    <div className={styles.page}>
      <Title3>Sample Apps</Title3>
      <div className={styles.intro}>
        One deployed webresource hosts every sample and swaps between them at runtime, the
        kit's <code>?app=</code> registry in action. Pick a sample to run a metadata-aware
        View and ViewModel, built from the shared controls, live against this org. Each one
        targets standard Dataverse entities, so it works on any environment.
      </div>
      <div className={styles.picker}>
        <Dropdown
          placeholder="Pick a sample to run"
          value={current ? current.title : ""}
          selectedOptions={currentKey ? [currentKey] : []}
          onOptionSelect={(_event, data) => {
            selectedKey.value = data.optionValue ?? null;
          }}
        >
          {samples.map((sample) => (
            <Option key={sample.key} value={sample.key} text={sample.title}>
              {sample.title}
            </Option>
          ))}
        </Dropdown>
      </div>
      <Divider className={styles.divider} />
      <div className={styles.stage}>
        {/* key forces a fresh mount per app, so the outgoing app unmounts and
            its ViewModel is disposed before the next one mounts */}
        {current ? (
          <div key={currentKey} className={styles.stageItem}>
            {current.render(host)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
