import type {
  IActivityTypeInfo,
  ICurrencyInfo,
  IViewDefinition,
} from "../context/IViewModelContext";

/**
 * The raw reads behind MetadataService's helper surface (the kit value-add
 * reads with no standard-API equivalent: saved views, activity types,
 * currency info, entity icons). The service owns the session cache and the
 * IMetadataApi contract; a source owns how each read reaches the server.
 *
 * Entity and attribute metadata is NOT here: that surface mirrors the
 * standard client API and lives on `context.utils.getEntityMetadata`.
 *
 * Every method loads exactly one uncached read; MetadataService decides when
 * a load runs and how long the result lives. Sources must not cache.
 */
export interface IMetadataSource {
  /** Loads a saved view by id, or the entity's default grid view when omitted. */
  loadView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition>;
  /** Loads the entity's default lookup view (querytype 64), else the grid view. */
  loadLookupView(entityLogicalName: string): Promise<IViewDefinition>;
  /** Resolves a system view by display name; throws when missing or ambiguous. */
  loadViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition>;
  /** Lists the directly-creatable activity types, ordered by display name. */
  loadActivityTypes(): Promise<IActivityTypeInfo[]>;
  /** Resolves a transaction currency's symbol and precision. `transactionCurrencyId` arrives normalized. */
  loadCurrencyInfo(transactionCurrencyId: string): Promise<ICurrencyInfo>;
  /** Reads the org's pricing decimal precision (organization.pricingdecimalprecision). */
  loadPricingDecimalPrecision(): Promise<number | undefined>;
  /** Resolves an entity's icon URL, or undefined when none can be resolved. */
  loadEntityIconUrl(entityLogicalName: string): Promise<string | undefined>;
}
