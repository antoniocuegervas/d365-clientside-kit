import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NativeLookupField,
  splitHighlight,
  resultHasDetail,
  type INativeLookupResult,
} from "../../../../../shared/controls/presentational/NativeLookupField";
import { Observable } from "../../../../../shared/reactivity/Observable";
import type { IEntityReference } from "../../../../../shared/utils/EntityModel";

const withDetail: INativeLookupResult = {
  id: "1",
  name: "Coho Winery",
  logicalName: "contact",
  columns: [
    { value: "someone@example.com" },
    { value: "555-0159" },
  ],
};

const nameOnly: INativeLookupResult = {
  id: "2",
  name: "Counterparty Demo Co",
  logicalName: "contact",
};

describe("splitHighlight", () => {
  it("flags every case-insensitive occurrence as a match", () => {
    expect(splitHighlight("Coho .com", "co")).toEqual([
      { text: "Co", match: true },
      { text: "ho .", match: false },
      { text: "co", match: true },
      { text: "m", match: false },
    ]);
  });

  it("returns the whole text as one unmatched run for an empty query", () => {
    expect(splitHighlight("Coho", "")).toEqual([{ text: "Coho", match: false }]);
  });

  it("returns one unmatched run when there is no match", () => {
    expect(splitHighlight("Coho", "xyz")).toEqual([{ text: "Coho", match: false }]);
  });
});

describe("resultHasDetail (conditional chevron rule)", () => {
  it("is true only when there is more than one column", () => {
    expect(resultHasDetail(withDetail)).toBe(true);
    expect(resultHasDetail(nameOnly)).toBe(false);
    expect(resultHasDetail({ ...nameOnly, columns: [{ value: "only-line-2" }] })).toBe(false);
  });
});

const renderField = (results: INativeLookupResult[], onSearchTextChanged = jest.fn()) => {
  const selected = new Observable<IEntityReference | null>(null);
  return {
    selected,
    onSearchTextChanged,
    ...render(
      <NativeLookupField
        label="Primary Contact"
        placeholder="Look for Primary Contact"
        selected={selected}
        results={new Observable<INativeLookupResult[]>(results)}
        onSearchTextChanged={onSearchTextChanged}
      />
    ),
  };
};

describe("NativeLookupField flyout", () => {
  it("raises an empty search when the flyout opens (loads the first page)", () => {
    const onSearchTextChanged = jest.fn();
    renderField([withDetail], onSearchTextChanged);
    fireEvent.click(screen.getByPlaceholderText("Look for Primary Contact"));
    expect(onSearchTextChanged).toHaveBeenCalledWith("");
  });

  it("shows the expand chevron only for rows with detail beyond the first column", () => {
    renderField([withDetail, nameOnly]);
    fireEvent.click(screen.getByPlaceholderText("Look for Primary Contact"));
    expect(screen.getByRole("button", { name: /More details for record: Coho Winery/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /More details for record: Counterparty Demo Co/ })).toBeNull();
  });

  it("blanks a row icon that fails to load instead of showing a broken image", () => {
    renderField([{ ...nameOnly, iconUrl: "/_imgs/svg_2.svg" }]);
    fireEvent.click(screen.getByPlaceholderText("Look for Primary Contact"));
    const icon = document.body.querySelector('img[src="/_imgs/svg_2.svg"]') as HTMLImageElement;
    expect(icon).toBeTruthy();
    fireEvent.error(icon);
    // visibility (not display) keeps the 16px box, so the row text stays aligned
    expect(icon.style.visibility).toBe("hidden");
  });
});
