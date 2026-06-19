import { Observable } from "../../../../shared/reactivity/Observable";
import { WizardViewModel, type IWizardStep } from "../../../../shared/wizard/WizardViewModel";

/** Minimal concrete wizard: step 0 requires a name, step 1 is always valid. */
class TestWizard extends WizardViewModel {
  readonly steps: IWizardStep[] = [
    { key: "one", label: "One" },
    { key: "two", label: "Two" },
  ];
  readonly name = new Observable<string | null>(null);
  commitCount = 0;
  shouldThrow = false;

  constructor() {
    super();
    this.track(this.name);
  }

  protected isStepValid(index: number): boolean {
    return index === 0 ? !!this.name.value : true;
  }

  protected async commit(): Promise<void> {
    if (this.shouldThrow) {
      throw new Error("commit failed");
    }
    this.commitCount += 1;
  }
}

describe("WizardViewModel", () => {
  it("gates Next on the current step and tracks canAdvance off the draft", () => {
    const wizard = new TestWizard();
    expect(wizard.canAdvance.value).toBe(false);

    wizard.next();
    expect(wizard.currentIndex.value).toBe(0); // gate closed, no move

    wizard.name.value = "Contoso";
    expect(wizard.canAdvance.value).toBe(true);

    wizard.next();
    expect(wizard.currentIndex.value).toBe(1);
  });

  it("flips isDirty on the first draft edit", () => {
    const wizard = new TestWizard();
    expect(wizard.isDirty.value).toBe(false);
    wizard.name.value = "x";
    expect(wizard.isDirty.value).toBe(true);
  });

  it("clamps navigation at the first and last step", () => {
    const wizard = new TestWizard();
    wizard.back();
    expect(wizard.currentIndex.value).toBe(0);

    wizard.name.value = "x";
    wizard.next();
    wizard.next(); // already last
    expect(wizard.currentIndex.value).toBe(1);
  });

  it("Finish commits and completes when the step is valid", async () => {
    const wizard = new TestWizard();
    wizard.name.value = "x";
    wizard.next();
    await wizard.finish();
    expect(wizard.commitCount).toBe(1);
    expect(wizard.completed.value).toBe(true);
    expect(wizard.isBusy.value).toBe(false);
  });

  it("Finish is a no-op while the current step is invalid", async () => {
    const wizard = new TestWizard(); // step 0, name empty -> invalid
    await wizard.finish();
    expect(wizard.commitCount).toBe(0);
    expect(wizard.completed.value).toBe(false);
  });

  it("Finish surfaces a commit failure without completing", async () => {
    const wizard = new TestWizard();
    wizard.name.value = "x";
    wizard.next();
    wizard.shouldThrow = true;
    await wizard.finish();
    expect(wizard.completed.value).toBe(false);
    expect(wizard.isBusy.value).toBe(false);
  });
});
