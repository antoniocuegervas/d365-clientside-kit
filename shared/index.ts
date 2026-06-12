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

// Host abstraction
export type {
  IViewModelContext,
  IWebApi,
  INavigation,
  IContextUtils,
  IFormAccess,
  IUserInfo,
  IMetadataApi,
  IAttributeMetadata,
  IEntityMetadata,
  IViewDefinition,
  AttributeKind,
} from "./context/IViewModelContext";
export { WebResourceContext } from "./context/WebResourceContext";
export { WebResourceContextV8, CdsWebApi, type IXrmV8Like } from "./context/WebResourceContextV8";
export { PCFContext, type IPcfContextLike } from "./context/PCFContext";
export {
  createWebResourceContext,
  createContextFromXrm,
  findXrm,
} from "./context/createWebResourceContext";
export { XrmPageFormAccess, type IXrmPageLike } from "./context/XrmFormAccess";

// Metadata
export { MetadataService, parseLayoutColumns } from "./metadata/MetadataService";

// Data access
export {
  CdsClient,
  CdsClientError,
  type ICdsClientOptions,
  type IRetrieveMultipleResult,
} from "./data/CdsClient";
