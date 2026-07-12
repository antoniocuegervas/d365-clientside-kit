import * as React from "react";
import { Button, Text, Title3, makeStyles, tokens } from "@fluentui/react-components";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../shared/reactivity/ObserverComponent";
import { Stepper, type IStepperStep } from "../../../shared/controls/presentational/Stepper";
import { TextField } from "../../../shared/controls/presentational/TextField";
import { OptionSetField } from "../../../shared/controls/presentational/OptionSetField";
import { industryOptions } from "../fixtures";

/**
 * Interactive counterpart of sample-new-account-wizard: a multi-step gated
 * input over the presentational Stepper. Each step gates Next until its
 * required field is filled, an in-memory draft carries across steps, and the
 * final step commits it. Composed with fixture data only; the live app commits
 * the draft to Dataverse and opens the new record, where this demo starts over.
 */
const meta: Meta = {
  title: "Sample Patterns/New Account Wizard",
  parameters: {
    docs: {
      description: {
        component:
          "A gated multi-step wizard: each step gates Next until its required field is set, a draft " +
          "carries across steps, and Create commits it. The rendered demo runs over fixtures and " +
          "starts over on finish. The Show code panel is the real version: a concrete " +
          "`WizardViewModel` that declares the steps, validates each, and commits the draft to " +
          "Dataverse, with smart fields inside each step.",
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
  // Match the live View: a content-sized card so Back/Next sit in a footer under
  // the fields instead of floating at the bottom of the canvas.
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

class NewAccountWizardDemo extends ObserverComponent {
  readonly steps: IStepperStep[] = [
    { key: "account", label: "Account" },
    { key: "contact", label: "Primary contact" },
    { key: "review", label: "Review" },
  ];

  readonly currentIndex = new Observable(0);
  readonly canAdvance = new Observable(false);
  readonly completed = new Observable(false);
  readonly summary = new Observable<string | null>(null);

  readonly accountName = new Observable<string | null>(null);
  readonly industry = new Observable<number | null>(null);
  readonly firstName = new Observable<string | null>(null);
  readonly lastName = new Observable<string | null>(null);
  readonly email = new Observable<string | null>(null);

  constructor(props: object) {
    super(props);
    // Pre-seed the first step so the wizard opens mid-flow with Next enabled,
    // rather than an empty step whose disabled Next reads as broken. Clearing the
    // field still demonstrates the per-step gating.
    this.accountName.value = "Fabrikam Coffee";
    this.recompute();
    this.observe(this.currentIndex, this.completed, this.summary);
  }

  /** Recompute the current step's gate, mirroring the ViewModel's per-step rule. */
  readonly recompute = (): void => {
    const index = this.currentIndex.value;
    if (index === 0) {
      this.canAdvance.value = (this.accountName.value ?? "").trim().length > 0;
    } else if (index === 1) {
      this.canAdvance.value = (this.lastName.value ?? "").trim().length > 0;
    } else {
      this.canAdvance.value = true;
    }
  };

  readonly back = (): void => {
    if (this.currentIndex.value > 0) {
      this.currentIndex.value -= 1;
      this.recompute();
    }
  };

  readonly next = (): void => {
    if (this.currentIndex.value < this.steps.length - 1) {
      this.currentIndex.value += 1;
      this.recompute();
    }
  };

  readonly finish = (): void => {
    const contact = [this.firstName.value, this.lastName.value].filter(Boolean).join(" ");
    this.summary.value = `Created account "${this.accountName.value ?? ""}"${
      contact ? ` with primary contact ${contact}` : ""
    }.`;
    this.completed.value = true;
  };

  readonly startOver = (): void => {
    this.accountName.value = null;
    this.industry.value = null;
    this.firstName.value = null;
    this.lastName.value = null;
    this.email.value = null;
    this.summary.value = null;
    this.completed.value = false;
    this.currentIndex.value = 0;
    this.recompute();
  };

  override render(): React.ReactNode {
    return <Body demo={this} />;
  }
}

const Body: React.FC<{ demo: NewAccountWizardDemo }> = ({ demo }) => {
  const styles = useStyles();

  if (demo.completed.value) {
    return (
      <div className={styles.page}>
        <Title3>New Account Wizard</Title3>
        <div className={styles.card}>
          <div className={styles.result}>
            <Text>{demo.summary.value}</Text>
            <div>
              <Button appearance="primary" onClick={demo.startOver}>
                Start over
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
          steps={demo.steps}
          currentIndex={demo.currentIndex}
          canAdvance={demo.canAdvance}
          finishLabel="Create"
          onBack={demo.back}
          onNext={demo.next}
          onFinish={demo.finish}
        >
          <StepBody demo={demo} />
        </Stepper>
      </div>
    </div>
  );
};

/** The body for the current step, re-mounted by the Stepper on step change. */
const StepBody: React.FC<{ demo: NewAccountWizardDemo }> = ({ demo }) => {
  const styles = useStyles();
  switch (demo.currentIndex.value) {
    case 0:
      return (
        <div className={styles.fields}>
          <TextField
            label="Account Name"
            value={demo.accountName}
            onChange={(v) => {
              demo.accountName.value = v;
              demo.recompute();
            }}
          />
          <OptionSetField
            label="Industry"
            options={industryOptions}
            selectedValue={demo.industry}
            onChange={(v) => (demo.industry.value = v)}
          />
        </div>
      );
    case 1:
      return (
        <div className={styles.fields}>
          <TextField
            label="First Name"
            value={demo.firstName}
            onChange={(v) => {
              demo.firstName.value = v;
              demo.recompute();
            }}
          />
          <TextField
            label="Last Name"
            value={demo.lastName}
            onChange={(v) => {
              demo.lastName.value = v;
              demo.recompute();
            }}
          />
          <TextField
            label="Email"
            value={demo.email}
            onChange={(v) => (demo.email.value = v)}
          />
        </div>
      );
    default:
      return (
        <div className={styles.review}>
          <ReviewRow label="Account" value={demo.accountName.value} />
          <ReviewRow
            label="Primary contact"
            value={[demo.firstName.value, demo.lastName.value].filter(Boolean).join(" ") || null}
          />
          <ReviewRow label="Email" value={demo.email.value} />
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

export const Layout: Story = {
  name: "Gated multi-step wizard",
  render: () => <NewAccountWizardDemo />,
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `// A concrete WizardViewModel declares the steps, validates each one, and
// commits the draft. The base class owns currentIndex/canAdvance/next/back and
// re-evaluates the current step's gate whenever a draft Observable changes.
class NewAccountWizardViewModel extends WizardViewModel {
  readonly steps = [
    { key: "account", label: "Account" },
    { key: "contact", label: "Primary contact" },
    { key: "review", label: "Review" },
  ];

  readonly accountName = new Observable<string | null>(null);
  readonly industry = new Observable<number | null>(null);
  readonly lastName = new Observable<string | null>(null);

  protected isStepValid(index: number): boolean {
    if (index === 0) return !!this.accountName.value?.trim();
    if (index === 1) return !!this.lastName.value?.trim();
    return true; // review
  }

  protected async commit(): Promise<void> {
    const account = await this.ctx.webAPI.createRecord("account", {
      name: this.accountName.value,
      industrycode: this.industry.value,
    });
    await this.ctx.webAPI.createRecord("contact", {
      lastname: this.lastName.value,
      "parentcustomerid_account@odata.bind": \`/accounts(\${account.id})\`,
    });
    await this.ctx.navigation.openForm("account", account.id);
  }
}

// The View hosts the Stepper and puts smart fields in each step.
<Stepper
  steps={vm.steps}
  currentIndex={vm.currentIndex}
  canAdvance={vm.canAdvance}
  finishLabel="Create"
  onBack={vm.back}
  onNext={vm.next}
  onFinish={vm.finish}
>
  <SmartTextField entity="account" attribute="name" value={vm.accountName} />
  <SmartOptionSet entity="account" attribute="industrycode" value={vm.industry} />
</Stepper>`,
      },
    },
  },
};
