import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { ActivitiesGridView } from "./ActivitiesGridView";
import { ActivitiesGridViewModel } from "./ActivitiesGridViewModel";

registerApp(
  "sample-activities-grid",
  createViewApp("Activities grid: all activity types merged", ActivitiesGridView, (host) => ({
    viewModel: new ActivitiesGridViewModel(host.context),
  }))
);
