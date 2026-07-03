import type {
  IActivityTypeInfo,
  ICurrencyInfo,
  IMetadataApi,
  IViewDefinition,
} from "../context/IViewModelContext";
import { normalizeGuid } from "../utils/EntityModel";
import type { IMetadataSource } from "./IMetadataSource";

/**
 * MetadataService, the cached kit metadata helpers: saved views, activity
 * types, currency info, entity icons, the reads with no standard-API
 * equivalent. Entity and attribute metadata itself mirrors the standard API
 * and lives on `context.utils.getEntityMetadata`.
 *
 * The service owns the session cache, the key normalization, and the
 * IMetadataApi contract, while the actual reads come from the injected
 * IMetadataSource, so the transport choice sits at the composition root.
 * Results are cached for the session, metadata is effectively immutable at
 * runtime.
 */
export class MetadataService implements IMetadataApi {
  private readonly source: IMetadataSource;
  private readonly alsoClear: ReadonlyArray<{ clearCache(): void }>;
  private readonly viewCache = new Map<string, Promise<IViewDefinition>>();
  private readonly currencyCache = new Map<string, Promise<ICurrencyInfo>>();
  private readonly iconCache = new Map<string, Promise<string | undefined>>();
  private activityTypesPromise?: Promise<IActivityTypeInfo[]>;
  private pricingPrecisionPromise?: Promise<number | undefined>;

  /**
   * `alsoClear` chains further kit-side caches into {@link clearCache},
   * so the adapter can hand the one documented escape hatch to everything it
   * composed (the OData entity-metadata synthesis cache, most notably).
   */
  constructor(source: IMetadataSource, alsoClear: ReadonlyArray<{ clearCache(): void }> = []) {
    this.source = source;
    this.alsoClear = alsoClear;
  }

  /**
   * Drops every kit-side cached read so the next one reloads from the server.
   * Metadata is cached for the session on purpose (it is effectively immutable
   * at runtime); this is the escape hatch for the one time it is not, a
   * solution promotion landing under an open session. The native metadata
   * store on modern and PCF hosts is platform-owned and unaffected.
   */
  clearCache(): void {
    this.viewCache.clear();
    this.currencyCache.clear();
    this.iconCache.clear();
    this.activityTypesPromise = undefined;
    this.pricingPrecisionPromise = undefined;
    for (const clearable of this.alsoClear) {
      clearable.clearCache();
    }
  }

  /**
   * Returns the cached promise for a key, or starts the load and caches it. A
   * successful result stays cached for the whole session (metadata is
   * effectively immutable at runtime). A failed read is removed from the cache
   * so the next caller tries again, instead of every later caller awaiting the
   * same failure until the page is reloaded. The caller still receives the
   * original rejection: the eviction runs alongside, it does not swallow the error.
   */
  private getOrLoad<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    load: () => Promise<T>
  ): Promise<T> {
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }
    const created = load();
    cache.set(key, created);
    created.catch(() => {
      // Drop the failed entry, but only if it is still the one we stored, so a
      // retry a later caller has already started is left in place.
      if (cache.get(key) === created) {
        cache.delete(key);
      }
    });
    return created;
  }

  getView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition> {
    const key = savedQueryId ? normalizeGuid(savedQueryId) : `default:${entityLogicalName}`;
    return this.getOrLoad(this.viewCache, key, () =>
      this.source.loadView(entityLogicalName, savedQueryId)
    );
  }

  getLookupView(entityLogicalName: string): Promise<IViewDefinition> {
    const key = `lookup:${entityLogicalName}`;
    return this.getOrLoad(this.viewCache, key, () =>
      this.source.loadLookupView(entityLogicalName)
    );
  }

  getActivityTypes(): Promise<IActivityTypeInfo[]> {
    const existing = this.activityTypesPromise;
    if (existing) {
      return existing;
    }
    const created = this.source.loadActivityTypes();
    this.activityTypesPromise = created;
    created.catch(() => {
      // Same eviction as getOrLoad, but this cache is a single field, not a Map.
      if (this.activityTypesPromise === created) {
        this.activityTypesPromise = undefined;
      }
    });
    return created;
  }

  getCurrencySymbol(transactionCurrencyId: string): Promise<ICurrencyInfo> {
    const key = normalizeGuid(transactionCurrencyId);
    return this.getOrLoad(this.currencyCache, key, () => this.source.loadCurrencyInfo(key));
  }

  getPricingDecimalPrecision(): Promise<number | undefined> {
    const existing = this.pricingPrecisionPromise;
    if (existing) {
      return existing;
    }
    const created = this.source.loadPricingDecimalPrecision();
    this.pricingPrecisionPromise = created;
    created.catch(() => {
      // Same eviction as getOrLoad, but this cache is a single field, not a Map.
      if (this.pricingPrecisionPromise === created) {
        this.pricingPrecisionPromise = undefined;
      }
    });
    return created;
  }

  getEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    return this.getOrLoad(this.iconCache, entityLogicalName, () =>
      this.source.loadEntityIconUrl(entityLogicalName)
    );
  }

  getViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition> {
    const key = `name:${entityLogicalName}:${viewName}`;
    return this.getOrLoad(this.viewCache, key, () =>
      this.source.loadViewByName(entityLogicalName, viewName)
    );
  }
}

// The layout parsers moved to viewLayout.ts when the source seam was cut; the
// re-export keeps the public import path (shared/index) stable.
export { parseLayoutColumns, parseLayoutColumnsFromJson } from "./viewLayout";
