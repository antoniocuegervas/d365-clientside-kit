import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../shared/reactivity/ObservableArray";
import { ObservableEvent } from "../../../shared/reactivity/ObservableEvent";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IEntityReference } from "../../../shared/utils/EntityModel";
import { EntityReference } from "../../../shared/utils/EntityModel";

/** One of the selected account's contacts, in domain terms. */
export interface IContactOption {
  id: string;
  name: string;
}

/** Parses a Web API DateOnly value ("YYYY-MM-DD") as a local date, no TZ shift. */
function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Formats a Date back to the Web API DateOnly shape ("YYYY-MM-DD"). */
function formatDateOnly(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Master / detail scenario, fully standard-entity (account + contact) so it
 * runs on a plain Dataverse environment with no extra metadata.
 *
 * Master:  the account saved-view grid (top).
 * Bridge:  the selected account's contacts, offered in a selector.
 * Detail:  an editable contact form below with a field of every type the
 *          contact entity exposes out of the box, saved via updateRecord.
 *
 * The two field types base contact does not ship (a multi-select choice and an
 * editable datetime) use the very same controls: `SmartMultiSelectOptionSet`
 * for a MultiSelectPicklist attribute, and `SmartDatePicker` resolves to
 * date+time automatically when the attribute's kind is "datetime". Point either
 * at an attribute of that kind and it works the same way.
 */
export class MasterDetailViewModel {
  //#region Master (account grid)
  readonly selectedAccountId = new Observable<string | null>(null);
  readonly selectedAccountName = new Observable<string | null>(null);
  readonly refreshViewGrid = new ObservableEvent<void>();
  //#endregion

  //#region Bridge (the account's contacts)
  readonly contacts = new ObservableArray<IContactOption>();
  readonly contactsLoading = new Observable<boolean>(false);
  readonly selectedContactId = new Observable<string | null>(null);
  //#endregion

  //#region Detail (editable contact, one field of every out-of-box type)
  readonly firstName = new Observable<string | null>(null); // single-line text
  readonly lastName = new Observable<string | null>(null); // single-line text
  readonly jobTitle = new Observable<string | null>(null); // single-line text
  readonly preferredUser = new Observable<IEntityReference | null>(null); // lookup
  readonly gender = new Observable<number | null>(null); // choice (option set)
  readonly doNotEmail = new Observable<boolean | null>(null); // two options (yes/no)
  readonly numberOfChildren = new Observable<number | null>(null); // whole number
  readonly creditLimit = new Observable<number | null>(null); // currency (money)
  readonly birthDate = new Observable<Date | null>(null); // date only
  readonly description = new Observable<string | null>(null); // multiline text (memo)
  /** Record's currency, so the money field shows the real symbol. */
  readonly transactionCurrencyId = new Observable<string | null>(null);

  readonly detailLoading = new Observable<boolean>(false);
  readonly isSaving = new Observable<boolean>(false);
  readonly saveMessage = new Observable<string | null>(null);
  //#endregion

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {}

  //#region Handlers
  readonly onAccountSelected = async (accountId: string): Promise<void> => {
    this.selectedAccountId.value = accountId;
    this.selectedContactId.value = null;
    this.saveMessage.value = null;
    this.contactsLoading.value = true;
    try {
      const account = await this.context.webAPI.retrieveRecord(
        "account",
        accountId,
        "?$select=name"
      );
      if (this.tracker.isDisposed) {
        return;
      }
      this.selectedAccountName.value = (account.name as string) ?? null;

      const result = await this.context.webAPI.retrieveMultipleRecords(
        "contact",
        `?$select=fullname&$filter=_parentcustomerid_value eq ${accountId}&$orderby=fullname&$top=50`
      );
      if (this.tracker.isDisposed) {
        return;
      }
      this.contacts.value = result.entities.map((record) => ({
        id: String(record.contactid),
        name: (record.fullname as string) ?? "(no name)",
      }));
    } finally {
      if (!this.tracker.isDisposed) {
        this.contactsLoading.value = false;
      }
    }

    // Open straight to the first contact, the common case is one or a few.
    const first = this.contacts.value[0];
    if (first) {
      void this.onContactSelected(first.id);
    }
  };

  readonly onContactSelected = async (contactId: string): Promise<void> => {
    this.selectedContactId.value = contactId;
    this.detailLoading.value = true;
    this.saveMessage.value = null;
    try {
      const record = await this.context.webAPI.retrieveRecord(
        "contact",
        contactId,
        "?$select=firstname,lastname,jobtitle,gendercode,donotemail,numberofchildren," +
          "creditlimit,birthdate,description,_preferredsystemuserid_value," +
          "_transactioncurrencyid_value"
      );
      if (this.tracker.isDisposed) {
        return;
      }
      this.firstName.value = (record.firstname as string) ?? null;
      this.lastName.value = (record.lastname as string) ?? null;
      this.jobTitle.value = (record.jobtitle as string) ?? null;
      this.gender.value = (record.gendercode as number) ?? null;
      this.doNotEmail.value = (record.donotemail as boolean) ?? null;
      this.numberOfChildren.value = (record.numberofchildren as number) ?? null;
      this.creditLimit.value = (record.creditlimit as number) ?? null;
      this.birthDate.value = parseDateOnly(record.birthdate);
      this.description.value = (record.description as string) ?? null;
      this.preferredUser.value = EntityReference.fromODataRecord(record, "preferredsystemuserid");
      this.transactionCurrencyId.value =
        (record["_transactioncurrencyid_value"] as string) ?? null;
    } finally {
      if (!this.tracker.isDisposed) {
        this.detailLoading.value = false;
      }
    }
  };

  readonly onSaveContact = async (): Promise<void> => {
    const contactId = this.selectedContactId.value;
    if (!contactId) {
      return;
    }
    this.isSaving.value = true;
    this.saveMessage.value = null;
    const user = this.preferredUser.value;
    try {
      await this.context.webAPI.updateRecord("contact", contactId, {
        firstname: this.firstName.value,
        lastname: this.lastName.value,
        jobtitle: this.jobTitle.value,
        gendercode: this.gender.value,
        donotemail: this.doNotEmail.value,
        numberofchildren: this.numberOfChildren.value,
        creditlimit: this.creditLimit.value,
        birthdate: formatDateOnly(this.birthDate.value),
        description: this.description.value,
        "preferredsystemuserid@odata.bind": user ? `/systemusers(${user.id})` : null,
      });
    } catch (error) {
      if (!this.tracker.isDisposed) {
        void this.context.navigation.openErrorDialog({
          message: "Could not save the contact.",
          details: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    } finally {
      if (!this.tracker.isDisposed) {
        this.isSaving.value = false;
      }
    }
    if (this.tracker.isDisposed) {
      return;
    }
    this.saveMessage.value = "Saved.";
    // The contact's name may have changed, so update the matching entry.
    // replaceWhere swaps in a new row, which refreshes the contact selector;
    // editing the existing row in place would not have updated the view.
    this.contacts.replaceWhere(
      (contact) => contact.id === contactId,
      (contact) => ({ ...contact, name: this.composeFullName(contact.name) })
    );
  };

  /** Best-effort updated label for the selector after a name edit. */
  private composeFullName(fallback: string): string {
    const composed = [this.firstName.value, this.lastName.value]
      .filter((part) => part && part.trim() !== "")
      .join(" ")
      .trim();
    return composed === "" ? fallback : composed;
  }
  //#endregion

  dispose(): void {
    this.tracker.dispose();
  }
}
