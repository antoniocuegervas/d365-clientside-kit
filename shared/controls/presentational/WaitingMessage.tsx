import * as React from "react";
import { Spinner, makeStyles, tokens } from "@fluentui/react-components";

/**
 * Standard loading presentation, smart wrappers and RecordReady show
 * this while metadata or the form record loads, so the kit has ONE loading
 * look instead of per-app spinners.
 */
export interface IWaitingMessageProps {
  message?: string;
  /** Compact inline variant for field-sized placeholders. */
  inline?: boolean;
}

const useStyles = makeStyles({
  block: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingVerticalXXL,
  },
  inline: {
    display: "flex",
    alignItems: "center",
    padding: tokens.spacingVerticalXS,
  },
});

export class WaitingMessage extends React.Component<IWaitingMessageProps> {
  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IWaitingMessageProps> = (props) => {
  const styles = useStyles();
  return (
    <div className={props.inline ? styles.inline : styles.block}>
      <Spinner size={props.inline ? "tiny" : "small"} label={props.message ?? "Loading…"} />
    </div>
  );
};
