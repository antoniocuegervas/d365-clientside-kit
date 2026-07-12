import * as React from "react";
import { Button, Text, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { Stepper } from "../../../shared/controls/presentational/Stepper";
import { SmartTextField } from "../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../shared/controls/smart/SmartOptionSet";
import type { NewAccountWizardViewModel } from "./NewAccountWizardViewModel";

export interface INewAccountWizardViewProps {
  viewModel: NewAccountWizardViewModel;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    boxSizing: "border-box",
    // The shell pins body overflow hidden, so the app owns its inner scroll.
    // Without this the wizard's card sizes to its content and a taller step (or a
    // validation message) pushes Back and Next below an unreachable fold; bounding
    // the page to full height lets it scroll and keeps the footer reachable.
    // overflowX hidden because overflowY auto alone lets the browser turn on a
    // horizontal scrollbar for a focused field's 1px focus-underline bleed.
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
  },
  // The wizard is a card sized to its content, so Back/Next sit in a footer right
  // under the fields instead of floating at the viewport bottom.
  card: {
    display: "flex",
    flexDirection: "column",
    rowGap: tokens.spacingVerticalM,
    maxWidth: "640px",
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fields: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
  review: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  reviewRow: { display: "flex", columnGap: tokens.spacingHorizontalS },
  reviewLabel: { color: tokens.colorNeutralForeground3, minWidth: "120px" },
  result: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalM },
});

export class NewAccountWizardView extends ObserverComponent<INewAccountWizardViewProps> {
  constructor(props: INewAccountWizardViewProps) {
    super(props);
    const vm = props.viewModel;
    this.observe(vm.currentIndex, vm.canAdvance, vm.isBusy, vm.completed, vm.summary);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<INewAccountWizardViewProps> = ({ viewModel: vm }) => {
  const styles = useStyles();

  if (vm.completed.value) {
    return (
      <div className={styles.page}>
        <Title3>New Account Wizard</Title3>
        <div className={styles.card}>
          <div className={styles.result}>
            <Text>{vm.summary.value}</Text>
            <div>
              <Button appearance="primary" onClick={vm.openCreatedAccount}>
                Open account
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Title3>New Account Wizard</Title3>
      <div className={styles.card}>
        <Stepper
          steps={vm.steps}
          currentIndex={vm.currentIndex}
          canAdvance={vm.canAdvance}
          isBusy={vm.isBusy}
          finishLabel="Create"
          onBack={vm.back}
          onNext={vm.next}
          onFinish={() => void vm.finish()}
        >
          <StepBody vm={vm} />
        </Stepper>
      </div>
    </div>
  );
};

/** The body for the current step. Re-rendered by the View on step change. */
const StepBody: React.FC<{ vm: NewAccountWizardViewModel }> = ({ vm }) => {
  const styles = useStyles();
  switch (vm.currentIndex.value) {
    case 0:
      return (
        <div className={styles.fields}>
          <SmartTextField entity="account" attribute="name" value={vm.accountName} />
          <SmartOptionSet entity="account" attribute="industrycode" value={vm.industry} />
        </div>
      );
    case 1:
      return (
        <div className={styles.fields}>
          <SmartTextField entity="contact" attribute="firstname" value={vm.firstName} />
          <SmartTextField entity="contact" attribute="lastname" value={vm.lastName} />
          <SmartTextField entity="contact" attribute="emailaddress1" value={vm.email} />
        </div>
      );
    default:
      return (
        <div className={styles.review}>
          <ReviewRow label="Account" value={vm.accountName.value} />
          <ReviewRow
            label="Primary contact"
            value={[vm.firstName.value, vm.lastName.value].filter(Boolean).join(" ") || null}
          />
          <ReviewRow label="Email" value={vm.email.value} />
          <Text>Choose Create to save the account and its primary contact.</Text>
        </div>
      );
  }
};

const ReviewRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => {
  const styles = useStyles();
  return (
    <div className={styles.reviewRow}>
      <Text className={styles.reviewLabel}>{label}</Text>
      <Text>{value ?? "(not set)"}</Text>
    </div>
  );
};
