import { createFakeViewModelContext } from "../../../mocks/fakeViewModelContext";
import { MergedGridViewModel } from "../../../../clientui/apps/sample-merged-grid/MergedGridViewModel";

const FV = "@OData.Community.Display.V1.FormattedValue";

/** Lets the constructor's fire-and-forget load() settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const opportunity = (id: string, name: string) => ({
  opportunityid: id,
  name,
  [`_customerid_value${FV}`]: "Contoso Ltd",
  [`estimatedvalue${FV}`]: "$1,000",
});

describe("MergedGridViewModel", () => {
  it("merges the two pipelines into one row set with a source label", async () => {
    const { context } = createFakeViewModelContext({
      queryResults: {
        opportunity: [
          { entities: [opportunity("o1", "Open deal")] },
          { entities: [opportunity("o2", "Won deal")] },
        ],
      },
    });
    const viewModel = new MergedGridViewModel(context);
    await settle();

    expect(viewModel.results.value.map((row) => [row.topic, row.source])).toEqual([
      ["Open deal", "My open"],
      ["Won deal", "Won (last 30 days)"],
    ]);
    expect(viewModel.loading.value).toBe(false);
    expect(viewModel.loadError.value).toBeNull();
  });

  it("a slow stale load may not overwrite a newer one", async () => {
    // Load 1's two queries are held open; load 2 departs and completes first.
    // When load 1's responses finally land, the whole merge is discarded.
    const gates = new Map<number, () => void>();
    const { context } = createFakeViewModelContext({
      queryResults: {
        opportunity: [
          { entities: [opportunity("o1", "Old open")] },
          { entities: [opportunity("o2", "Old won")] },
          { entities: [opportunity("o3", "New open")] },
          { entities: [opportunity("o4", "New won")] },
        ],
      },
      queryGate: ({ index }) => {
        if (index <= 1) {
          return new Promise<void>((resolve) => gates.set(index, resolve));
        }
      },
    });
    const viewModel = new MergedGridViewModel(context);
    await settle();

    void viewModel.load();
    await settle();
    expect(viewModel.results.value.map((row) => row.topic)).toEqual(["New open", "New won"]);
    expect(viewModel.loading.value).toBe(false);

    // The stale pair lands last and is discarded whole.
    gates.get(0)!();
    gates.get(1)!();
    await settle();
    expect(viewModel.results.value.map((row) => row.topic)).toEqual(["New open", "New won"]);
  });

  it("a failed load shows the neutral banner, never raw SDK text", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { context } = createFakeViewModelContext({
        queryResults: {
          opportunity: [{ failWith: "0x80040203 fetch parse failure" }],
        },
      });
      const viewModel = new MergedGridViewModel(context);
      await settle();

      expect(viewModel.results.value).toEqual([]);
      expect(viewModel.loadError.value).toBe("This data could not be loaded in this environment.");
      expect(viewModel.loading.value).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
