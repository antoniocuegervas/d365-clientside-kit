import { createFakeViewModelContext } from "../../../mocks/fakeViewModelContext";
import { CounterpartyGridViewModel } from "../../../../clientui/apps/sample-counterparty-grid/CounterpartyGridViewModel";
import type { ICounterpartyInfo } from "../../../../shared/features/counterparty/counterparty";

const FV = "@OData.Community.Display.V1.FormattedValue";
const LOGICAL = "@Microsoft.Dynamics.CRM.lookuplogicalname";

/** Lets the constructor's fire-and-forget load() settle (two awaited fetches). */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("CounterpartyGridViewModel", () => {
  it("loads activities and synthesizes Counterparty + Role from the party query", async () => {
    const context = createFakeViewModelContext({
      queryResults: {
        activitypointer: [
          {
            entities: [
              {
                activityid: "a0000000-0000-0000-0000-000000000001",
                subject: "Follow up on quote",
                activitytypecode: "phonecall",
                [`activitytypecode${FV}`]: "Phone Call",
                [`_regardingobjectid_value${FV}`]: "Contoso Ltd",
              },
              {
                activityid: "a0000000-0000-0000-0000-000000000002",
                subject: "Internal prep",
                activitytypecode: "task",
                [`activitytypecode${FV}`]: "Task",
                [`_regardingobjectid_value${FV}`]: "Contoso Ltd",
              },
            ],
          },
        ],
        // One activityparty query for the whole page: an external contact on the
        // phone call, only an internal user on the task.
        activityparty: [
          {
            entities: [
              {
                _activityid_value: "a0000000-0000-0000-0000-000000000001",
                _partyid_value: "c0000000-0000-0000-0000-000000000001",
                [`_partyid_value${FV}`]: "Yvonne McKay",
                [`_partyid_value${LOGICAL}`]: "contact",
                participationtypemask: 2,
                [`participationtypemask${FV}`]: "To Recipient",
              },
              {
                _activityid_value: "a0000000-0000-0000-0000-000000000002",
                _partyid_value: "u0000000-0000-0000-0000-000000000009",
                [`_partyid_value${FV}`]: "A User",
                [`_partyid_value${LOGICAL}`]: "systemuser",
                participationtypemask: 1,
                [`participationtypemask${FV}`]: "Sender",
              },
            ],
          },
        ],
      },
    }).context;

    const viewModel = new CounterpartyGridViewModel(context);
    await settle();

    const rows = viewModel.rows.value;
    expect(rows).toHaveLength(2);
    // The phone call shows its external contact (a navigable party) and its role.
    expect(rows[0]).toMatchObject({ type: "Phone Call", subject: "Follow up on quote" });
    const info0 = rows[0].kit_counterparty as ICounterpartyInfo;
    expect(info0.counterparty).toBe("Yvonne McKay");
    expect(info0.parties).toEqual([
      { id: "c0000000-0000-0000-0000-000000000001", entity: "contact", name: "Yvonne McKay", role: "To Recipient" },
    ]);
    // The internal-only task has no external party.
    const info1 = rows[1].kit_counterparty as ICounterpartyInfo;
    expect(info1.parties).toEqual([]);
    expect(viewModel.loading.value).toBe(false);
  });

  it("loads activity types and drives the command-bar handlers", async () => {
    const fake = createFakeViewModelContext({
      activityTypes: [
        { logicalName: "email", displayName: "Email", objectTypeCode: 4202 },
        { logicalName: "phonecall", displayName: "Phone Call", objectTypeCode: 4210 },
      ],
      queryResults: {
        activitypointer: [
          {
            entities: [
              {
                activityid: "a0000000-0000-0000-0000-000000000001",
                subject: "Follow up on quote",
                activitytypecode: "phonecall",
                [`activitytypecode${FV}`]: "Phone Call",
              },
            ],
          },
        ],
        activityparty: [{ entities: [] }],
      },
    });
    const viewModel = new CounterpartyGridViewModel(fake.context);
    await settle();

    // The New flyout's types are loaded from metadata.
    expect(viewModel.activityTypes.value.map((t) => t.logicalName)).toEqual(["email", "phonecall"]);

    // New opens a blank form for the chosen type.
    viewModel.onCreate("email");
    expect(fake.calls).toContainEqual({ api: "openForm", args: ["email"] });

    // Edit opens the selected activity (entity derived from its type code).
    viewModel.selectedKey.value = "a0000000-0000-0000-0000-000000000001";
    viewModel.onEdit();
    expect(fake.calls).toContainEqual({
      api: "openForm",
      args: ["phonecall", "a0000000-0000-0000-0000-000000000001"],
    });

    // Refresh reloads (loading flips back on synchronously).
    viewModel.onRefresh();
    expect(viewModel.loading.value).toBe(true);
  });

  it("renders the Subject as a column with a custom renderer", () => {
    const viewModel = new CounterpartyGridViewModel(createFakeViewModelContext().context);
    const subject = viewModel.columns.value.find((column) => column.key === "subject");
    expect(subject?.onRender).toBeInstanceOf(Function);
  });

  it("opens rows via the raw type code, not the localized label", async () => {
    // A German org: the formatted value is "Telefonanruf"; only the raw
    // activitytypecode carries the entity logical name openForm needs.
    const fake = createFakeViewModelContext({
      queryResults: {
        activitypointer: [
          {
            entities: [
              {
                activityid: "a0000000-0000-0000-0000-000000000001",
                subject: "Angebot nachfassen",
                activitytypecode: "phonecall",
                [`activitytypecode${FV}`]: "Telefonanruf",
              },
            ],
          },
        ],
        activityparty: [{ entities: [] }],
      },
    });
    const viewModel = new CounterpartyGridViewModel(fake.context);
    await settle();

    expect(viewModel.rows.value[0].type).toBe("Telefonanruf");
    viewModel.selectedKey.value = "a0000000-0000-0000-0000-000000000001";
    viewModel.onEdit();
    expect(fake.calls).toContainEqual({
      api: "openForm",
      args: ["phonecall", "a0000000-0000-0000-0000-000000000001"],
    });
  });

  it("a refresh during a slow load wins: the stale load may not interleave its writes", async () => {
    // Load 1 departs and is held; a refresh starts load 2, which completes.
    // When load 1's response finally lands it must be discarded whole (no
    // stale activities, no second party query).
    const gates = new Map<number, () => void>();
    const fake = createFakeViewModelContext({
      queryResults: {
        activitypointer: [
          {
            entities: [
              {
                activityid: "a0000000-0000-0000-0000-000000000001",
                subject: "Old page",
                activitytypecode: "task",
                [`activitytypecode${FV}`]: "Task",
              },
            ],
          },
          {
            entities: [
              {
                activityid: "a0000000-0000-0000-0000-000000000002",
                subject: "New page",
                activitytypecode: "phonecall",
                [`activitytypecode${FV}`]: "Phone Call",
              },
            ],
          },
        ],
        activityparty: [{ entities: [] }],
      },
      queryGate: ({ entity, index }) => {
        if (entity === "activitypointer" && index === 0) {
          return new Promise<void>((resolve) => gates.set(index, resolve));
        }
      },
    });
    const viewModel = new CounterpartyGridViewModel(fake.context);
    await settle();

    viewModel.onRefresh();
    await settle();
    expect(viewModel.rows.value.map((row) => row.subject)).toEqual(["New page"]);
    expect(viewModel.loading.value).toBe(false);

    // The held first load lands last and is discarded.
    gates.get(0)!();
    await settle();
    expect(viewModel.rows.value.map((row) => row.subject)).toEqual(["New page"]);
    const partyQueries = fake.calls.filter(
      (call) => call.api === "fetch" && call.args[0] === "activityparty"
    );
    expect(partyQueries.length).toBe(1);
  });
});
