import { createFakeViewModelContext } from "../../../mocks/fakeViewModelContext";
import { NewAccountWizardViewModel } from "../../../../clientui/apps/sample-new-account-wizard/NewAccountWizardViewModel";
import type { IChangeSetRequest } from "../../../../shared/context/IViewModelContext";

/** Drives the wizard to its last (review) step so finish() runs commit(). */
function fillAndAdvance(wizard: NewAccountWizardViewModel): void {
  wizard.accountName.value = "Contoso";
  wizard.next(); // account -> contact
  wizard.lastName.value = "Smith";
  wizard.firstName.value = "Ada";
  wizard.next(); // contact -> review
}

describe("NewAccountWizardViewModel", () => {
  it("commits the whole draft as ONE atomic change set with content-id links", async () => {
    const { context, calls } = createFakeViewModelContext({
      changeSetIds: ["aaa00000-0000-0000-0000-000000000001"],
    });
    const wizard = new NewAccountWizardViewModel(context);
    fillAndAdvance(wizard);

    await wizard.finish();

    // Exactly one transactional round-trip, never the old sequential writes.
    const changeSetCalls = calls.filter((c) => c.api === "executeChangeSet");
    expect(changeSetCalls).toHaveLength(1);
    expect(calls.some((c) => c.api === "createRecord")).toBe(false);
    expect(calls.some((c) => c.api === "updateRecord")).toBe(false);

    const requests = changeSetCalls[0].args[0] as IChangeSetRequest[];
    expect(requests).toHaveLength(3);
    // Account create, then contact bound to the account at "$1", then the
    // account's primary contact bound to the contact at "$2".
    expect(requests[0]).toMatchObject({ method: "POST", entityLogicalName: "account" });
    expect(requests[1]).toMatchObject({ method: "POST", entityLogicalName: "contact" });
    expect(requests[1].data).toMatchObject({
      "parentcustomerid_account@odata.bind": "$1",
    });
    expect(requests[2]).toMatchObject({
      method: "PATCH",
      entityLogicalName: "account",
      id: "$1",
    });
    expect(requests[2].data).toMatchObject({ "primarycontactid@odata.bind": "$2" });

    // The created account id (content-id 1) is surfaced for the return-to-caller.
    expect(wizard.createdAccountId.value).toBe("aaa00000-0000-0000-0000-000000000001");
    expect(wizard.completed.value).toBe(true);
  });

  it("keeps the wizard open and surfaces an error when the change set fails", async () => {
    const { context } = createFakeViewModelContext();
    // Force the atomic commit to reject, the way a rolled-back change set does.
    (context.webAPI as { executeChangeSet: unknown }).executeChangeSet = async () => {
      throw new Error("rolled back");
    };
    const wizard = new NewAccountWizardViewModel(context);
    fillAndAdvance(wizard);

    await wizard.finish();

    expect(wizard.completed.value).toBe(false);
    expect(wizard.createdAccountId.value).toBeNull();
  });
});
