import * as React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewModelContextProvider } from "../../../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { ObservableEvent } from "../../../../../shared/reactivity/ObservableEvent";
import { SmartTextField } from "../../../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../../../shared/controls/smart/SmartOptionSet";
import { SmartLookup } from "../../../../../shared/controls/smart/SmartLookup";
import { SmartNativeLookup } from "../../../../../shared/controls/smart/SmartNativeLookup";
import { SmartNumberField } from "../../../../../shared/controls/smart/SmartNumberField";
import {
  SmartViewGrid,
  type ISmartViewGridFilter,
  type ISortSpec,
} from "../../../../../shared/controls/smart/SmartViewGrid";
import type { IEntityReference } from "../../../../../shared/utils/EntityModel";
import { createFakeViewModelContext } from "../../../../mocks/fakeViewModelContext";
import type { IViewModelContext } from "../../../../../shared/context/IViewModelContext";

const renderWith = (context: IViewModelContext, ui: React.ReactNode) =>
  render(<ViewModelContextProvider context={context}>{ui}</ViewModelContextProvider>);

describe("SmartTextField (declarative block)", () => {
  it("resolves label/required/maxLength from metadata with entity+attribute only", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": {
          displayName: "Account Name",
          kind: "text",
          required: true,
          maxLength: 160,
        },
      },
    });
    const value = new Observable<string | null>(null);
    renderWith(context, <SmartTextField entity="account" attribute="name" value={value} />);

    expect(await screen.findByText("Account Name")).toBeTruthy();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.maxLength).toBe(160);
    expect(input.required).toBe(true);
  });

  it("writes changes back into the host-owned observable", async () => {
    const { context } = createFakeViewModelContext({
      attributes: { "account.name": { displayName: "Account Name", kind: "text" } },
    });
    const value = new Observable<string | null>(null);
    renderWith(context, <SmartTextField entity="account" attribute="name" value={value} />);
    const input = await screen.findByRole("textbox");
    await userEvent.type(input, "Contoso");
    expect(value.value).toBe("Contoso");
  });

  it("prop overrides beat metadata (form-designer override semantics)", async () => {
    const { context } = createFakeViewModelContext({
      attributes: { "account.name": { displayName: "Account Name", kind: "text", required: true } },
    });
    const value = new Observable<string | null>(null);
    renderWith(
      context,
      <SmartTextField
        entity="account"
        attribute="name"
        value={value}
        label="Company"
        required={false}
      />
    );
    expect(await screen.findByText("Company")).toBeTruthy();
    expect(screen.queryByText("Account Name")).toBeNull();
  });

  it("renders a memo attribute as multiline", async () => {
    const { context } = createFakeViewModelContext({
      attributes: { "account.description": { displayName: "Description", kind: "memo" } },
    });
    const value = new Observable<string | null>("notes");
    renderWith(context, <SmartTextField entity="account" attribute="description" value={value} />);
    const textarea = await screen.findByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("shows a friendly fallback, not raw SDK text, when metadata fails", async () => {
    const { context } = createFakeViewModelContext(); // nothing scripted -> load throws
    const value = new Observable<string | null>(null);
    renderWith(context, <SmartTextField entity="account" attribute="missing" value={value} />);
    expect(await screen.findByText(/Unavailable in this environment/)).toBeTruthy();
    expect(screen.queryByText(/Could not load metadata/)).toBeNull();
  });

  it("uses the attribute Description as the field hint", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text", description: "The legal business name." },
      },
    });
    renderWith(
      context,
      <SmartTextField entity="account" attribute="name" value={new Observable<string | null>("")} />
    );
    expect(await screen.findByText("The legal business name.")).toBeTruthy();
  });

  it("a hint prop overrides the metadata Description", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text", description: "The legal business name." },
      },
    });
    renderWith(
      context,
      <SmartTextField
        entity="account"
        attribute="name"
        value={new Observable<string | null>("")}
        hint="Type the trading name"
      />
    );
    expect(await screen.findByText("Type the trading name")).toBeTruthy();
    expect(screen.queryByText("The legal business name.")).toBeNull();
  });

  it("renders a column-secured field read-only by default; readOnly={false} forces edit", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text", isSecured: true },
      },
    });
    const value = new Observable<string | null>("Contoso");

    // Secured -> read-only: the shell renders flat locked text, no editable input,
    // so a save the platform would reject can never be attempted.
    const secured = renderWith(
      context,
      <SmartTextField entity="account" attribute="name" value={value} />
    );
    expect(await screen.findByText("Account Name")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Contoso")).toBeTruthy();
    secured.unmount();

    // A host that knows the user can edit the secured column overrides the default.
    renderWith(
      context,
      <SmartTextField entity="account" attribute="name" value={value} readOnly={false} />
    );
    expect(await screen.findByRole("textbox")).toBeTruthy();
  });
});

describe("SmartFieldBase reuse resilience", () => {
  it("rebinds metadata and value subscription when props change on a reused instance", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text" },
        "contact.firstname": { displayName: "First Name", kind: "text" },
      },
    });
    const accountName = new Observable<string | null>("Contoso");
    const firstName = new Observable<string | null>(null);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartTextField entity="account" attribute="name" value={accountName} />
      </ViewModelContextProvider>
    );
    expect(await screen.findByText("Account Name")).toBeTruthy();

    // Same control type at the same position: React reuses the instance, now
    // pointed at a different attribute and a different value Observable.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartTextField entity="contact" attribute="firstname" value={firstName} />
      </ViewModelContextProvider>
    );

    // Metadata rebinds: the label follows the new attribute.
    expect(await screen.findByText("First Name")).toBeTruthy();
    expect(screen.queryByText("Account Name")).toBeNull();

    // Value subscription rebinds: an external edit to the NEW observable renders,
    // and the old observable is left untouched.
    await act(async () => {
      firstName.value = "Jane";
    });
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Jane");
    expect(accountName.value).toBe("Contoso");
  });
});

describe("SmartOptionSet", () => {
  const options = [
    { value: 1, label: "Accounting" },
    { value: 6, label: "Consulting" },
  ];

  it("loads options from metadata and renders the selected label", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.industrycode": { displayName: "Industry", kind: "optionset", options },
      },
    });
    const value = new Observable<number | null>(6);
    renderWith(context, <SmartOptionSet entity="account" attribute="industrycode" value={value} />);
    expect(await screen.findByText("Industry")).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLElement).textContent).toContain("Consulting");
  });

  it("supports dynamic option pruning via filterOptions", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.industrycode": { displayName: "Industry", kind: "optionset", options },
      },
    });
    const value = new Observable<number | null>(null);
    renderWith(
      context,
      <SmartOptionSet
        entity="account"
        attribute="industrycode"
        value={value}
        filterOptions={(all) => all.filter((o) => o.value !== 1)}
      />
    );
    const combo = await screen.findByRole("combobox");
    await userEvent.click(combo);
    expect(screen.queryByText("Accounting")).toBeNull();
    expect(screen.getAllByText("Consulting").length).toBeGreaterThan(0);
  });
});

describe("SmartLookup", () => {
  it("searches the metadata target with a contains filter and supplies results", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": {
          displayName: "Company Name",
          kind: "lookup",
          targets: ["account"],
        },
      },
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd" },
            ],
          },
        ],
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup
        entity="contact"
        attribute="parentcustomerid"
        value={value}
        searchDebounceMs={0}
      />
    );
    const combo = await screen.findByRole("combobox");
    await userEvent.type(combo, "cont");

    // Opening fires a first-page search before typing, so the typed search is
    // the latest retrieveMultipleRecords call.
    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(String(query?.args[1])).toContain("contains(name,'");
    });
    const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
    expect(query.args[0]).toBe("account");
    expect(String(query.args[1])).toContain("contains(name,'");
    expect(String(query.args[1])).toContain("$top=10");

    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
  });

  it("fetches a first page when the picker opens, before any typing", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": {
          displayName: "Company Name",
          kind: "lookup",
          targets: ["account"],
        },
      },
      queryResults: {
        account: [
          { entities: [{ accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd" }] },
        ],
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup entity="contact" attribute="parentcustomerid" value={value} searchDebounceMs={0} />
    );
    const combo = await screen.findByRole("combobox");
    await userEvent.click(combo);

    // No typing: the open should still fetch the first page (top, no contains).
    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(query).toBeDefined();
      expect(String(query?.args[1])).toContain("$top=10");
      expect(String(query?.args[1])).not.toContain("contains(");
    });
  });

  it("dialog mode opens the native picker and commits the chosen record", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
      lookupResults: [
        { id: "a1a00000-0000-0000-0000-000000000001", logicalName: "account", name: "Contoso Ltd" },
      ],
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup entity="contact" attribute="parentcustomerid" value={value} mode="dialog" />
    );
    await userEvent.click(await screen.findByLabelText("Browse records"));
    await waitFor(() => {
      expect(value.value?.id).toBe("a1a00000-0000-0000-0000-000000000001");
    });
    const dialog = calls.find((c) => c.api === "lookupObjects")!;
    expect((dialog.args[0] as { entityTypes?: string[] }).entityTypes).toEqual(["account"]);
  });

  it("opens the selected record's form when the value link is clicked", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
    });
    const value = new Observable<IEntityReference | null>({
      id: "a1a00000-0000-0000-0000-000000000001",
      logicalName: "account",
      name: "Contoso Ltd",
    });
    renderWith(
      context,
      <SmartLookup entity="contact" attribute="parentcustomerid" value={value} searchDebounceMs={0} />
    );
    await userEvent.click(await screen.findByRole("link", { name: "Contoso Ltd" }));
    await waitFor(() => {
      const open = calls.find((c) => c.api === "openForm");
      expect(open?.args).toEqual(["account", "a1a00000-0000-0000-0000-000000000001"]);
    });
  });

  it("view-driven search runs the saved view as the source", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
      views: {
        "name:account:Lookup View": { id: "99990000-0000-0000-0000-000000000009" },
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup
        entity="contact"
        attribute="parentcustomerid"
        value={value}
        viewName="Lookup View"
        searchDebounceMs={0}
      />
    );
    await userEvent.type(await screen.findByRole("combobox"), "co");
    await waitFor(() => {
      const last = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(String(last?.args[1])).toContain("contains(name,'co')");
    });
    const last = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
    expect(String(last.args[1])).toContain("?savedQuery=99990000-0000-0000-0000-000000000009");
  });

  it("attaches the resolved entity icon to inline results", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
      entityIcons: { account: "https://org/_imgs/svg_1.svg" },
      queryResults: {
        account: [
          { entities: [{ accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd" }] },
        ],
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup
        entity="contact"
        attribute="parentcustomerid"
        value={value}
        showIcons
        searchDebounceMs={0}
      />
    );
    await userEvent.type(await screen.findByRole("combobox"), "co");
    await screen.findByText("Contoso Ltd");
    expect(calls.find((c) => c.api === "getEntityIconUrl")?.args).toEqual(["account"]);
    await waitFor(() => {
      expect(document.querySelector('img[src="https://org/_imgs/svg_1.svg"]')).toBeTruthy();
    });
  });

  it("defaults to the entity's lookup view as the search source", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
      views: { "lookup:account": { id: "aaaa0000-0000-0000-0000-00000000000a" } },
      queryResults: {
        account: [{ entities: [{ accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd" }] }],
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup entity="contact" attribute="parentcustomerid" value={value} searchDebounceMs={0} />
    );
    await userEvent.click(await screen.findByRole("combobox"));
    await waitFor(() => {
      expect(calls.find((c) => c.api === "getLookupView")?.args).toEqual(["account"]);
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(String(query?.args[1])).toContain("?savedQuery=aaaa0000-0000-0000-0000-00000000000a");
    });
  });

  it("ANDs the extra filter clause into the search", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartLookup
        entity="contact"
        attribute="parentcustomerid"
        value={value}
        filter="statecode eq 0"
        searchDebounceMs={0}
      />
    );
    const combo = await screen.findByRole("combobox");
    await userEvent.type(combo, "a");
    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(String(query?.args[1])).toContain("and statecode eq 0");
    });
  });
});

describe("SmartNativeLookup", () => {
  const baseOptions = {
    attributes: {
      "contact.preferredsystemuserid": {
        displayName: "Preferred User",
        kind: "lookup" as const,
        targets: ["systemuser"],
      },
    },
    entities: {
      systemuser: {
        displayName: "Users",
        primaryIdAttribute: "systemuserid",
        primaryNameAttribute: "fullname",
      },
    },
    views: {
      "lookup:systemuser": {
        id: "5a5a0000-0000-0000-0000-000000000055",
        columns: [
          { name: "fullname", width: 200 },
          { name: "internalemailaddress", width: 200 },
          { name: "title", width: 150 },
        ],
      },
    },
    queryResults: {
      systemuser: [
        {
          entities: [
            {
              systemuserid: "u1u00000-0000-0000-0000-000000000001",
              fullname: "Nancy Davolio",
              internalemailaddress: "nancy@example.com",
            },
          ],
        },
      ],
    },
  };

  it("runs the target view's first page on open and maps the layout columns into rows", async () => {
    const { context, calls } = createFakeViewModelContext(baseOptions);
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartNativeLookup
        entity="contact"
        attribute="preferredsystemuserid"
        value={value}
        searchDebounceMs={0}
      />
    );
    await userEvent.click(await screen.findByRole("combobox"));

    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(query?.args[0]).toBe("systemuser");
      expect(String(query?.args[1])).toContain("?savedQuery=5a5a0000-0000-0000-0000-000000000055");
      expect(String(query?.args[1])).toContain("$top=10");
    });
    // Name on line 1, the view's other column (email) under it.
    expect(await screen.findByText("Nancy Davolio")).toBeTruthy();
    expect(await screen.findByText("nancy@example.com")).toBeTruthy();
  });

  it("filters with a contains clause as the user types", async () => {
    const { context, calls } = createFakeViewModelContext(baseOptions);
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartNativeLookup
        entity="contact"
        attribute="preferredsystemuserid"
        value={value}
        searchDebounceMs={0}
      />
    );
    await userEvent.type(await screen.findByRole("combobox"), "nan");
    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(String(query?.args[1])).toContain("contains(fullname,'nan')");
    });
  });

  it("Advanced opens the native picker seeded with the resolved view and commits the pick", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...baseOptions,
      lookupResults: [
        { id: "u1u00000-0000-0000-0000-000000000001", logicalName: "systemuser", name: "Nancy Davolio" },
      ],
    });
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartNativeLookup
        entity="contact"
        attribute="preferredsystemuserid"
        value={value}
        searchDebounceMs={0}
      />
    );
    await userEvent.click(await screen.findByRole("combobox"));
    await userEvent.click(await screen.findByRole("link", { name: "Advanced" }));
    await waitFor(() => {
      expect(value.value?.id).toBe("u1u00000-0000-0000-0000-000000000001");
    });
    const dialog = calls.find((c) => c.api === "lookupObjects")!;
    expect((dialog.args[0] as { entityTypes?: string[] }).entityTypes).toEqual(["systemuser"]);
    expect((dialog.args[0] as { viewIds?: string[] }).viewIds).toEqual([
      "5a5a0000-0000-0000-0000-000000000055",
    ]);
  });
});

describe("SmartNumberField locale + currency", () => {
  it("formats with the user's decimal symbol and group separator", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": { displayName: "Est. Value", kind: "decimal", precision: 2 },
      },
      formatting: { decimalSymbol: ",", numberSeparator: "." },
    });
    const value = new Observable<number | null>(1234.5);
    renderWith(
      context,
      <SmartNumberField entity="opportunity" attribute="estimatedvalue" value={value} />
    );
    await screen.findByText("Est. Value");
    await waitFor(() => {
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("1.234,50");
    });
  });

  it("resolves the record's currency symbol from transactionCurrencyId", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": { displayName: "Est. Value", kind: "money", precision: 2 },
      },
      currencies: {
        "55550000-0000-0000-0000-000000000005": { symbol: "€", precision: 2 },
      },
    });
    const value = new Observable<number | null>(1000);
    renderWith(
      context,
      <SmartNumberField
        entity="opportunity"
        attribute="estimatedvalue"
        value={value}
        transactionCurrencyId="55550000-0000-0000-0000-000000000005"
      />
    );
    await waitFor(() => {
      expect(calls.find((c) => c.api === "getCurrencySymbol")).toBeDefined();
    });
    expect(await screen.findByText("€")).toBeTruthy();
  });

  it("uses the currency precision over the attribute precision when PrecisionSource is currency", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": {
          displayName: "Est. Value",
          kind: "money",
          precision: 2,
          precisionSource: 1,
        },
      },
      currencies: {
        "55550000-0000-0000-0000-000000000005": { symbol: "€", precision: 3 },
      },
      formatting: { decimalSymbol: ".", numberSeparator: "," },
    });
    const value = new Observable<number | null>(1000);
    renderWith(
      context,
      <SmartNumberField
        entity="opportunity"
        attribute="estimatedvalue"
        value={value}
        transactionCurrencyId="55550000-0000-0000-0000-000000000005"
      />
    );
    // 3 decimals (currency precision), not 2 (the attribute precision).
    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1,000.000");
    });
  });

  it("an explicit currencySymbol prop wins over resolution", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": { displayName: "Est. Value", kind: "money", precision: 2 },
      },
    });
    const value = new Observable<number | null>(1000);
    renderWith(
      context,
      <SmartNumberField
        entity="opportunity"
        attribute="estimatedvalue"
        value={value}
        currencySymbol="£"
        transactionCurrencyId="55550000-0000-0000-0000-000000000005"
      />
    );
    expect(await screen.findByText("£")).toBeTruthy();
    expect(calls.find((c) => c.api === "getCurrencySymbol")).toBeUndefined();
  });
});

describe("SmartViewGrid (read-only view grid)", () => {
  const viewSetup = {
    attributes: {
      "account.name": { displayName: "Account Name", kind: "text" as const },
      "account.telephone1": { displayName: "Main Phone", kind: "text" as const },
    },
    views: {
      "default:account": {
        name: "Active Accounts",
        entityLogicalName: "account",
        fetchXml: "<fetch><entity name='account'/></fetch>",
        columns: [
          { name: "name", width: 300 },
          { name: "telephone1", width: 120 },
        ],
      },
    },
    queryResults: {
      account: [
        {
          entities: [
            {
              accountid: "a1a00000-0000-0000-0000-000000000001",
              name: "Contoso Ltd",
              telephone1: "555-0101",
            },
            {
              accountid: "a1a00000-0000-0000-0000-000000000002",
              name: "Fabrikam Inc",
              telephone1: "555-0102",
            },
          ],
        },
      ],
    },
  };

  it("loads the view, resolves headers from metadata, and renders rows", async () => {
    const { context } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" />);
    expect(await screen.findByText("Account Name")).toBeTruthy();
    expect(await screen.findByText("Main Phone")).toBeTruthy();
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
    expect(await screen.findByText("Fabrikam Inc")).toBeTruthy();
  });

  it("pages server-side via nextLink and caches visited pages", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "p1", name: "Contoso Ltd", telephone1: "1" },
              { accountid: "p2", name: "Fabrikam Inc", telephone1: "2" },
            ],
            nextLink: "https://fake/next-page-2",
          },
        ],
      },
      pageResults: [
        {
          entities: [
            { accountid: "p3", name: "Adventure Works", telephone1: "3" },
            { accountid: "p4", name: "Northwind Traders", telephone1: "4" },
          ],
        },
      ],
    });
    renderWith(context, <SmartViewGrid entity="account" pageSize={2} />);
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
    expect(screen.getByLabelText("Current page").textContent).toContain("1");

    // The page size travels as odata.maxpagesize (3rd arg), not $top: $top would
    // cap the result and drop the nextLink the grid pages on.
    const firstQuery = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(firstQuery.args[2]).toBe(2);
    expect(String(firstQuery.args[1])).not.toContain("$top");

    await userEvent.click(screen.getByLabelText("Next page"));
    expect(await screen.findByText("Adventure Works")).toBeTruthy();
    expect(screen.getByLabelText("Current page").textContent).toContain("2");
    expect(calls.filter((c) => c.api === "retrieveMultipleByUrl").length).toBe(1);

    // The nextLink follow must re-send the page size; the cookie does not carry
    // it, so without this page 2 comes back at the server default size.
    const nextCall = calls.find((c) => c.api === "retrieveMultipleByUrl")!;
    expect(nextCall.args[0]).toBe("https://fake/next-page-2");
    expect(nextCall.args[1]).toBe(2);

    // Previous comes from cache, no extra query.
    await userEvent.click(screen.getByLabelText("Previous page"));
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
    expect(calls.filter((c) => c.api === "retrieveMultipleByUrl").length).toBe(1);
  });

  it("rich pagination jumps server-side via FetchXML page/count with a total", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "p1", name: "Contoso Ltd", telephone1: "1" },
              { accountid: "p2", name: "Fabrikam Inc", telephone1: "2" },
            ],
            totalRecordCount: 4,
          },
          {
            entities: [
              { accountid: "p3", name: "Adventure Works", telephone1: "3" },
              { accountid: "p4", name: "Northwind Traders", telephone1: "4" },
            ],
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="account" pageSize={2} pagination="rich" />);
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
    // Rich rendering: first/last buttons + an "X–Y of N" range label.
    expect(screen.getByLabelText("First page")).toBeTruthy();
    expect(screen.getByLabelText("Last page")).toBeTruthy();
    expect(screen.getByText(/of 4/)).toBeTruthy();
    // The data path is FetchXML page/count (fetchPage), not nextLink.
    const firstFetch = calls.find((c) => c.api === "fetchPage")!;
    expect(String(firstFetch.args[1])).toContain('page="1" count="2"');
    expect(String(firstFetch.args[1])).toContain('returntotalrecordcount="true"');

    await userEvent.click(screen.getByLabelText("Next page"));
    expect(await screen.findByText("Adventure Works")).toBeTruthy();
    const pagedFetch = calls.filter((c) => c.api === "fetchPage").at(-1)!;
    expect(String(pagedFetch.args[1])).toContain('page="2" count="2"');
  });

  it("rich pagination degrades to next/prev when the total is over the cap", async () => {
    const { context } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "p1", name: "Contoso Ltd", telephone1: "1" },
              { accountid: "p2", name: "Fabrikam Inc", telephone1: "2" },
            ],
            totalRecordCount: 5000,
            totalRecordCountLimitExceeded: true,
            moreRecords: true,
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="account" pageSize={2} pagination="rich" />);
    await screen.findByText("Contoso Ltd");
    // No rich chrome when the count is unknown, falls back to next/prev.
    expect(screen.queryByLabelText("First page")).toBeNull();
    expect((screen.getByLabelText("Next page") as HTMLButtonElement).disabled).toBe(false);
  });

  it("rich + overrideFetchXml is controlled: raises onPageChange, host owns the data", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          { entities: [{ accountid: "p1", name: "Contoso Ltd", telephone1: "1" }] },
        ],
      },
    });
    const override = new Observable<string | null>("<fetch><entity name='account'/></fetch>");
    const pageCount = new Observable<number | null>(3);
    const pages: number[] = [];
    renderWith(
      context,
      <SmartViewGrid
        entity="account"
        pageSize={2}
        pagination="rich"
        overrideFetchXml={override}
        pageCount={pageCount}
        onPageChange={(n) => pages.push(n)}
      />
    );
    await screen.findByText("Contoso Ltd");
    // Host-supplied pageCount → rich chrome present.
    expect(screen.getByLabelText("Last page")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(pages).toEqual([2]);
    // The grid does NOT page itself in override mode, no fetchPage call.
    expect(calls.find((c) => c.api === "fetchPage")).toBeUndefined();
  });

  it("raises onRecordSelected with the record id on row click", async () => {
    const { context } = createFakeViewModelContext(viewSetup);
    const selected: string[] = [];
    renderWith(
      context,
      <SmartViewGrid entity="account" onRecordSelected={(id) => selected.push(id)} />
    );
    await userEvent.click(await screen.findByText("Contoso Ltd"));
    expect(selected).toEqual(["a1a00000-0000-0000-0000-000000000001"]);
  });

  it("opens the record's form on row invoke (double-click) by default", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" />);
    await userEvent.dblClick(await screen.findByText("Contoso Ltd"));
    const open = calls.find((c) => c.api === "openForm");
    expect(open?.args).toEqual(["account", "a1a00000-0000-0000-0000-000000000001"]);
  });

  it("multi-select tracks selected record ids", async () => {
    const { context } = createFakeViewModelContext(viewSetup);
    const selectedRecordIds = new Observable<string[]>([]);
    renderWith(
      context,
      <SmartViewGrid entity="account" multiSelect selectedRecordIds={selectedRecordIds} />
    );
    // With multi-select on (and no row-click handler), clicking the row toggles
    // its selection, the way Fluent's data grid selects rows.
    await userEvent.click(await screen.findByText("Contoso Ltd"));
    expect(selectedRecordIds.value).toEqual(["a1a00000-0000-0000-0000-000000000001"]);
  });

  it("renders lookup columns as clickable links that openForm the target", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text" },
        "account.primarycontactid": { displayName: "Primary Contact", kind: "lookup", targets: ["contact"] },
      },
      views: {
        "default:account": {
          entityLogicalName: "account",
          columns: [
            { name: "name", width: 200 },
            { name: "primarycontactid", width: 200 },
          ],
        },
      },
      queryResults: {
        account: [
          {
            entities: [
              {
                accountid: "a1",
                name: "Contoso Ltd",
                "_primarycontactid_value": "c1c00000-0000-0000-0000-000000000001",
                "_primarycontactid_value@OData.Community.Display.V1.FormattedValue": "Yvonne McKay",
                "_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact",
              },
            ],
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="account" />);
    const link = await screen.findByText("Yvonne McKay");
    await userEvent.click(link);
    expect(calls.find((c) => c.api === "openForm")?.args).toEqual([
      "contact",
      "c1c00000-0000-0000-0000-000000000001",
    ]);
  });

  it("resolves a link-entity column against its owning entity", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "account.name": { displayName: "Account Name", kind: "text" },
        "contact.emailaddress1": { displayName: "Email", kind: "text" },
        "contact.parentcustomerid": { displayName: "Company", kind: "lookup", targets: ["account"] },
      },
      views: {
        "default:account": {
          entityLogicalName: "account",
          columns: [
            { name: "name", width: 200 },
            { name: "pc.emailaddress1", width: 200, relatedEntity: "contact" },
            { name: "pc.parentcustomerid", width: 200, relatedEntity: "contact" },
          ],
        },
      },
      queryResults: {
        account: [
          {
            entities: [
              {
                accountid: "a1",
                name: "Contoso Ltd",
                "pc.emailaddress1": "yvonne@contoso.com",
                "pc.parentcustomerid": "a9a00000-0000-0000-0000-000000000009",
                "pc.parentcustomerid@OData.Community.Display.V1.FormattedValue": "Parent Co",
                "pc.parentcustomerid@Microsoft.Dynamics.CRM.lookuplogicalname": "account",
              },
            ],
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="account" />);
    // Header resolves against the related (contact) entity, not the root.
    expect(await screen.findByText("Email")).toBeTruthy();
    expect(await screen.findByText("yvonne@contoso.com")).toBeTruthy();
    // The aliased lookup renders as a link off the alias-qualified key.
    const link = await screen.findByText("Parent Co");
    await userEvent.click(link);
    expect(calls.find((c) => c.api === "openForm")?.args).toEqual([
      "account",
      "a9a00000-0000-0000-0000-000000000009",
    ]);
    // Metadata was fetched against the contact entity for the related column.
    expect(
      calls.some(
        (c) =>
          c.api === "getAttributeMetadata" &&
          c.args[0] === "contact" &&
          c.args[1] === "emailaddress1"
      )
    ).toBe(true);
  });

  it("runs the saved view by id via ?savedQuery=", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords");
    expect(query).toBeDefined();
    expect(query!.args[0]).toBe("account");
    expect(String(query!.args[1])).toContain("?savedQuery=");
  });

  it("composes quick find into the saved-query $filter", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const quickFind = new Observable("cont");
    renderWith(context, <SmartViewGrid entity="account" quickFind={quickFind} />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    // default quick-find field is the entity's primary name ("name")
    expect(String(query.args[1])).toContain("$filter=contains(name,'cont')");
  });

  it("applies declarative filters server-side", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const filters = new Observable<ISmartViewGridFilter[]>([
      { attribute: "statecode", value: 0 },
    ]);
    renderWith(context, <SmartViewGrid entity="account" filters={filters} />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(String(query.args[1])).toContain("$filter=statecode eq 0");
  });

  it("server sort: a header click updates orderBy and re-queries with $orderby", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const orderBy = new Observable<ISortSpec | null>(null);
    renderWith(context, <SmartViewGrid entity="account" orderBy={orderBy} serverSort />);
    await screen.findByText("Contoso Ltd");
    await userEvent.click(screen.getByText("Account Name"));
    expect(orderBy.value).toEqual({ attribute: "name", descending: false });
    await waitFor(() => {
      const queries = calls.filter((c) => c.api === "retrieveMultipleRecords");
      expect(String(queries.at(-1)!.args[1])).toContain("$orderby=name asc");
    });
  });

  it("without serverSort a header click neither re-queries nor reorders", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" />);
    await screen.findByText("Contoso Ltd");
    const queriesBefore = calls.filter((c) => c.api === "retrieveMultipleRecords").length;
    await userEvent.click(screen.getByText("Account Name"));
    // No serverSort: the header is inert. The grid never sorts a page in memory,
    // and it does not re-query.
    expect(calls.filter((c) => c.api === "retrieveMultipleRecords").length).toBe(queriesBefore);
  });

  it("server sort works without a host orderBy, using the grid's own sort state", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" serverSort />);
    await screen.findByText("Contoso Ltd");
    await userEvent.click(screen.getByText("Account Name"));
    await waitFor(() => {
      const queries = calls.filter((c) => c.api === "retrieveMultipleRecords");
      expect(String(queries.at(-1)!.args[1])).toContain("$orderby=name asc");
    });
  });

  it("overrideFetchXml swaps the data source to host FetchXML, keeping layout", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const override = new Observable<string | null>("<fetch><entity name='account'/></fetch>");
    renderWith(context, <SmartViewGrid entity="account" overrideFetchXml={override} />);
    await screen.findByText("Account Name"); // layout still from the view
    await waitFor(() => {
      expect(calls.find((c) => c.api === "fetch")).toBeDefined();
    });
  });

  it("resolves the view by name when viewName is given", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      views: {
        "name:account:Hot Accounts": {
          name: "Hot Accounts",
          entityLogicalName: "account",
          columns: [{ name: "name", width: 300 }],
        },
      },
    });
    renderWith(context, <SmartViewGrid entity="account" viewName="Hot Accounts" />);
    await screen.findByText("Account Name");
    expect(calls.find((c) => c.api === "getViewByName")?.args).toEqual([
      "account",
      "Hot Accounts",
    ]);
  });

  it("dynamic column resolves from the first non-empty source field", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: { "opportunity.name": { displayName: "Topic", kind: "text" } },
      views: {
        "default:opportunity": {
          entityLogicalName: "opportunity",
          columns: [{ name: "name", width: 200 }],
        },
      },
      queryResults: {
        opportunity: [
          {
            entities: [
              // row 1: lookup source populated → renders the lookup link
              {
                opportunityid: "o1",
                name: "Deal A",
                "_calc_reviewerid_value": "u1u00000-0000-0000-0000-000000000001",
                "_calc_reviewerid_value@OData.Community.Display.V1.FormattedValue": "Reviewer One",
                "_calc_reviewerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "systemuser",
                new_reviewername: "Ignored Text",
              },
              // row 2: lookup empty → falls back to the free-text source
              { opportunityid: "o2", name: "Deal B", new_reviewername: "Free Text Reviewer" },
            ],
          },
        ],
      },
    });
    renderWith(
      context,
      <SmartViewGrid
        entity="opportunity"
        columnOverrides={{
          calc_reviewer: {
            header: "Reviewer",
            sources: [
              { field: "calc_reviewerid", kind: "lookup" },
              { field: "new_reviewername", kind: "text" },
            ],
          },
        }}
      />
    );
    expect(await screen.findByText("Reviewer")).toBeTruthy(); // synthetic header
    const link = await screen.findByText("Reviewer One");
    await userEvent.click(link);
    expect(calls.find((c) => c.api === "openForm")?.args).toEqual([
      "systemuser",
      "u1u00000-0000-0000-0000-000000000001",
    ]);
    expect(await screen.findByText("Free Text Reviewer")).toBeTruthy();
  });

  it("activity invoke opens the real activity type, not activitypointer", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "activitypointer.subject": { displayName: "Subject", kind: "text" },
        "activitypointer.activitytypecode": { displayName: "Activity Type", kind: "optionset" },
      },
      entities: { activitypointer: { primaryIdAttribute: "activityid" } },
      views: {
        "default:activitypointer": {
          entityLogicalName: "activitypointer",
          columns: [
            { name: "subject", width: 200 },
            { name: "activitytypecode", width: 120 },
          ],
        },
      },
      queryResults: {
        activitypointer: [
          {
            entities: [
              {
                activityid: "ac100000-0000-0000-0000-000000000001",
                subject: "Call the client",
                activitytypecode: 4210,
                "activitytypecode@OData.Community.Display.V1.FormattedValue": "phonecall",
              },
            ],
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="activitypointer" />);
    await userEvent.dblClick(await screen.findByText("Call the client"));
    expect(calls.find((c) => c.api === "openForm")?.args).toEqual([
      "phonecall",
      "ac100000-0000-0000-0000-000000000001",
    ]);
  });

  it("activity invoke errors readably when activitytypecode is absent", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: { "activitypointer.subject": { displayName: "Subject", kind: "text" } },
      entities: { activitypointer: { primaryIdAttribute: "activityid" } },
      views: {
        "default:activitypointer": {
          entityLogicalName: "activitypointer",
          columns: [{ name: "subject", width: 200 }],
        },
      },
      queryResults: {
        activitypointer: [
          { entities: [{ activityid: "ac1", subject: "Orphan activity" }] },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="activitypointer" />);
    await userEvent.dblClick(await screen.findByText("Orphan activity"));
    expect(calls.find((c) => c.api === "openForm")).toBeUndefined();
    const errorCall = calls.find((c) => c.api === "openErrorDialog");
    expect((errorCall?.args[0] as { message?: string }).message).toMatch(
      /Activity Type Code is required/
    );
  });

  it("re-runs the query when the refresh event fires (code-level refresh)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const refresh = new ObservableEvent<void>();
    renderWith(context, <SmartViewGrid entity="account" refresh={refresh} />);
    await screen.findByText("Contoso Ltd");
    const queriesBefore = calls.filter((c) => c.api === "retrieveMultipleRecords").length;
    React.act(() => refresh.publish());
    await waitFor(() => {
      expect(calls.filter((c) => c.api === "retrieveMultipleRecords").length).toBe(
        queriesBefore + 1
      );
    });
  });
});
