import * as React from "react";
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
} from "@fluentui/react-components";

export interface IDegradedStateProps {
  /** Short headline, e.g. "Opportunity Search is unavailable here". */
  title?: string;
  /**
   * Plain-language explanation of what is missing and why. Never raw SDK error
   * text: the host maps the failure to a friendly message before it reaches here.
   */
  message: string;
  /** MessageBar intent. Default "warning". */
  intent?: "info" | "warning" | "error" | "success";
}

const useStyles = makeStyles({
  root: { maxWidth: "720px" },
});

/**
 * Friendly degraded-state banner for when a sample cannot run in the current
 * environment (a missing entity or field). Shown in place of raw SDK errors, so
 * every sample degrades the same readable way. A thin wrapper over Fluent's
 * MessageBar; the host decides the wording.
 */
export class DegradedState extends React.Component<IDegradedStateProps> {
  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IDegradedStateProps> = (props) => {
  const styles = useStyles();
  return (
    // multiline layout wraps the message body onto as many lines as it needs,
    // instead of the single-line default that runs a long explanation off the end
    // of the bar. A short message stays a single line either way.
    <MessageBar className={styles.root} intent={props.intent ?? "warning"} layout="multiline">
      <MessageBarBody>
        {props.title ? <MessageBarTitle>{props.title}</MessageBarTitle> : null} {props.message}
      </MessageBarBody>
    </MessageBar>
  );
};
