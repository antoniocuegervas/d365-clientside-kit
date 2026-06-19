import * as React from "react";
import { Button, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import { ObserverComponent } from "../../reactivity/ObserverComponent";
import type { Observable } from "../../reactivity/Observable";

/** One step header entry. Structurally compatible with a ViewModel's steps. */
export interface IStepperStep {
  key: string;
  label: string;
}

export interface IStepperProps {
  steps: IStepperStep[];
  /** Host-owned current step index. */
  currentIndex: Observable<number>;
  /** Current step's gate; Next/Finish are disabled when false. */
  canAdvance: Observable<boolean>;
  /** True while the wizard commits; locks navigation. */
  isBusy?: Observable<boolean>;
  /** Label for the final action. Default "Finish". */
  finishLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** The current step's body. */
  children?: React.ReactNode;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalL, height: "100%" },
  header: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXS, flexWrap: "wrap" },
  step: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalXS },
  marker: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground5,
    color: tokens.colorNeutralForeground3,
  },
  markerActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  label: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground3 },
  labelCurrent: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  separator: {
    flexGrow: 1,
    height: "1px",
    minWidth: "16px",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  body: { flexGrow: 1, minHeight: 0, overflowY: "auto" },
  footer: { display: "flex", justifyContent: "space-between", columnGap: tokens.spacingHorizontalS },
});

/**
 * Presentational stepper: a step header, the current step's body, and
 * Back / Next / Finish. CRM-agnostic, it renders supplied Observables and
 * raises events; the WizardViewModel owns sequence, gating, and commit.
 */
export class Stepper extends ObserverComponent<IStepperProps> {
  constructor(props: IStepperProps) {
    super(props);
    this.observe(props.currentIndex, props.canAdvance, props.isBusy);
  }

  override render(): React.ReactNode {
    return <Body {...this.props} />;
  }
}

const Body: React.FC<IStepperProps> = (props) => {
  const styles = useStyles();
  const { steps, finishLabel, onBack, onNext, onFinish, children } = props;
  const current = props.currentIndex.value;
  const busy = props.isBusy?.value ?? false;
  const canAdvance = props.canAdvance.value;
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {steps.map((step, index) => {
          const done = index < current;
          const isCurrent = index === current;
          return (
            <React.Fragment key={step.key}>
              {index > 0 ? <span className={styles.separator} aria-hidden /> : null}
              <div className={styles.step}>
                <span
                  className={mergeClasses(styles.marker, (done || isCurrent) && styles.markerActive)}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {done ? <CheckmarkRegular fontSize={16} /> : index + 1}
                </span>
                <span className={mergeClasses(styles.label, isCurrent && styles.labelCurrent)}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className={styles.body}>{children}</div>

      <div className={styles.footer}>
        <Button appearance="secondary" onClick={onBack} disabled={isFirst || busy}>
          Back
        </Button>
        {isLast ? (
          <Button appearance="primary" onClick={onFinish} disabled={!canAdvance || busy}>
            {busy ? "Working…" : finishLabel ?? "Finish"}
          </Button>
        ) : (
          <Button appearance="primary" onClick={onNext} disabled={!canAdvance || busy}>
            Next
          </Button>
        )}
      </div>
    </div>
  );
};
