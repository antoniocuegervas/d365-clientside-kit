import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { CompanySearchView } from "./CompanySearchView";
import { CompanySearchViewModel } from "./CompanySearchViewModel";

registerApp(
  "sample-company-search",
  createViewApp("Company search: saved view + code-level control", CompanySearchView, (host) => ({
    viewModel: new CompanySearchViewModel(host.context),
  }))
);
