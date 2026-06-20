import * as React from "react";
import { act, render } from "@testing-library/react";
import {
  DataGrid,
  type IGridColumn,
  type IGridRow,
} from "../../../../../shared/controls/presentational/DataGrid";
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
