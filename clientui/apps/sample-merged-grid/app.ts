import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { MergedGridView } from "./MergedGridView";
import { MergedGridViewModel } from "./MergedGridViewModel";

registerApp(
  "sample-merged-grid",
  createViewApp("Merged grid, rows from two FetchXML queries", MergedGridView, (host) => ({
    viewModel: new MergedGridViewModel(host.context),
  }))
);
