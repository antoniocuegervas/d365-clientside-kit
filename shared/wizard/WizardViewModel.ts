import { Observable, type ISubscribable } from "../reactivity/Observable";
import { SubscriptionTracker } from "../reactivity/SubscriptionTracker";

/** One wizard step in domain terms. The View maps these to the Stepper. */
export interface IWizardStep {
  key: string;
  label: string;
}

/**
 * Reusable engine for a multi-step, gated data-input flow on the kit's MVVM +
 * Observables model. Concrete wizards extend it: declare the `steps`, expose
 * draft Observables, gate each step with `isStepValid`, and persist in
 * `commit`. The draft lives in memory until Finish, so the flow never leaves
 * half-entered records behind, and because `commit` goes through the normal
 * create/update path, server-side logic still runs on the final write.
 *
 * It is deliberately independent of a record's business process flow: hosted as
 * a webresource it is just custom UI over the Web API, so it can run on a record
 * that is mid-process without touching its stage.
 */
export abstract class WizardViewModel {
  /** Ordered steps; the concrete wizard supplies the list. */
  abstract readonly steps: IWizardStep[];

  /** Zero-based index of the step on screen. */
  readonly currentIndex = new Observable<number>(0);
  /** Whether the current step's inputs satisfy its gate (Next/Finish enabled). */
  readonly canAdvance = new Observable<boolean>(false);
  /** True while `commit` runs, navigation is locked meanwhile. */
  readonly isBusy = new Observable<boolean>(false);
  /** True once the draft has any edit, the host can guard an unsaved close. */
  readonly isDirty = new Observable<boolean>(false);
  /** Set true after a successful Finish, the View shows a result, host can refresh. */
  readonly completed = new Observable<boolean>(false);

  protected readonly tracker = new SubscriptionTracker();

  /** Per-step gate. Return true when step `index` may be left via Next/Finish. */
  protected abstract isStepValid(index: number): boolean;
  /** Persist the draft. Concrete wizards implement the create/update sequence. */
  protected abstract commit(): Promise<void>;

  get isFirstStep(): boolean {
    return this.currentIndex.value === 0;
  }

  get isLastStep(): boolean {
    return this.currentIndex.value === this.steps.length - 1;
  }

  /**
   * Wires the draft Observables so `canAdvance` re-evaluates the current step's
   * gate on every edit and `isDirty` flips on the first one. Concrete wizards
   * call this once, from their constructor, with every draft Observable.
   */
  protected track(...draft: ISubscribable[]): void {
    const recompute = (): void => {
      this.canAdvance.value = this.isStepValid(this.currentIndex.value);
    };
    this.tracker.add(this.currentIndex.subscribe(recompute));
    for (const observable of draft) {
      this.tracker.add(
        observable.subscribe(() => {
          this.isDirty.value = true;
          recompute();
        })
      );
    }
    recompute();
  }

  readonly back = (): void => {
    if (!this.isFirstStep) {
      this.currentIndex.value -= 1;
    }
  };

  readonly next = (): void => {
    if (!this.isLastStep && this.isStepValid(this.currentIndex.value)) {
      this.currentIndex.value += 1;
    }
  };

  readonly finish = async (): Promise<void> => {
    if (this.isBusy.value || !this.isStepValid(this.currentIndex.value)) {
      return;
    }
    this.isBusy.value = true;
    try {
      await this.commit();
      if (!this.tracker.isDisposed) {
        this.completed.value = true;
        this.isDirty.value = false;
      }
    } catch {
      // commit() surfaces its own error UI; leave the wizard open for a retry.
    } finally {
      if (!this.tracker.isDisposed) {
        this.isBusy.value = false;
      }
    }
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
