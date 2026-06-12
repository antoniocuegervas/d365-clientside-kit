import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { OpportunitySearchView } from "./OpportunitySearchView";
import { OpportunitySearchViewModel } from "./OpportunitySearchViewModel";

registerApp(
  "sample-opportunity-search",
  createViewApp("Opportunity search, kitchen sink filters", OpportunitySearchView, (host) => ({
    viewModel: new OpportunitySearchViewModel(host.context),
  }))
);
