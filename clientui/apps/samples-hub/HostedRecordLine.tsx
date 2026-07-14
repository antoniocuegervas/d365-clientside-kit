import * as React from "react";
import { Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { SmartComponent } from "../../../shared/context/ViewModelContextProvider";

/**
 * One line of the hub's own UI that names the hosting record when the shell runs
 * beside a form (the clienthooks injected-host path), and renders nothing
 * everywhere else, so sitemap and quick-test hostings look exactly as
 * before. It POLLS form access rather than reading it once: the injection
 * lands through getContentWindow's promise on the form's own schedule, so
 * form access can resolve after boot, and this line is the kit's own
 * visible proof that the late adoption works.
 */

interface IHostedRecordState {
  recordId: string | null;
  entityName: string | null;
}

const useStyles = makeStyles({
  line: { color: tokens.colorNeutralForeground3 },
});

export class HostedRecordLine extends SmartComponent<object, IHostedRecordState> {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(props: object) {
    super(props);
    this.state = { recordId: null, entityName: null };
  }

  override componentDidMount(): void {
    this.check();
    this.timer = setInterval(() => this.check(), 500);
  }

  protected override onUnmount(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private check(): void {
    const formAccess = this.vmContext.formAccess;
    const recordId = formAccess?.getRecordId() ?? null;
    if (recordId && recordId !== this.state.recordId) {
      this.setState({ recordId, entityName: formAccess?.getEntityName() ?? null });
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }
  }

  override render(): React.ReactNode {
    if (!this.state.recordId) {
      return null;
    }
    return <Line recordId={this.state.recordId} entityName={this.state.entityName} />;
  }
}

const Line: React.FC<{ recordId: string; entityName: string | null }> = (props) => {
  const styles = useStyles();
  return (
    <Caption1 className={styles.line}>
      Hosted beside {props.entityName ?? "a"} record {props.recordId}
    </Caption1>
  );
};
