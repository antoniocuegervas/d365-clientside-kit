import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { NewAccountWizardView } from "./NewAccountWizardView";
import { NewAccountWizardViewModel } from "./NewAccountWizardViewModel";

registerApp(
  "sample-new-account-wizard",
  createViewApp(
    "New account wizard: multi-step gated input",
    NewAccountWizardView,
    (host) => ({
      viewModel: new NewAccountWizardViewModel(host.context),
    })
  )
);
