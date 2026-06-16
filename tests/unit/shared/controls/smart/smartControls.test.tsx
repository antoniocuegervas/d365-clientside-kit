import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewModelContextProvider } from "../../../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { ObservableEvent } from "../../../../../shared/reactivity/ObservableEvent";
import { SmartTextField } from "../../../../../shared/controls/smart/SmartTextField";
import { SmartOptionSet } from "../../../../../shared/controls/smart/SmartOptionSet";
import { SmartLookup } from "../../../../../shared/controls/smart/SmartLookup";
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

  it("shows a readable error when metadata fails", async () => {
    const { context } = createFakeViewModelContext(); // nothing scripted -> load throws
    const value = new Observable<string | null>(null);
    renderWith(context, <SmartTextField entity="account" attribute="missing" value={value} />);
    expect(await screen.findByText(/Could not load metadata for account.missing/)).toBeTruthy();
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

    await waitFor(() => {
      const query = calls.find((c) => c.api === "retrieveMultipleRecords");
      expect(query).toBeDefined();
    });
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(query.args[0]).toBe("account");
    expect(String(query.args[1])).toContain("contains(name,'");
    expect(String(query.args[1])).toContain("$top=10");

    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
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
      const query = calls.find((c) => c.api === "retrieveMultipleRecords");
      expect(String(query?.args[1])).toContain("and statecode eq 0");
    });
  });
});

describe("SmartNumberField locale + currency (G-06 / G-06b)", () => {
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

  it("resolves the record's currency symbol from transactionCurrencyId (G-06b)", async () => {
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

  it("runs the saved view by id via ?savedQuery= (T-01)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    renderWith(context, <SmartViewGrid entity="account" />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords");
    expect(query).toBeDefined();
    expect(query!.args[0]).toBe("account");
    expect(String(query!.args[1])).toContain("?savedQuery=");
  });

  it("composes quick find into the saved-query $filter (G-01)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const quickFind = new Observable("cont");
    renderWith(context, <SmartViewGrid entity="account" quickFind={quickFind} />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    // default quick-find field is the entity's primary name ("name")
    expect(String(query.args[1])).toContain("$filter=contains(name,'cont')");
  });

  it("applies declarative filters server-side (G-01)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const filters = new Observable<ISmartViewGridFilter[]>([
      { attribute: "statecode", value: 0 },
    ]);
    renderWith(context, <SmartViewGrid entity="account" filters={filters} />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(String(query.args[1])).toContain("$filter=statecode eq 0");
  });

  it("server sort: a header click updates orderBy and re-queries with $orderby (G-01)", async () => {
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

  it("overrideFetchXml swaps the data source to host FetchXML, keeping layout (G-01)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const override = new Observable<string | null>("<fetch><entity name='account'/></fetch>");
    renderWith(context, <SmartViewGrid entity="account" overrideFetchXml={override} />);
    await screen.findByText("Account Name"); // layout still from the view
    await waitFor(() => {
      expect(calls.find((c) => c.api === "fetch")).toBeDefined();
    });
  });

  it("resolves the view by name when viewName is given (G-05)", async () => {
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
