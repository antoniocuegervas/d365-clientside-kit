import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "../../../../../shared/controls/presentational/SearchBar";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * The debounce is the part with real timing logic: live search fires once after
 * the user pauses, Enter searches immediately and cancels the pending debounce,
 * and with no debounceMs typing never queries.
 */
describe("SearchBar debounce", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("fires onSearch once after the debounce, with the latest text", () => {
    const onSearch = jest.fn();
    render(
      <SearchBar
        searchText={new Observable("")}
        onSearch={onSearch}
        debounceMs={300}
        showButton={false}
        placeholder="Search"
      />
    );
    const input = screen.getByPlaceholderText("Search");
    fireEvent.change(input, { target: { value: "co" } });
    fireEvent.change(input, { target: { value: "con" } });
    expect(onSearch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("con");
  });

  it("Enter searches immediately and cancels the pending debounce", () => {
    const onSearch = jest.fn();
    render(
      <SearchBar
        searchText={new Observable("")}
        onSearch={onSearch}
        debounceMs={300}
        showButton={false}
        placeholder="Search"
      />
    );
    const input = screen.getByPlaceholderText("Search");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("abc");
    jest.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not search on typing when no debounce is set", () => {
    const onSearch = jest.fn();
    render(
      <SearchBar
        searchText={new Observable("")}
        onSearch={onSearch}
        showButton={false}
        placeholder="Search"
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "x" } });
    jest.advanceTimersByTime(1000);
    expect(onSearch).not.toHaveBeenCalled();
  });
});
