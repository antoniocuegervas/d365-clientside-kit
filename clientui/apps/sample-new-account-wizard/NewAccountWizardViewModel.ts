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
      // Production hardening (not implemented here): commit the whole draft in a
      // single server-side transaction so a mid-flow failure cannot orphan a
      // record. The commit() seam is built so this is a drop-in replacement.
      //
      // const result = await this.context.webAPI.executeAction("new_CommitNewAccountWizard", {
      //   AccountName: this.accountName.value,
      //   IndustryCode: this.industry.value,
      //   ContactFirstName: this.firstName.value,
      //   ContactLastName: this.lastName.value,
      //   ContactEmail: this.email.value,
      // });
      // this.createdAccountId.value = (result as { AccountId: string }).AccountId;

      // First cut: sequential client-side writes, no server component required.
      const account = await this.context.webAPI.createRecord("account", {
        name: this.accountName.value,
        industrycode: this.industry.value,
      });
      const contact = await this.context.webAPI.createRecord("contact", {
        firstname: this.firstName.value,
        lastname: this.lastName.value,
        emailaddress1: this.email.value,
        "parentcustomerid_account@odata.bind": `/accounts(${account.id})`,
      });
      await this.context.webAPI.updateRecord("account", account.id, {
        "primarycontactid@odata.bind": `/contacts(${contact.id})`,
      });
      if (this.tracker.isDisposed) {
        return;
      }
      this.createdAccountId.value = account.id;
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

  /** Return-to-caller affordance: open the record the wizard just created. */
  readonly openCreatedAccount = (): void => {
    const id = this.createdAccountId.value;
    if (id) {
      void this.context.navigation.openForm("account", id);
    }
  };
}
