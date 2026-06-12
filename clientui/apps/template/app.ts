import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { TemplateView } from "./TemplateView";
import { TemplateViewModel } from "./TemplateViewModel";

/**
 * Thin registration: app key, View, and how to build its props.
 * Copy this folder to start a new app; change the key, View, and ViewModel.
 */
registerApp(
  "template",
  createViewApp("Template, minimal scaffold", TemplateView, (host) => ({
    viewModel: new TemplateViewModel(host.context),
  }))
);
