import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  DataGrid,
  type IGridColumn,
  type IGridRow,
} from "../../../../../shared/controls/presentational/DataGrid";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { ObservableArray } from "../../../../../shared/reactivity/ObservableArray";

const columns: IGridColumn[] = [
  { key: "name", name: "Name" },
  { key: "city", name: "City" },
];

/**
 * DataGrid takes its rows as an OrObservableList, so a host can hand it an
 * ObservableArray and get the safe per-row change behaviour. These cover that
 * binding: the grid renders the list and re-renders when it changes through the
 * list's own methods, with no need to re-pass the prop.
 */
describe("DataGrid bound to an ObservableArray of rows", () => {
  it("renders the rows it is given", () => {
    const rows = new ObservableArray<IGridRow>([
      { key: "1", name: "Contoso", city: "Redmond" },
    ]);
    const { container } = render(<DataGrid columns={columns} rows={rows} />);
    expect(container.textContent).toContain("Contoso");
    expect(container.textContent).toContain("Redmond");
  });

  it("re-renders when a row is added through push", () => {
    const rows = new ObservableArray<IGridRow>([
      { key: "1", name: "Contoso", city: "Redmond" },
    ]);
    const { container } = render(<DataGrid columns={columns} rows={rows} />);
    act(() => {
      rows.push({ key: "2", name: "Fabrikam", city: "Seattle" });
    });
    expect(container.textContent).toContain("Fabrikam");
  });

  it("re-renders when one row is changed through updateAt", () => {
    const rows = new ObservableArray<IGridRow>([
      { key: "1", name: "Contoso", city: "Redmond" },
    ]);
    const { container } = render(<DataGrid columns={columns} rows={rows} />);
    act(() => {
      rows.updateAt(0, (row) => ({ ...row, name: "Contoso Ltd" }));
    });
    expect(container.textContent).toContain("Contoso Ltd");
  });

  it("still accepts a plain array (static rows)", () => {
    const { container } = render(
      <DataGrid columns={columns} rows={[{ key: "1", name: "Contoso", city: "Redmond" }]} />
    );
    expect(container.textContent).toContain("Contoso");
  });
});

/**
 * The grid renders on Fluent's DataGrid (role="grid"/"row"/"gridcell"). These
 * pin the behaviour the kit owns on top of it: client sort, the loading
 * skeleton, the empty message, row click/selection highlight, and multi-select.
 */
describe("DataGrid behaviour", () => {
  const unsorted: IGridRow[] = [
    { key: "1", name: "Beta", city: "Redmond" },
    { key: "2", name: "Alpha", city: "Seattle" },
  ];

  const cellText = (): string[] => screen.getAllByRole("gridcell").map((cell) => cell.textContent ?? "");

  it("sorts a column in memory on header click, and toggles direction", () => {
    render(<DataGrid columns={columns} rows={unsorted} />);
    expect(cellText()[0]).toBe("Beta");

    fireEvent.click(screen.getByRole("columnheader", { name: "Name" }));
    expect(cellText()[0]).toBe("Alpha");

    fireEvent.click(screen.getByRole("columnheader", { name: "Name" }));
    expect(cellText()[0]).toBe("Beta");
  });

  it("does not sort a column marked sortable: false", () => {
    const fixed: IGridColumn[] = [
      { key: "name", name: "Name", sortable: false },
      { key: "city", name: "City" },
    ];
    render(<DataGrid columns={fixed} rows={unsorted} />);
    // A non-sortable header is a plain columnheader, not the sort button.
    fireEvent.click(screen.getByRole("columnheader", { name: "Name" }));
    expect(cellText()[0]).toBe("Beta");
  });

  it("shows the loading skeleton instead of rows", () => {
    render(<DataGrid columns={columns} rows={unsorted} loading />);
    expect(screen.getByLabelText("Loading rows")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("survives loading flipping to loaded without a hook-order error", () => {
    const loading = new Observable<boolean>(true);
    const rows = new Observable<IGridRow[]>([]);
    render(<DataGrid columns={columns} rows={rows} loading={loading} resizableColumns />);
    expect(screen.getByLabelText("Loading rows")).toBeTruthy();
    act(() => {
      rows.value = unsorted;
      loading.value = false;
    });
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
    expect(screen.queryByText("Beta")).not.toBeNull();
  });

  it("renders a resize handle per column when resizable", () => {
    render(<DataGrid columns={columns} rows={unsorted} resizableColumns />);
    expect(screen.getAllByRole("separator")).toHaveLength(columns.length);
  });

  it("shows the empty message when there are no rows", () => {
    render(<DataGrid columns={columns} rows={[]} emptyMessage="No accounts found." />);
    expect(screen.getByText("No accounts found.")).toBeTruthy();
  });

  it("raises onRowClick with the clicked row", () => {
    const clicked: string[] = [];
    render(
      <DataGrid columns={columns} rows={unsorted} onRowClick={(row) => clicked.push(row.key)} />
    );
    fireEvent.click(screen.getByText("Alpha"));
    expect(clicked).toEqual(["2"]);
  });

  it("styles the selected row differently from the others", () => {
    const selectedKey = new Observable<string | null>("2");
    render(<DataGrid columns={columns} rows={unsorted} selectedKey={selectedKey} />);
    const selected = screen.getByText("Alpha").closest('[role="row"]');
    const other = screen.getByText("Beta").closest('[role="row"]');
    expect(selected?.className).not.toEqual(other?.className);
  });

  it("toggles multi-select through the row checkbox and reports the keys", () => {
    const selectedKeys = new Observable<string[]>([]);
    const reported: string[][] = [];
    render(
      <DataGrid
        columns={columns}
        rows={unsorted}
        multiSelect
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => reported.push(keys)}
      />
    );
    // [0] is the select-all header checkbox; [1] is the first row.
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(selectedKeys.value).toEqual(["1"]);
    expect(reported.at(-1)).toEqual(["1"]);
  });
});
