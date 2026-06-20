import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridCommandBar } from "../../../../../shared/controls/presentational/GridCommandBar";

describe("GridCommandBar", () => {
  it("disables Delete when nothing is selected", () => {
    render(
      <GridCommandBar selectedCount={0} onNew={() => undefined} onDelete={() => undefined} onRefresh={() => undefined} />
    );
    expect((screen.getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Delete and shows the count when rows are selected", () => {
    const onDelete = jest.fn();
    render(
      <GridCommandBar selectedCount={3} onNew={() => undefined} onDelete={onDelete} onRefresh={() => undefined} />
    );
    const del = screen.getByRole("button", { name: /Delete \(3\)/ }) as HTMLButtonElement;
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows only the actions whose handlers are supplied", () => {
    render(<GridCommandBar selectedCount={0} onRefresh={() => undefined} />);
    expect(screen.queryByRole("button", { name: /New/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeTruthy();
  });
});
