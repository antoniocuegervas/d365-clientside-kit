import * as React from "react";
import { Button, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import type { TemplateViewModel } from "./TemplateViewModel";

/**
 * Template View, reads like a form layout: metadata-aware blocks
 * with entity + attribute, no hand-wired option lists or labels. This is the
 * file to copy when starting a new app.
 */
export interface ITemplateViewProps {
  viewModel: TemplateViewModel;
}

const useStyles = makeStyles({
  // The page owns its own scroll: the shell (clientui.html) pins html/body
  // overflow hidden, so an app taller than the viewport is unreachable unless its
  // root scrolls. height 100% bounds the page to the shell, overflowY auto scrolls
  // the overflow, and overflowX hidden keeps a focused field's 1px focus-underline
  // bleed from popping a horizontal scrollbar. Keep this block when copying.
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: "480px",
    boxSizing: "border-box",
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
  },
  actions: { display: "flex", columnGap: tokens.spacingHorizontalS },
  message: { color: tokens.colorNeutralForeground2 },
});

export class TemplateView extends ObserverComponent<ITemplateViewProps> {
  constructor(props: ITemplateViewProps) {
    super(props);
    this.observe(props.viewModel.isSaving, props.viewModel.saveMessage);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<ITemplateViewProps> = ({ viewModel }) => {
  const styles = useStyles();
  return (
    <div className={styles.page}>
      <Title3>New Account</Title3>

      {/* Form-designer ergonomics: entity + attribute is the whole config. */}
      <SmartTextField entity="account" attribute="name" value={viewModel.accountName} />
      <SmartOptionSet entity="account" attribute="industrycode" value={viewModel.industry} />

      <div className={styles.actions}>
        <Button
          appearance="primary"
          onClick={() => void viewModel.onSave()}
          disabled={viewModel.isSaving.value}
        >
          {viewModel.isSaving.value ? "Saving…" : "Save"}
        </Button>
      </div>
      {viewModel.saveMessage.value ? (
        <div className={styles.message}>{viewModel.saveMessage.value}</div>
      ) : null}
    </div>
  );
};
