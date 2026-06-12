import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { TerritoryCascadeView } from "./TerritoryCascadeView";
import { TerritoryCascadeViewModel } from "./TerritoryCascadeViewModel";

registerApp(
  "sample-territory-cascade",
  createViewApp("Territory cascade, chained lookups + option set", TerritoryCascadeView, (host) => ({
    viewModel: new TerritoryCascadeViewModel(host.context),
  }))
);
