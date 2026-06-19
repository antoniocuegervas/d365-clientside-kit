import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { MasterDetailView } from "./MasterDetailView";
import { MasterDetailViewModel } from "./MasterDetailViewModel";

registerApp(
  "sample-master-detail",
  createViewApp(
    "Master / detail: account grid + editable contact",
    MasterDetailView,
    (host) => ({
      viewModel: new MasterDetailViewModel(host.context),
    })
  )
);
