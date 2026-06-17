import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";

/**
 * Template ViewModel, the shape every app ViewModel follows:
 * constructor(context) → public Observables → handler methods → dispose.
 *
 * Most fields here never touch the ViewModel at all: the smart controls in
 * the View own their metadata wiring; the ViewModel only holds values and
 * the save behavior. Keep ViewModels this thin wherever possible.
 */
export class TemplateViewModel {
  //#region Observables the View binds to
  readonly accountName = new Observable<string | null>(null);
  readonly industry = new Observable<number | null>(null);
  readonly isSaving = new Observable<boolean>(false);
  readonly saveMessage = new Observable<string | null>(null);
  //#endregion

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {}

  //#region Handlers wired explicitly in the View
  readonly onSave = async (): Promise<void> => {
    if (!this.accountName.value) {
      this.saveMessage.value = "Enter an account name first.";
      return;
    }
    this.isSaving.value = true;
    this.saveMessage.value = null;
    try {
      const created = await this.context.webAPI.createRecord("account", {
        name: this.accountName.value,
        ...(this.industry.value !== null ? { industrycode: this.industry.value } : {}),
      });
      if (this.tracker.isDisposed) {
        return;
      }
      this.saveMessage.value = `Account created (${created.id}).`;
      this.accountName.value = null;
      this.industry.value = null;
    } catch (error) {
      if (!this.tracker.isDisposed) {
        this.saveMessage.value = `Save failed: ${error instanceof Error ? error.message : error}`;
      }
    } finally {
      if (!this.tracker.isDisposed) {
        this.isSaving.value = false;
      }
    }
  };

  //#endregion

  dispose(): void {
    this.tracker.dispose();
  }
}
