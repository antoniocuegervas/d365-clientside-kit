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
export {
  entitySetName,
  escapeODataString,
  odataBind,
  formattedValue,
  formatODataValue,
  lookupCell,
  type ILookupCell,
} from "./utils/odata";
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
  ILookupOptions,
  IFormattingInfo,
  IDateFormatInfo,
  ICurrencyInfo,
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
export {
  ViewModelContextProvider,
  ViewModelReactContext,
  SmartComponent,
} from "./context/ViewModelContextProvider";

// Metadata
export { MetadataService, parseLayoutColumns } from "./metadata/MetadataService";

// Theme (single D365-aligned Fluent v9 theme module)
export { d365Theme } from "./theme/d365Theme";

// Presentational controls (CRM-agnostic, values in / events out)
export type { ICommonFieldProps } from "./controls/presentational/fieldProps";
export { FieldShell } from "./controls/presentational/FieldShell";
export { TextField, type ITextFieldProps } from "./controls/presentational/TextField";
export {
  MultilineTextField,
  type IMultilineTextFieldProps,
} from "./controls/presentational/MultilineTextField";
export { OptionSetField, type IOptionSetFieldProps } from "./controls/presentational/OptionSetField";
export {
  MultiSelectOptionSetField,
  type IMultiSelectOptionSetFieldProps,
} from "./controls/presentational/MultiSelectOptionSetField";
export { BooleanField, type IBooleanFieldProps } from "./controls/presentational/BooleanField";
export { NumberField, type INumberFieldProps } from "./controls/presentational/NumberField";
export { CurrencyField, type ICurrencyFieldProps } from "./controls/presentational/CurrencyField";
export { DateTimeField, type IDateTimeFieldProps } from "./controls/presentational/DateTimeField";
export { LookupField, type ILookupFieldProps } from "./controls/presentational/LookupField";
export {
  MultiLookupField,
  type IMultiLookupFieldProps,
} from "./controls/presentational/MultiLookupField";
export {
  DataGrid,
  type IDataGridProps,
  type IGridColumn,
  type IGridRow,
} from "./controls/presentational/DataGrid";
export {
  SelectionTree,
  type ISelectionTreeProps,
  type ITreeNode,
} from "./controls/presentational/SelectionTree";
export {
  PersonaList,
  type IPersonaListProps,
  type IPersonaItem,
} from "./controls/presentational/PersonaList";
export { SearchBar, type ISearchBarProps } from "./controls/presentational/SearchBar";
export { Pagination, type IPaginationProps } from "./controls/presentational/Pagination";
export { WaitingMessage, type IWaitingMessageProps } from "./controls/presentational/WaitingMessage";

// Smart (metadata-aware) controls (declarative code blocks)
export { SmartFieldBase, type ISmartFieldProps } from "./controls/smart/SmartFieldBase";
export { SmartTextField, type ISmartTextFieldProps } from "./controls/smart/SmartTextField";
export { SmartOptionSet, type ISmartOptionSetProps } from "./controls/smart/SmartOptionSet";
export {
  SmartMultiSelectOptionSet,
  type ISmartMultiSelectOptionSetProps,
} from "./controls/smart/SmartMultiSelectOptionSet";
export { SmartBooleanField, type ISmartBooleanFieldProps } from "./controls/smart/SmartBooleanField";
export { SmartNumberField, type ISmartNumberFieldProps } from "./controls/smart/SmartNumberField";
export { SmartDatePicker, type ISmartDatePickerProps } from "./controls/smart/SmartDatePicker";
export { SmartLookup, type ISmartLookupProps } from "./controls/smart/SmartLookup";
export {
  SmartViewGrid,
  type ISmartViewGridProps,
  type ISmartViewGridFilter,
  type ISortSpec,
} from "./controls/smart/SmartViewGrid";
export {
  buildSavedQueryOptions,
  composeFilterExpression,
  composeOrderBy,
  type IViewQueryParams,
} from "./controls/smart/viewGridQuery";

// Components (composites)
export { RecordReady, type IRecordReadyProps } from "./components/RecordReady";

// Queries (reusable FetchXML fragments)
export {
  buildFetchXml,
  condition,
  containsCondition,
  escapeXml,
  type IFetchXmlOptions,
} from "./queries/fetchXml";
export {
  getConfigurationParameter,
  type IConfigurationParameterOptions,
} from "./queries/configuration";

// Data access
export {
  CdsClient,
  CdsClientError,
  type ICdsClientOptions,
  type IRetrieveMultipleResult,
} from "./data/CdsClient";
