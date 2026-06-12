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
  picker: { maxWidth: "420px" },
  stage: { flexGrow: 1, minHeight: 0, overflowY: "auto" },
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
      <Divider />
      <div className={styles.stage}>
        {/* key forces a fresh mount per app so ViewModels never leak across swaps */}
        {current ? <div key={currentKey}>{current.render(host)}</div> : null}
      </div>
    </div>
  );
};
