import type { IViewModelContext } from "../../../shared/context/IViewModelContext";
import { Observable } from "../../../shared/reactivity/Observable";
import { SubscriptionTracker } from "../../../shared/reactivity/SubscriptionTracker";
import type { IEntityReference } from "../../../shared/utils/EntityModel";

/**
 * Multi-lookup cascade: territory → account in that territory →
 * contact at that account, plus an option set. Native lookups cannot chain
 * filters off each other; here each SmartLookup gets a live OData filter
 * built from the previous selection, and downstream picks reset on change.
 */
export class TerritoryCascadeViewModel {
  readonly territory = new Observable<IEntityReference | null>(null);
  readonly account = new Observable<IEntityReference | null>(null);
  readonly contact = new Observable<IEntityReference | null>(null);
  readonly contactMethod = new Observable<number | null>(null);
  readonly summary = new Observable<string | null>(null);

  private readonly tracker = new SubscriptionTracker();

  constructor(private readonly context: IViewModelContext) {
    // Cascade resets: changing an upstream pick clears everything below it.
    this.tracker.add(
      this.territory.subscribe(() => {
        this.account.value = null;
        this.contact.value = null;
      }),
      this.account.subscribe(() => {
        this.contact.value = null;
      })
    );
  }

  /** OData filter for the account lookup, narrowed by the chosen territory. */
  get accountFilter(): string | undefined {
    const territory = this.territory.value;
    return territory ? `_territoryid_value eq ${territory.id}` : undefined;
  }

  /** OData filter for the contact lookup, narrowed by the chosen account. */
  get contactFilter(): string | undefined {
    const account = this.account.value;
    return account ? `_parentcustomerid_value eq ${account.id}` : undefined;
  }

  readonly onApply = async (): Promise<void> => {
    const contact = this.contact.value;
    if (!contact) {
      this.summary.value = "Pick a contact first.";
      return;
    }
    // Check disposal BEFORE the write: a dialog closed mid-click must not send
    // a stray PATCH whose outcome nobody sees.
    if (this.tracker.isDisposed) {
      return;
    }
    try {
      if (this.contactMethod.value !== null) {
        await this.context.webAPI.updateRecord("contact", contact.id, {
          preferredcontactmethodcode: this.contactMethod.value,
        });
      }
      if (!this.tracker.isDisposed) {
        this.summary.value = `Preferred contact method saved for ${contact.name ?? contact.id}.`;
      }
    } catch (error) {
      // Never surface raw SDK text; log it and use the standard error surface.
      console.error("Territory cascade save failed", error);
      if (!this.tracker.isDisposed) {
        void this.context.navigation.openErrorDialog({
          message: "The change could not be saved in this environment.",
        });
      }
    }
  };

  dispose(): void {
    this.tracker.dispose();
  }
}
