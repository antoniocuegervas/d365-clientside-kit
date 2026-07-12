import * as React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowLeftRegular } from "@fluentui/react-icons";

export interface IFullPageBackBarProps {
  /** Invoked when Back is chosen. The shell wires this to its own window's history. */
  onBack: () => void;
}

const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "center",
    // Fixed height beside the scrolling app region: the bar never grows or shrinks
    // to take the app's scroll space.
    flexShrink: 0,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

/**
 * Slim Back bar the shell renders above a full-page launch. openClientUI's
 * full-page mode (taken automatically on a narrow viewport) opens the shell as a
 * full page, which the platform gives no back chrome on the web client, so the
 * app supplies its own. The shell gates it (full-page marker plus the web client),
 * so it never appears for a dialog, sitemap, or non-web hosting.
 */
export class FullPageBackBar extends React.Component<IFullPageBackBarProps> {
  override render(): React.ReactNode {
    return <Body onBack={this.props.onBack} />;
  }
}

/** Function child only for makeStyles access; the bar holds no state. */
const Body: React.FC<IFullPageBackBarProps> = (props) => {
  const styles = useStyles();
  return (
    <div className={styles.bar}>
      <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={props.onBack}>
        Back
      </Button>
    </div>
  );
};
