/**
 * shared/ barrel, single discoverable export surface for the portable kit.
 * Areas are appended as phases land: reactivity, utils, data, context, metadata,
 * theme, controls (presentational + smart), components, queries.
 */

// Reactivity
export {
  Observable,
  isObservable,
  valueOf,
  type OrObservable,
  type Unsubscribe,
  type ObservableCallback,
  type ISubscribable,
} from "./reactivity/Observable";
export { ObservableEvent } from "./reactivity/ObservableEvent";
export { SubscriptionTracker } from "./reactivity/SubscriptionTracker";
export { ObserverComponent } from "./reactivity/ObserverComponent";

// Entity model + utilities
export {
  EntityReference,
  normalizeGuid,
  type IEntityReference,
  type IOptionItem,
} from "./utils/EntityModel";
export { entitySetName, escapeODataString, odataBind, formattedValue } from "./utils/odata";
export { newGuid, newBatchBoundary } from "./utils/correlation";
export {
  parseWebResourceParams,
  buildClientUIDataParam,
  type IWebResourceParams,
} from "./utils/webResourceParams";
export * as LibraryUtils from "./utils/LibraryUtils";
