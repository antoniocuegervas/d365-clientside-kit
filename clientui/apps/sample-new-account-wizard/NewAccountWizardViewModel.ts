import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { WizardViewModel, type IWizardStep } from "../../../shared/wizard/WizardViewModel";

/**
 * Multi-step "new account + primary contact" wizard, fully standard-entity so it
 * runs on a plain Dataverse org. The draft lives in memory across the three
 * steps and is written only on Finish, so an abandoned flow leaves nothing
 * behind. Demonstrates per-step gating, the unsaved-progress flag, and handing a
 * result back to the caller (the created account, openable from the result).
 */
export class NewAccountWizardViewModel extends WizardViewModel {
  readonly steps: IWizardStep[] = [
    { key: "account", label: "Account" },
    { key: "contact", label: "Primary contact" },
    { key: "review", label: "Review" },
  ];

  //#region Draft (in memory until Finish)
  readonly accountName = new Observable<string | null>(null);
  readonly industry = new Observable<number | null>(null);
  readonly firstName = new Observable<string | null>(null);
  readonly lastName = new Observable<string | null>(null);
  readonly email = new Observable<string | null>(null);
  //#endregion

  //#region Result
  readonly createdAccountId = new Observable<string | null>(null);
  readonly summary = new Observable<string | null>(null);
  //#endregion

  constructor(private readonly context: IViewModelContext) {
    super();
    // Drive canAdvance/isDirty off every draft field.
    this.track(this.accountName, this.industry, this.firstName, this.lastName, this.email);
  }

  protected isStepValid(index: number): boolean {
    switch (index) {
      case 0:
        return !!this.accountName.value?.trim();
      case 1:
        return !!this.lastName.value?.trim();
      default:
        return true; // review step
    }
  }

  protected async commit(): Promise<void> {
    try {
      // Atomic client-side commit, no server component required: one $batch
      // change set creates the account, creates the contact bound to that
      // account, and sets the account's primary contact, all committing or
      // rolling back as a unit. Content-id references link the rows before any
      // of them have ids: the contact binds to the account at "$1" (the first
      // operation), and the account's primary contact binds to the contact at
      // "$2". A mid-flow failure leaves nothing behind. For commits that need
      // real server logic or ordering beyond content-id, the fallback is a
      // plugin or a Custom API (see the decision-log note beside this sample).
      const [account] = await this.context.webAPI.executeChangeSet([
        {
          method: "POST",
          entityLogicalName: "account",
          data: { name: this.accountName.value, industrycode: this.industry.value },
        },
        {
          method: "POST",
          entityLogicalName: "contact",
          data: {
            firstname: this.firstName.value,
            lastname: this.lastName.value,
            emailaddress1: this.email.value,
            "parentcustomerid_account@odata.bind": "$1",
          },
        },
        {
          method: "PATCH",
          entityLogicalName: "account",
          id: "$1",
          data: { "primarycontactid@odata.bind": "$2" },
        },
      ]);
      if (this.tracker.isDisposed) {
        return;
      }
      this.createdAccountId.value = account.id ?? null;
      this.summary.value = `Created ${this.accountName.value} with a primary contact.`;
    } catch (error) {
      if (!this.tracker.isDisposed) {
        void this.context.navigation.openErrorDialog({
          message: "Could not create the account and contact.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
      throw error; // keep the wizard open for a retry
    }
  }

  /** Return-to-caller action: open the record the wizard just created. */
  readonly openCreatedAccount = (): void => {
    const id = this.createdAccountId.value;
    if (id) {
      void this.context.navigation.openForm("account", id);
    }
  };
}
