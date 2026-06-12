import { createViewApp } from "../../AppContract";
import { registerApp } from "../../registry";
import { SamplesHubView } from "./SamplesHubView";

registerApp(
  "samples",
  createViewApp("Samples hub", SamplesHubView, (host) => ({ host }))
);
