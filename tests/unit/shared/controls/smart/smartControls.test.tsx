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
import { makeEntityMetadataMock } from "../../../../mocks/XrmMock";
import type {
  IEntityMetadata,
  IViewModelContext,
} from "../../../../../shared/context/IViewModelContext";

const renderWith = (context: IViewModelContext, ui: React.ReactNode) =>
  render(<ViewModelContextProvider context={context}>{ui}</ViewModelContextProvider>);

describe("SmartTextField (declarative block)", () => {
  it("resolves label/required/maxLength from metadata with entity+attribute only", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": {
          DisplayName: "Account Name",
          Type: "string",
          RequiredLevel: 2,
          MaxLength: 160,
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
      attributes: { "account.name": { DisplayName: "Account Name", Type: "string" } },
    });
    const value = new Observable<string | null>(null);
    renderWith(context, <SmartTextField entity="account" attribute="name" value={value} />);
    const input = await screen.findByRole("textbox");
    await userEvent.type(input, "Contoso");
    expect(value.value).toBe("Contoso");
  });

  it("prop overrides beat metadata (form-designer override semantics)", async () => {
    const { context } = createFakeViewModelContext({
      attributes: { "account.name": { DisplayName: "Account Name", Type: "string", RequiredLevel: 2 } },
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
      attributes: { "account.description": { DisplayName: "Description", Type: "memo" } },
    });
    const value = new Observable<string | null>("notes");
    renderWith(context, <SmartTextField entity="account" attribute="description" value={value} />);
    const textarea = await screen.findByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("shows a friendly fallback, not raw SDK text, when metadata fails", async () => {
    // The failed load is the point of this test, so capture the console.error the
    // smart field logs for it; otherwise a passing run prints a scary red error.
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context } = createFakeViewModelContext(); // nothing scripted -> load throws
      const value = new Observable<string | null>(null);
      renderWith(context, <SmartTextField entity="account" attribute="missing" value={value} />);
      expect(await screen.findByText(/Unavailable in this environment/)).toBeTruthy();
      expect(screen.queryByText(/Could not load metadata/)).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("metadata load failed for account.missing"),
        expect.anything()
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does NOT surface the attribute Description as helper text (hint is opt-in)", async () => {
    // The Description stays in the metadata for surfaces that opt in (the
    // tooltip pattern); a field with only a Description renders no hint.
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { DisplayName: "Account Name", Type: "string", Description: "The legal business name." },
      },
    });
    renderWith(
      context,
      <SmartTextField entity="account" attribute="name" value={new Observable<string | null>("")} />
    );
    expect(await screen.findByText("Account Name")).toBeTruthy();
    expect(screen.queryByText("The legal business name.")).toBeNull();
  });

  it("renders helper text only when the hint prop is passed", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { DisplayName: "Account Name", Type: "string", Description: "The legal business name." },
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
        "account.name": { DisplayName: "Account Name", Type: "string", IsSecured: true },
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

  it("keeps a secured column editable when its update can never be restricted", async () => {
    // CanBeSecuredForUpdate false: no FLS profile can deny update on this
    // column, so the read-only fail-safe would be pure friction.
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": {
          DisplayName: "Account Name",
          Type: "string",
          IsSecured: true,
          CanBeSecuredForUpdate: false,
        },
      },
    });
    renderWith(
      context,
      <SmartTextField entity="account" attribute="name" value={new Observable<string | null>("x")} />
    );
    expect(await screen.findByRole("textbox")).toBeTruthy();
  });
});

describe("SmartFieldBase reuse resilience", () => {
  it("rebinds metadata and value subscription when props change on a reused instance", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.name": { DisplayName: "Account Name", Type: "string" },
        "contact.firstname": { DisplayName: "First Name", Type: "string" },
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

  it("discards a slow earlier metadata load so it cannot overwrite a newer rebind", async () => {
    const { context } = createFakeViewModelContext();
    // Drive resolution order by hand: hold the first attribute's load open until
    // after the rebind's load has resolved, the exact race the guard defends.
    let resolveAccount!: (metadata: IEntityMetadata) => void;
    const accountLoad = new Promise<IEntityMetadata>((resolve) => {
      resolveAccount = resolve;
    });
    const contactMetadata = makeEntityMetadataMock({
      logicalName: "contact",
      attributes: [{ LogicalName: "firstname", Type: "string", DisplayName: "First Name" }],
    }) as IEntityMetadata;
    context.utils.getEntityMetadata = (entityName) =>
      entityName === "account" ? accountLoad : Promise.resolve(contactMetadata);

    const accountName = new Observable<string | null>("Contoso");
    const firstName = new Observable<string | null>(null);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartTextField entity="account" attribute="name" value={accountName} />
      </ViewModelContextProvider>
    );

    // Rebind to a new attribute while the first load is still pending.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartTextField entity="contact" attribute="firstname" value={firstName} />
      </ViewModelContextProvider>
    );
    expect(await screen.findByText("First Name")).toBeTruthy();

    // The stale first load resolves last: it must be ignored, not rendered.
    await act(async () => {
      resolveAccount(
        makeEntityMetadataMock({
          logicalName: "account",
          attributes: [{ LogicalName: "name", Type: "string", DisplayName: "Account Name" }],
        }) as IEntityMetadata
      );
      await accountLoad;
    });
    expect(screen.getByText("First Name")).toBeTruthy();
    expect(screen.queryByText("Account Name")).toBeNull();
  });
});

describe("SmartOptionSet", () => {
  const optionSet = {
    Options: [
      { Value: 1, Label: "Accounting" },
      { Value: 6, Label: "Consulting" },
    ],
  };

  it("loads options from metadata and renders the selected label", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.industrycode": { DisplayName: "Industry", Type: "picklist", OptionSet: optionSet },
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
        "account.industrycode": { DisplayName: "Industry", Type: "picklist", OptionSet: optionSet },
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
          DisplayName: "Company Name",
          Type: "lookup",
          Targets: ["account"],
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
      expect(decodeURIComponent(String(query?.args[1]))).toContain("startswith(name,'");
    });
    const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
    expect(query.args[0]).toBe("account");
    expect(decodeURIComponent(String(query.args[1]))).toContain("startswith(name,'");
    expect(String(query.args[1])).toContain("$top=10");

    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
  });

  it("fetches a first page when the picker opens, before any typing", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": {
          DisplayName: "Company Name",
          Type: "lookup",
          Targets: ["account"],
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
      expect(String(query?.args[1])).not.toContain("startswith(");
    });
  });

  it("dialog mode opens the native picker and commits the chosen record", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
      expect(decodeURIComponent(String(last?.args[1]))).toContain("startswith(name,'co')");
    });
    const last = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
    expect(String(last.args[1])).toContain("?savedQuery=99990000-0000-0000-0000-000000000009");
  });

  it("attaches the resolved entity icon to inline results", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
      expect(decodeURIComponent(String(query?.args[1]))).toContain("and statecode eq 0");
    });
  });

  it("resolves the new target's view on rebind instead of reusing the previous target's", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
        "account.primarycontactid": { DisplayName: "Primary Contact", Type: "lookup", Targets: ["contact"] },
      },
      views: {
        "lookup:account": { id: "aaaa0000-0000-0000-0000-00000000000a" },
        "lookup:contact": { id: "bbbb0000-0000-0000-0000-00000000000b" },
      },
    });
    const first = new Observable<IEntityReference | null>(null);
    const second = new Observable<IEntityReference | null>(null);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartLookup entity="contact" attribute="parentcustomerid" value={first} searchDebounceMs={0} />
      </ViewModelContextProvider>
    );
    // Open once so the first target's lookup view id is resolved and cached.
    await userEvent.click(await screen.findByRole("combobox"));
    await waitFor(() => {
      expect(calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)?.args[0]).toBe("account");
    });

    // Reuse the instance for a different attribute whose target differs.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartLookup entity="account" attribute="primarycontactid" value={second} searchDebounceMs={0} />
      </ViewModelContextProvider>
    );
    await userEvent.click(await screen.findByRole("combobox"));

    // The search must run the NEW target's lookup view, not the cached old one.
    await waitFor(() => {
      const last = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
      expect(last.args[0]).toBe("contact");
      expect(String(last.args[1])).toContain("?savedQuery=bbbb0000-0000-0000-0000-00000000000b");
    });
  });

  it("a search in flight across a rebind is discarded, never shown against the new target", async () => {
    // The user searched contacts; the query is airborne when the control is
    // rebound to accounts. Without the rebind bumping the sequence, the
    // contact rows would land in an account-bound flyout (and a click would
    // commit a cross-typed reference).
    const gates: Array<() => void> = [];
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.primarycontactid": { DisplayName: "Primary Contact", Type: "lookup", Targets: ["contact"] },
      },
      entities: {
        contact: { primaryIdAttribute: "contactid", primaryNameAttribute: "fullname" },
      },
      views: { "lookup:contact": { id: "bbbb0000-0000-0000-0000-00000000000b" } },
      queryResults: {
        contact: [
          {
            entities: [
              { contactid: "c1c00000-0000-0000-0000-000000000001", fullname: "Old Contact" },
            ],
          },
        ],
      },
      queryGate: () => new Promise<void>((resolve) => gates.push(resolve)),
    });
    const value = new Observable<IEntityReference | null>(null);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartLookup
          entity="account"
          attribute="primarycontactid"
          targetEntity="contact"
          value={value}
          searchDebounceMs={0}
        />
      </ViewModelContextProvider>
    );
    await userEvent.click(await screen.findByRole("combobox"));
    await waitFor(() => expect(gates.length).toBe(1));

    // Rebind to a different target while the contact search is in flight.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartLookup
          entity="account"
          attribute="primarycontactid"
          targetEntity="account"
          value={value}
          searchDebounceMs={0}
        />
      </ViewModelContextProvider>
    );

    // The stale contact response lands after the rebind and must not render.
    await act(async () => gates[0]());
    expect(screen.queryByText("Old Contact")).toBeNull();
  });

  it("a failed dialog open surfaces the native error dialog instead of a dead button", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context, calls } = createFakeViewModelContext({
        attributes: {
          "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
        },
      });
      // A host without the native picker (the PCF shape): lookupObjects throws.
      context.navigation.lookupObjects = async () => {
        throw new Error("The native lookup dialog (lookupObjects) is not available in the PCF host.");
      };
      const value = new Observable<IEntityReference | null>(null);
      renderWith(
        context,
        <SmartLookup entity="contact" attribute="parentcustomerid" value={value} mode="dialog" />
      );
      await userEvent.click(await screen.findByLabelText("Browse records"));
      await waitFor(() => {
        expect(calls.find((c) => c.api === "openErrorDialog")).toBeDefined();
      });
      expect(value.value).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("a failed search logs and shows the failed state, not the empty state", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context } = createFakeViewModelContext({
        attributes: {
          "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
        },
        queryResults: {
          account: [{ failWith: "401 session expired" }],
        },
      });
      const value = new Observable<IEntityReference | null>(null);
      renderWith(
        context,
        <SmartLookup entity="contact" attribute="parentcustomerid" value={value} searchDebounceMs={0} />
      );
      await userEvent.type(await screen.findByRole("combobox"), "cont");
      // The failure must be distinguishable from "no matches": a user reading
      // "No records found" for a record that exists would create a duplicate.
      expect(await screen.findByText("The search could not be completed. Try again.")).toBeTruthy();
      expect(screen.queryByText("No records found")).toBeNull();
      expect(consoleError).toHaveBeenCalledWith("Lookup search failed", expect.anything());
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("SmartNativeLookup", () => {
  const baseOptions = {
    attributes: {
      "contact.preferredsystemuserid": {
        DisplayName: "Preferred User",
        Type: "lookup" as const,
        Targets: ["systemuser"],
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
      expect(decodeURIComponent(String(query?.args[1]))).toContain("startswith(fullname,'nan')");
    });
  });

  it("a failed flyout search logs and shows the failed state, not 'No records found'", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context } = createFakeViewModelContext({
        ...baseOptions,
        queryResults: {
          systemuser: [{ failWith: "429 throttled" }],
        },
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
      expect(await screen.findByText("The search could not be completed. Try again.")).toBeTruthy();
      expect(screen.queryByText("No records found")).toBeNull();
      expect(consoleError).toHaveBeenCalledWith("Lookup search failed", expect.anything());
    } finally {
      consoleError.mockRestore();
    }
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

  // A polymorphic (Customer) lookup with more than one target. The switcher
  // labels resolve asynchronously (one getEntityMetadata per target) after the
  // first render, so the switcher only appears if the smart control passes its
  // targets Observable down for the presentational control to observe. This
  // guards the regression where it passed a one-time snapshot instead, so the
  // resolved targets never reached the view and the switcher never showed.
  const polyOptions = {
    attributes: {
      "contact.parentcustomerid": {
        DisplayName: "Company Name",
        Type: "lookup" as const,
        Targets: ["account", "contact"],
      },
    },
    entities: {
      account: {
        displayName: "Accounts",
        primaryIdAttribute: "accountid",
        primaryNameAttribute: "name",
      },
      contact: {
        displayName: "Contacts",
        primaryIdAttribute: "contactid",
        primaryNameAttribute: "fullname",
      },
    },
    views: {
      "lookup:account": {
        id: "aaaa0000-0000-0000-0000-0000000000a1",
        columns: [{ name: "name", width: 200 }],
      },
      "lookup:contact": {
        id: "cccc0000-0000-0000-0000-0000000000c1",
        columns: [{ name: "fullname", width: 200 }],
      },
    },
    queryResults: {
      account: [{ entities: [{ accountid: "a1a00000-0000-0000-0000-000000000001", name: "A. Datum" }] }],
      contact: [{ entities: [{ contactid: "c1c00000-0000-0000-0000-000000000001", fullname: "Maria Campbell" }] }],
    },
  };

  it("renders the target switcher and re-queries the picked target", async () => {
    const { context, calls } = createFakeViewModelContext(polyOptions);
    const value = new Observable<IEntityReference | null>(null);
    renderWith(
      context,
      <SmartNativeLookup
        entity="contact"
        attribute="parentcustomerid"
        value={value}
        searchDebounceMs={0}
        showIcons={false}
      />
    );
    // Open the flyout; the default target (account) loads its first page.
    await userEvent.click(await screen.findByRole("combobox"));

    // The switcher trigger only appears once the async target labels resolve.
    const switcher = await screen.findByRole("button", { name: "Accounts" });
    await userEvent.click(switcher);

    // Pick the other target and confirm the flyout re-queries it.
    await userEvent.click(await screen.findByRole("menuitem", { name: "Contacts" }));
    await waitFor(() => {
      const query = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1);
      expect(query?.args[0]).toBe("contact");
      expect(String(query?.args[1])).toContain("?savedQuery=cccc0000-0000-0000-0000-0000000000c1");
    });
    expect(await screen.findByText("Maria Campbell")).toBeTruthy();
  });

  it("re-initializes the target on rebind so the flyout searches the new target", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "contact.preferredsystemuserid": {
          DisplayName: "Preferred User",
          Type: "lookup",
          Targets: ["systemuser"],
        },
        "account.primarycontactid": {
          DisplayName: "Primary Contact",
          Type: "lookup",
          Targets: ["contact"],
        },
      },
      entities: {
        systemuser: { primaryIdAttribute: "systemuserid", primaryNameAttribute: "fullname" },
        contact: { primaryIdAttribute: "contactid", primaryNameAttribute: "fullname" },
      },
      views: {
        "lookup:systemuser": {
          id: "5a5a0000-0000-0000-0000-000000000055",
          columns: [{ name: "fullname", width: 200 }],
        },
        "lookup:contact": {
          id: "cccc0000-0000-0000-0000-0000000000c1",
          columns: [{ name: "fullname", width: 200 }],
        },
      },
      queryResults: {
        systemuser: [
          { entities: [{ systemuserid: "u1u00000-0000-0000-0000-000000000001", fullname: "Nancy Davolio" }] },
        ],
        contact: [
          { entities: [{ contactid: "c1c00000-0000-0000-0000-000000000001", fullname: "Maria Campbell" }] },
        ],
      },
    });
    const first = new Observable<IEntityReference | null>(null);
    const second = new Observable<IEntityReference | null>(null);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartNativeLookup
          entity="contact"
          attribute="preferredsystemuserid"
          value={first}
          searchDebounceMs={0}
          showIcons={false}
        />
      </ViewModelContextProvider>
    );
    // Open once so the initial target (systemuser) is picked and searched.
    await userEvent.click(await screen.findByRole("combobox"));
    await waitFor(() => {
      expect(calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)?.args[0]).toBe("systemuser");
    });

    // Reuse the instance for a different attribute whose target differs.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartNativeLookup
          entity="account"
          attribute="primarycontactid"
          value={second}
          searchDebounceMs={0}
          showIcons={false}
        />
      </ViewModelContextProvider>
    );
    await userEvent.click(await screen.findByRole("combobox"));

    // The flyout must search the NEW target, not the previous one.
    await waitFor(() => {
      const last = calls.filter((c) => c.api === "retrieveMultipleRecords").at(-1)!;
      expect(last.args[0]).toBe("contact");
      expect(String(last.args[1])).toContain("?savedQuery=cccc0000-0000-0000-0000-0000000000c1");
    });
    expect(await screen.findByText("Maria Campbell")).toBeTruthy();
  });
});

describe("SmartNumberField locale + currency", () => {
  it("formats with the user's decimal symbol and group separator", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": { DisplayName: "Est. Value", Type: "decimal", Precision: 2 },
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
        "opportunity.estimatedvalue": { DisplayName: "Est. Value", Type: "money", Precision: 2 },
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

  it("re-resolves the currency when transactionCurrencyId changes on a reused instance", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": { DisplayName: "Est. Value", Type: "money", Precision: 2 },
      },
      currencies: {
        "55550000-0000-0000-0000-000000000005": { symbol: "€", precision: 2 },
        "66660000-0000-0000-0000-000000000006": { symbol: "£", precision: 2 },
      },
    });
    const value = new Observable<number | null>(1000);
    const { rerender } = render(
      <ViewModelContextProvider context={context}>
        <SmartNumberField
          entity="opportunity"
          attribute="estimatedvalue"
          value={value}
          transactionCurrencyId="55550000-0000-0000-0000-000000000005"
        />
      </ViewModelContextProvider>
    );
    expect(await screen.findByText("€")).toBeTruthy();

    // A master/detail record change swaps the currency; the reused field must
    // not keep showing the previous record's symbol.
    rerender(
      <ViewModelContextProvider context={context}>
        <SmartNumberField
          entity="opportunity"
          attribute="estimatedvalue"
          value={value}
          transactionCurrencyId="66660000-0000-0000-0000-000000000006"
        />
      </ViewModelContextProvider>
    );
    expect(await screen.findByText("£")).toBeTruthy();
    expect(screen.queryByText("€")).toBeNull();
  });

  it("uses the currency precision over the attribute precision when PrecisionSource is currency", async () => {
    const { context } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": {
          DisplayName: "Est. Value",
          Type: "money",
          Precision: 2,
          PrecisionSource: 1,
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
        "opportunity.estimatedvalue": { DisplayName: "Est. Value", Type: "money", Precision: 2 },
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

  it("uses the org pricing precision when PrecisionSource is 2", async () => {
    // The live org's revenue column rounds by pricingdecimalprecision, not
    // its own Precision; source 2 declares exactly that.
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "account.revenue": {
          DisplayName: "Annual Revenue",
          Type: "money",
          Precision: 2,
          PrecisionSource: 2,
        },
      },
      pricingDecimalPrecision: 0,
      formatting: { decimalSymbol: ".", numberSeparator: "," },
    });
    const value = new Observable<number | null>(1000);
    renderWith(
      context,
      <SmartNumberField entity="account" attribute="revenue" value={value} />
    );
    // 0 decimals (the org pricing precision), not 2 (the attribute precision).
    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1,000");
    });
    expect(calls.find((c) => c.api === "getPricingDecimalPrecision")).toBeDefined();
  });

  it("does not read the org pricing precision for other precision sources", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "opportunity.estimatedvalue": {
          DisplayName: "Est. Value",
          Type: "money",
          Precision: 2,
          PrecisionSource: 0,
        },
      },
    });
    renderWith(
      context,
      <SmartNumberField
        entity="opportunity"
        attribute="estimatedvalue"
        value={new Observable<number | null>(5)}
      />
    );
    await screen.findByRole("textbox");
    expect(calls.find((c) => c.api === "getPricingDecimalPrecision")).toBeUndefined();
  });
});

describe("form-load render batching", () => {
  // The UCI perf monitor showed the kit's smart controls rendering once per
  // resolved piece (metadata, formatting, currency, icons, switcher labels)
  // during form load, versus 2-3 renders for the platform's own controls.
  // Everything now resolves BEFORE one state commit, so a control's lifecycle
  // is: one loading paint, one content paint. The React Profiler counts the
  // commits; 2 is the contract, anything more is a regression toward the
  // one-repaint-per-resolution behavior.
  const countCommits = (ui: React.ReactNode, context: IViewModelContext) => {
    let commits = 0;
    render(
      <React.Profiler
        id="smart-batching"
        onRender={() => {
          commits += 1;
        }}
      >
        <ViewModelContextProvider context={context}>{ui}</ViewModelContextProvider>
      </React.Profiler>
    );
    return () => commits;
  };

  it("SmartNumberField paints twice: loading, then everything at once", async () => {
    // The heaviest field case: metadata + locale formatting + record currency
    // + org pricing precision, four async resolutions, one content commit.
    const { context } = createFakeViewModelContext({
      attributes: {
        "account.revenue": {
          DisplayName: "Annual Revenue",
          Type: "money",
          Precision: 2,
          PrecisionSource: 2,
        },
      },
      currencies: { "55550000-0000-0000-0000-000000000005": { symbol: "€", precision: 2 } },
      pricingDecimalPrecision: 0,
      formatting: { decimalSymbol: ".", numberSeparator: "," },
    });
    const commits = countCommits(
      <SmartNumberField
        entity="account"
        attribute="revenue"
        value={new Observable<number | null>(1000)}
        transactionCurrencyId="55550000-0000-0000-0000-000000000005"
      />,
      context
    );
    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("1,000");
    });
    expect(await screen.findByText("€")).toBeTruthy();
    expect(commits()).toBeLessThanOrEqual(2);
  });

  it("SmartNativeLookup paints twice with switcher labels and the selected icon in place", async () => {
    // The known-chatty control: a polymorphic lookup resolving the attribute,
    // two target display names, and the selected value's icon.
    const { context } = createFakeViewModelContext({
      attributes: {
        "contact.parentcustomerid": {
          DisplayName: "Company",
          Type: "customer",
          Targets: ["account", "contact"],
        },
      },
      entities: {
        account: { displayName: "Account" },
        contact: { displayName: "Contact" },
      },
      entityIcons: { account: "https://org/_imgs/svg_1.svg" },
    });
    const value = new Observable<IEntityReference | null>({
      id: "a1a00000-0000-0000-0000-000000000001",
      logicalName: "account",
      name: "Contoso Ltd",
    });
    const commits = countCommits(
      <SmartNativeLookup entity="contact" attribute="parentcustomerid" value={value} />,
      context
    );
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();
    // The switcher labels and icon resolved BEFORE the content commit.
    expect(commits()).toBeLessThanOrEqual(2);
  });
});

describe("SmartViewGrid (read-only view grid)", () => {
  const viewSetup = {
    attributes: {
      "account.name": { DisplayName: "Account Name", Type: "string" as const },
      "account.telephone1": { DisplayName: "Main Phone", Type: "string" as const },
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

  it("rich + overrideFetchXml without a pageCount degrades to a working next/prev", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [{ accountid: "p1", name: "Contoso Ltd", telephone1: "1" }],
            moreRecords: true,
          },
        ],
      },
    });
    const override = new Observable<string | null>("<fetch><entity name='account'/></fetch>");
    const pages: number[] = [];
    renderWith(
      context,
      <SmartViewGrid
        entity="account"
        pageSize={2}
        pagination="rich"
        overrideFetchXml={override}
        onPageChange={(n) => pages.push(n)}
      />
    );
    await screen.findByText("Contoso Ltd");
    // No total available → simple next/prev shape, and Next must still be live:
    // the result said moreRecords, the host is waiting on onPageChange.
    expect(screen.queryByLabelText("First page")).toBeNull();
    const next = screen.getByLabelText("Next page") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    await userEvent.click(next);
    expect(pages).toEqual([2]);
    // Still host-controlled: the grid never pages the override itself.
    expect(calls.find((c) => c.api === "fetchPage")).toBeUndefined();
  });

  it("rich + an override observable holding null falls back to saved-view paging", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [{ accountid: "p1", name: "Contoso Ltd", telephone1: "1" }],
            totalRecordCount: 1,
          },
        ],
      },
    });
    const override = new Observable<string | null>(null);
    renderWith(
      context,
      <SmartViewGrid entity="account" pageSize={2} pagination="rich" overrideFetchXml={override} />
    );
    await screen.findByText("Contoso Ltd");
    // A null override means "use the saved query", and in rich mode the grid
    // must drive the FetchXML page/count paging itself.
    const fetchPage = calls.find((c) => c.api === "fetchPage")!;
    expect(fetchPage).toBeTruthy();
    expect(String(fetchPage.args[1])).toContain('page="1" count="2"');
  });

  it("override + simple pagination pages the FetchXML by page/count and morerecords, not nextLink", async () => {
    const { context, calls } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "p1", name: "Contoso Ltd", telephone1: "1" },
              { accountid: "p2", name: "Fabrikam Inc", telephone1: "2" },
            ],
            moreRecords: true,
          },
          {
            entities: [
              { accountid: "p3", name: "Adventure Works", telephone1: "3" },
              { accountid: "p4", name: "Northwind Traders", telephone1: "4" },
            ],
            moreRecords: false,
          },
        ],
      },
    });
    const override = new Observable<string | null>("<fetch><entity name='account'/></fetch>");
    renderWith(context, <SmartViewGrid entity="account" pageSize={2} overrideFetchXml={override} />);
    expect(await screen.findByText("Contoso Ltd")).toBeTruthy();

    // The override is paged with page/count (capped), not fetched whole via fetch.
    expect(calls.find((c) => c.api === "fetch")).toBeUndefined();
    const first = calls.find((c) => c.api === "fetchPage")!;
    expect(String(first.args[1])).toContain('page="1" count="2"');

    // Next is driven by morerecords (the FetchXML flag), not a dead nextLink.
    expect((screen.getByLabelText("Next page") as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(await screen.findByText("Adventure Works")).toBeTruthy();
    const paged = calls.filter((c) => c.api === "fetchPage").at(-1)!;
    expect(String(paged.args[1])).toContain('page="2" count="2"');

    // Page 2 reported no more records, so Next is now disabled.
    expect((screen.getByLabelText("Next page") as HTMLButtonElement).disabled).toBe(true);
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
        "account.name": { DisplayName: "Account Name", Type: "string" },
        "account.primarycontactid": { DisplayName: "Primary Contact", Type: "lookup", Targets: ["contact"] },
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
        "account.name": { DisplayName: "Account Name", Type: "string" },
        "contact.emailaddress1": { DisplayName: "Email", Type: "string" },
        "contact.parentcustomerid": { DisplayName: "Company", Type: "lookup", Targets: ["account"] },
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
    // Metadata was fetched against the contact entity for the related column,
    // one standard getEntityMetadata call carrying that entity's column names.
    expect(
      calls.some(
        (c) =>
          c.api === "utils.getEntityMetadata" &&
          c.args[0] === "contact" &&
          (c.args[1] as string[]).includes("emailaddress1")
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
    // default quick-find field is the entity's primary name ("name"); the
    // expression travels URL-encoded, the way a real server receives it
    expect(String(query.args[1])).toContain(
      `$filter=${encodeURIComponent("startswith(name,'cont')")}`
    );
  });

  it("quick find survives URL-hostile characters (&, #, %, +)", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const quickFind = new Observable("R&D 100% #1 a+b");
    renderWith(context, <SmartViewGrid entity="account" quickFind={quickFind} />);
    await screen.findByText("Contoso Ltd");
    const query = String(calls.find((c) => c.api === "retrieveMultipleRecords")!.args[1]);
    // The URL layer stays intact: exactly the composed parameters, and the
    // filter round-trips through decoding to the intended expression.
    const params = new URLSearchParams(query.slice(1));
    expect([...params.keys()].sort()).toEqual(["$filter", "savedQuery"]);
    expect(params.get("$filter")).toBe("startswith(name,'R&D 100% #1 a+b')");
  });

  it("applies declarative filters server-side", async () => {
    const { context, calls } = createFakeViewModelContext(viewSetup);
    const filters = new Observable<ISmartViewGridFilter[]>([
      { attribute: "statecode", value: 0 },
    ]);
    renderWith(context, <SmartViewGrid entity="account" filters={filters} />);
    await screen.findByText("Contoso Ltd");
    const query = calls.find((c) => c.api === "retrieveMultipleRecords")!;
    expect(String(query.args[1])).toContain(`$filter=${encodeURIComponent("statecode eq 0")}`);
  });

  it("discards a stale response that lands after a newer query", async () => {
    // Two reloads overlap; the EARLIER query's response arrives LAST and must
    // not overwrite the newer rows (nor clear the newer query's spinner early).
    const gates = new Map<number, () => void>();
    const { context } = createFakeViewModelContext({
      ...viewSetup,
      queryResults: {
        account: [
          {
            entities: [
              { accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd", telephone1: "1" },
            ],
          },
          {
            entities: [
              { accountid: "a1a00000-0000-0000-0000-000000000003", name: "Stale Corp", telephone1: "3" },
            ],
          },
          {
            entities: [
              { accountid: "a1a00000-0000-0000-0000-000000000004", name: "Newer Corp", telephone1: "4" },
            ],
          },
        ],
      },
      queryGate: ({ index }) => {
        if (index === 0) {
          return; // the initial load flows through
        }
        return new Promise<void>((resolve) => gates.set(index, resolve));
      },
    });
    const filters = new Observable<ISmartViewGridFilter[]>([]);
    renderWith(context, <SmartViewGrid entity="account" filters={filters} />);
    await screen.findByText("Contoso Ltd");

    // Reload A (will return "Stale Corp") departs first, reload B second.
    act(() => {
      filters.value = [{ attribute: "statecode", value: 0 }];
    });
    act(() => {
      filters.value = [{ attribute: "statecode", value: 1 }];
    });
    await waitFor(() => expect(gates.size).toBe(2));

    // The newer query answers first and wins.
    await act(async () => gates.get(2)!());
    expect(await screen.findByText("Newer Corp")).toBeTruthy();

    // The stale response lands afterwards and must be discarded.
    await act(async () => gates.get(1)!());
    expect(screen.queryByText("Stale Corp")).toBeNull();
    expect(screen.getByText("Newer Corp")).toBeTruthy();
  });

  it("a failed re-query surfaces the degraded banner, and the next success clears it", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context } = createFakeViewModelContext({
        ...viewSetup,
        queryResults: {
          account: [
            {
              entities: [
                { accountid: "a1a00000-0000-0000-0000-000000000001", name: "Contoso Ltd", telephone1: "1" },
              ],
            },
            { failWith: "session expired" },
            {
              entities: [
                { accountid: "a1a00000-0000-0000-0000-000000000005", name: "Recovered Corp", telephone1: "5" },
              ],
            },
          ],
        },
      });
      const refresh = new ObservableEvent<void>();
      renderWith(context, <SmartViewGrid entity="account" refresh={refresh} />);
      await screen.findByText("Contoso Ltd");

      // The re-query fails: no silent stale rows, a readable banner instead.
      await act(async () => refresh.publish(undefined));
      expect(
        await screen.findByText("This view's records could not be loaded in this environment.")
      ).toBeTruthy();
      expect(screen.queryByText("Contoso Ltd")).toBeNull();

      // The next successful query recovers the grid.
      await act(async () => refresh.publish(undefined));
      expect(await screen.findByText("Recovered Corp")).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
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
      expect(String(queries.at(-1)!.args[1])).toContain(`$orderby=${encodeURIComponent("name asc")}`);
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
      expect(String(queries.at(-1)!.args[1])).toContain(`$orderby=${encodeURIComponent("name asc")}`);
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
      attributes: { "opportunity.name": { DisplayName: "Topic", Type: "string" } },
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

  it("activity invoke opens the real activity type from the raw value, even with a localized label", async () => {
    // The wire shape: the raw EntityName value is the logical name in every
    // language; only the formatted label is localized (German org here).
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "activitypointer.subject": { DisplayName: "Subject", Type: "string" },
        "activitypointer.activitytypecode": { DisplayName: "Activity Type", Type: "picklist" },
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
                activitytypecode: "phonecall",
                "activitytypecode@OData.Community.Display.V1.FormattedValue": "Telefonanruf",
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

  it("activity invoke resolves a numeric type code through the activity-type metadata", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: {
        "activitypointer.subject": { DisplayName: "Subject", Type: "string" },
        "activitypointer.activitytypecode": { DisplayName: "Activity Type", Type: "picklist" },
      },
      entities: { activitypointer: { primaryIdAttribute: "activityid" } },
      activityTypes: [
        { logicalName: "task", displayName: "Aufgabe", objectTypeCode: 4212 },
        { logicalName: "phonecall", displayName: "Telefonanruf", objectTypeCode: 4210 },
      ],
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
                activityid: "ac2",
                subject: "Follow up",
                activitytypecode: 4210,
                "activitytypecode@OData.Community.Display.V1.FormattedValue": "Telefonanruf",
              },
            ],
          },
        ],
      },
    });
    renderWith(context, <SmartViewGrid entity="activitypointer" />);
    await userEvent.dblClick(await screen.findByText("Follow up"));
    await waitFor(() => {
      expect(calls.find((c) => c.api === "openForm")?.args).toEqual(["phonecall", "ac2"]);
    });
  });

  it("activity invoke errors readably when activitytypecode is absent", async () => {
    const { context, calls } = createFakeViewModelContext({
      attributes: { "activitypointer.subject": { DisplayName: "Subject", Type: "string" } },
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
