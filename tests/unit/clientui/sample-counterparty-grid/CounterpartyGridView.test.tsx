import * as React from "react";
import { render, screen, act } from "@testing-library/react";
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

/**
 * Below PERSONA_BREAKPOINT the grid collapses each row into a persona card. The
 * width comes from MeasuredWidth's ResizeObserver, so the tests mock it: the
 * constructor captures the callback and a test fires it with a scripted width.
 */
describe("CounterpartyGridView persona switch", () => {
  // Fluent's DataGrid also constructs a ResizeObserver, so capture specifically
  // the one that observes MeasuredWidth's own full-width wrapper (its width:100%
  // inline style), not whichever observer happens to be constructed last.
  let measuredCallback: ResizeObserverCallback | undefined;

  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(element: Element): void {
      if ((element as HTMLElement).style?.width === "100%") {
        measuredCallback = this.callback;
      }
    }
    unobserve(): void {}
    disconnect(): void {}
  }

  const originalResizeObserver = (global as { ResizeObserver?: unknown }).ResizeObserver;

  beforeEach(() => {
    measuredCallback = undefined;
    (global as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    (global as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
  });

  const personaColumns: IGridColumn[] = [
    { key: "subject", name: "Subject" },
    { key: COUNTERPARTY_KEY, name: "Counterparty" },
  ];

  const renderMeasured = () =>
    render(<CounterpartyGridView columns={personaColumns} rows={rows} onOpenRow={() => undefined} />);

  const fireWidth = (width: number): void => {
    act(() => {
      measuredCallback?.(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
  };

  it("collapses each row into a persona card below the breakpoint, with the counterparty as secondary text", () => {
    renderMeasured();
    fireWidth(480);

    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getByText("Counterparty: Acme Corp (+1 more)")).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("renders the grid above the breakpoint", () => {
    renderMeasured();
    fireWidth(800);

    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
