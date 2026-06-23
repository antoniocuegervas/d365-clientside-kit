import * as React from "react";
import { render, screen } from "@testing-library/react";
import { CounterpartyGridView } from "../../../../shared/features/counterparty/CounterpartyGridView";
import { COUNTERPARTY_KEY } from "../../../../shared/features/counterparty/counterparty";
import { Observable } from "../../../../shared/reactivity/Observable";
import type { IGridColumn, IGridRow } from "../../../../shared/controls/presentational/DataGrid";

const columns: IGridColumn[] = [{ key: "subject", name: "Subject" }];
const rows: IGridRow[] = [
  {
    key: "1",
    subject: "Renewal terms",
    [COUNTERPARTY_KEY]: {
      counterparty: "Acme Corp (+1 more)",
      role: "To Recipient",
      parties: [
        { id: "a", entity: "account", name: "Acme Corp", role: "To Recipient" },
        { id: "b", entity: "contact", name: "Beta Holdings", role: "CC Recipient" },
      ],
    },
  },
  { key: "2", subject: "Internal sync", [COUNTERPARTY_KEY]: { counterparty: "", role: "", parties: [] } },
];

function renderView(searchText: string) {
  return render(
    <CounterpartyGridView
      columns={columns}
      rows={rows}
      onOpenRow={() => undefined}
      searchText={new Observable(searchText)}
    />
  );
}

describe("CounterpartyGridView search", () => {
  it("shows every row when the search is empty", () => {
    renderView("");
    expect(screen.getByText("Renewal terms")).toBeTruthy();
    expect(screen.getByText("Internal sync")).toBeTruthy();
  });

  it("filters by subject", () => {
    renderView("renewal");
    expect(screen.getByText("Renewal terms")).toBeTruthy();
    expect(screen.queryByText("Internal sync")).toBeNull();
  });

  it("filters by the lead counterparty", () => {
    renderView("acme");
    expect(screen.getByText("Renewal terms")).toBeTruthy();
    expect(screen.queryByText("Internal sync")).toBeNull();
  });

  it("filters by a party hidden under (+N more)", () => {
    renderView("beta");
    expect(screen.getByText("Renewal terms")).toBeTruthy();
    expect(screen.queryByText("Internal sync")).toBeNull();
  });
});
