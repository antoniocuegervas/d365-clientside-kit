import * as React from "react";
import { render, screen } from "@testing-library/react";
import { Pagination } from "../../../../../shared/controls/presentational/Pagination";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * The range label is the part with real logic: it shows from the page and page
 * size even when the total is unknown, and ends exactly on a short last page.
 */
describe("Pagination range label", () => {
  it("shows the page range with no total (simple mode)", () => {
    render(
      <Pagination
        page={new Observable(1)}
        pageSize={20}
        pageRecordCount={new Observable<number | null>(20)}
        hasNextPage={new Observable(true)}
      />
    );
    expect(screen.getByLabelText("Record range").textContent).toBe("Showing records 1–20");
  });

  it("ends the range exactly on a short last page", () => {
    render(
      <Pagination
        page={new Observable(4)}
        pageSize={20}
        pageRecordCount={new Observable<number | null>(7)}
        hasNextPage={new Observable(false)}
      />
    );
    expect(screen.getByLabelText("Record range").textContent).toBe("Showing records 61–67");
  });

  it("appends the total when known", () => {
    render(
      <Pagination
        page={new Observable(2)}
        pageCount={new Observable<number | null>(5)}
        totalRecordCount={new Observable<number | null>(118)}
        pageSize={25}
        onGoToPage={() => undefined}
      />
    );
    expect(screen.getByLabelText("Record range").textContent).toBe("Showing records 26–50 of 118");
  });

  it("omits the range when there is nothing to show", () => {
    render(
      <Pagination
        page={new Observable(1)}
        pageSize={20}
        pageRecordCount={new Observable<number | null>(0)}
        hasNextPage={new Observable(false)}
      />
    );
    expect(screen.queryByLabelText("Record range")).toBeNull();
  });
});
