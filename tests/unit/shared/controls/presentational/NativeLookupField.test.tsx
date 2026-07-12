import * as React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  NativeLookupField,
  splitHighlight,
  resultHasDetail,
  type INativeLookupResult,
  type INativeLookupTarget,
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

describe("NativeLookupField takeover (fullscreenSearch)", () => {
  // Opens the full-window takeover: fullscreenSearch true, then a click on the
  // resting field (the only combobox before opening) to open the search.
  const renderTakeover = (
    over: {
      results?: INativeLookupResult[];
      selected?: IEntityReference | null;
      targets?: INativeLookupTarget[];
      activeTarget?: string;
      onChange?: jest.Mock;
      onTargetChange?: jest.Mock;
    } = {}
  ) => {
    const selected = new Observable<IEntityReference | null>(over.selected ?? null);
    const results = new Observable<INativeLookupResult[]>(over.results ?? [withDetail, nameOnly]);
    const onChange = over.onChange ?? jest.fn();
    const onTargetChange = over.onTargetChange ?? jest.fn();
    const utils = render(
      <NativeLookupField
        label="Company"
        placeholder="Look for Company"
        selected={selected}
        results={results}
        fullscreenSearch
        targets={over.targets}
        activeTarget={over.activeTarget}
        onChange={onChange}
        onTargetChange={onTargetChange}
        onNew={() => undefined}
        onAdvanced={() => undefined}
      />
    );
    fireEvent.click(screen.getByPlaceholderText("Look for Company"));
    return { selected, results, onChange, onTargetChange, ...utils };
  };

  it("renders the anchored flyout, not a takeover, when fullscreenSearch is absent", () => {
    renderField([withDetail]);
    fireEvent.click(screen.getByPlaceholderText("Look for Primary Contact"));
    // The Popover path: a results tree, and none of the takeover chrome.
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close search" })).toBeNull();
  });

  it("renders the fixed takeover surface with a dismiss (X) and pinned footer when open", () => {
    renderTakeover();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Close search" })).toBeTruthy();
    // The pinned footer's New button and Advanced link both render.
    expect(within(dialog).getByText("New")).toBeTruthy();
    expect(within(dialog).getByText("Advanced")).toBeTruthy();
  });

  it("renders one scope button per target and raises onTargetChange on click", () => {
    const onTargetChange = jest.fn();
    renderTakeover({
      targets: [
        { entity: "account", label: "Accounts" },
        { entity: "contact", label: "Contacts" },
      ],
      activeTarget: "contact",
      onTargetChange,
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Accounts" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Contacts" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Accounts" }));
    expect(onTargetChange).toHaveBeenCalledWith("account");
  });

  it("commits the picked row and closes the takeover", () => {
    const onChange = jest.fn();
    renderTakeover({ onChange });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Coho Winery"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "1", logicalName: "contact", name: "Coho Winery" })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses via the X without raising onChange", () => {
    const onChange = jest.fn();
    renderTakeover({ onChange });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close search" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
