import type { CdsClient } from "../data/CdsClient";
import type {
  AttributeKind,
  IActivityTypeInfo,
  IAttributeMetadata,
  ICurrencyInfo,
  IEntityMetadata,
  IMetadataApi,
  IViewColumn,
  IViewDefinition,
} from "../context/IViewModelContext";
import type { IOptionItem } from "../utils/EntityModel";
import { normalizeGuid } from "../utils/EntityModel";
import { LibraryUtils } from "../utils/LibraryUtils";

/**
 * Out-of-box activity entities that are not created directly from a grid's New
 * action (activitypointer itself, recurring master, and system-written types), so they
 * are kept out of the activity-type picker.
 */
const NON_CREATABLE_ACTIVITY_TYPES = new Set([
  "activitypointer",
  "recurringappointmentmaster",
  "untrackedemail",
  "socialactivity",
  "bulkoperation",
]);

/**
 * MetadataService, cached, context-mediated Dataverse metadata.
 *
 * One implementation for all hosts: metadata is read through the same-origin
 * OData metadata endpoints via cds-client, then normalized to the kit's
 * IAttributeMetadata shape. Results are cached for the session, metadata is
 * effectively immutable at runtime.
 */
export class MetadataService implements IMetadataApi {
  private readonly client: CdsClient;
  private readonly entityCache = new Map<string, Promise<IEntityMetadata>>();
  private readonly attributeCache = new Map<string, Promise<IAttributeMetadata>>();
  private readonly viewCache = new Map<string, Promise<IViewDefinition>>();
  private readonly currencyCache = new Map<string, Promise<ICurrencyInfo>>();
  private readonly iconCache = new Map<string, Promise<string | undefined>>();
  private activityTypesPromise?: Promise<IActivityTypeInfo[]>;

  constructor(client: CdsClient) {
    this.client = client;
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

  getEntityMetadata(entityLogicalName: string): Promise<IEntityMetadata> {
    return this.getOrLoad(this.entityCache, entityLogicalName, () =>
      this.loadEntityMetadata(entityLogicalName)
    );
  }

  getAttributeMetadata(
    entityLogicalName: string,
    attributeLogicalName: string
  ): Promise<IAttributeMetadata> {
    const key = `${entityLogicalName}.${attributeLogicalName}`;
    return this.getOrLoad(this.attributeCache, key, () =>
      this.loadAttributeMetadata(entityLogicalName, attributeLogicalName)
    );
  }

  getView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition> {
    const key = savedQueryId ? normalizeGuid(savedQueryId) : `default:${entityLogicalName}`;
    return this.getOrLoad(this.viewCache, key, () => this.loadView(entityLogicalName, savedQueryId));
  }

  getLookupView(entityLogicalName: string): Promise<IViewDefinition> {
    const key = `lookup:${entityLogicalName}`;
    return this.getOrLoad(this.viewCache, key, () => this.loadLookupView(entityLogicalName));
  }

  getActivityTypes(): Promise<IActivityTypeInfo[]> {
    const existing = this.activityTypesPromise;
    if (existing) {
      return existing;
    }
    const created = this.loadActivityTypes();
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
    return this.getOrLoad(this.currencyCache, key, () => this.loadCurrencySymbol(key));
  }

  getEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    return this.getOrLoad(this.iconCache, entityLogicalName, () =>
      this.loadEntityIconUrl(entityLogicalName)
    );
  }

  getViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition> {
    const key = `name:${entityLogicalName}:${viewName}`;
    return this.getOrLoad(this.viewCache, key, () =>
      this.loadViewByName(entityLogicalName, viewName)
    );
  }

  //#region loads

  private async loadEntityMetadata(entityLogicalName: string): Promise<IEntityMetadata> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityLogicalName)}')` +
        `?$select=LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`
    );
    const entitySetName = (raw.EntitySetName as string) ?? "";
    // Teach the convention-based pluralizer this entity's real set name, so the
    // cds-client write/query/bind paths use the authoritative name instead of a
    // guess for any custom entity the convention would miss.
    LibraryUtils.cacheEntitySetName(entityLogicalName, entitySetName);
    return {
      logicalName: entityLogicalName,
      displayName: localizedLabel(raw.DisplayName) ?? entityLogicalName,
      entitySetName,
      primaryIdAttribute: (raw.PrimaryIdAttribute as string) ?? "",
      primaryNameAttribute: (raw.PrimaryNameAttribute as string) ?? "",
    };
  }

  private async loadAttributeMetadata(
    entityLogicalName: string,
    attributeLogicalName: string
  ): Promise<IAttributeMetadata> {
    const basePath =
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityLogicalName)}')` +
      `/Attributes(LogicalName='${LibraryUtils.escapeODataString(attributeLogicalName)}')`;
    const base = await this.client.get(
      `${basePath}?$select=LogicalName,DisplayName,Description,AttributeTypeName,RequiredLevel,IsSecured`
    );

    const typeName =
      ((base.AttributeTypeName as { Value?: string } | undefined)?.Value ?? "").toString();
    const kind = kindFromTypeName(typeName);
    const requiredValue =
      ((base.RequiredLevel as { Value?: string } | undefined)?.Value ?? "None").toString();

    const metadata: IAttributeMetadata = {
      logicalName: attributeLogicalName,
      displayName: localizedLabel(base.DisplayName) ?? attributeLogicalName,
      description: localizedLabel(base.Description),
      kind,
      required: requiredValue === "ApplicationRequired" || requiredValue === "SystemRequired",
      isSecured: base.IsSecured === true,
    };

    await this.applyKindSpecifics(basePath, typeName, metadata);
    return metadata;
  }

  /** Second, cast-typed query for the details each attribute kind needs. */
  private async applyKindSpecifics(
    basePath: string,
    typeName: string,
    metadata: IAttributeMetadata
  ): Promise<void> {
    switch (metadata.kind) {
      case "optionset": {
        const cast = castTypeForOptionSet(typeName);
        const raw = await this.client.get(`${basePath}/${cast}?$expand=OptionSet,GlobalOptionSet`);
        metadata.options = readOptions(raw.OptionSet ?? raw.GlobalOptionSet);
        return;
      }
      case "multioptionset": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata` +
            `?$expand=OptionSet,GlobalOptionSet`
        );
        metadata.options = readOptions(raw.OptionSet ?? raw.GlobalOptionSet);
        return;
      }
      case "boolean": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$expand=OptionSet`
        );
        const optionSet = raw.OptionSet as
          | { TrueOption?: RawOption; FalseOption?: RawOption }
          | undefined;
        const options: IOptionItem[] = [];
        if (optionSet?.FalseOption) {
          options.push(readOption(optionSet.FalseOption));
        }
        if (optionSet?.TrueOption) {
          options.push(readOption(optionSet.TrueOption));
        }
        metadata.options = options;
        return;
      }
      case "lookup": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`
        );
        metadata.targets = (raw.Targets as string[] | undefined) ?? [];
        return;
      }
      case "datetime": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=Format`
        );
        if ((raw.Format as string | undefined) === "DateOnly") {
          metadata.kind = "date";
        }
        return;
      }
      case "text": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MaxLength`
        );
        metadata.maxLength = raw.MaxLength as number | undefined;
        return;
      }
      case "memo": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=MaxLength`
        );
        metadata.maxLength = raw.MaxLength as number | undefined;
        return;
      }
      case "integer": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.IntegerAttributeMetadata?$select=MinValue,MaxValue`
        );
        metadata.minValue = raw.MinValue as number | undefined;
        metadata.maxValue = raw.MaxValue as number | undefined;
        return;
      }
      case "decimal": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DecimalAttributeMetadata` +
            `?$select=Precision,MinValue,MaxValue`
        );
        metadata.precision = raw.Precision as number | undefined;
        metadata.minValue = raw.MinValue as number | undefined;
        metadata.maxValue = raw.MaxValue as number | undefined;
        return;
      }
      case "double": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DoubleAttributeMetadata` +
            `?$select=Precision,MinValue,MaxValue`
        );
        metadata.precision = raw.Precision as number | undefined;
        metadata.minValue = raw.MinValue as number | undefined;
        metadata.maxValue = raw.MaxValue as number | undefined;
        return;
      }
      case "money": {
        // PrecisionSource decides which precision actually applies: 0 the
        // attribute Precision, 1 the record currency's precision, 2 the org
        // pricing precision. Fetch both so the money control can pick the right
        // one instead of always using the attribute Precision.
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=Precision,PrecisionSource`
        );
        metadata.precision = raw.Precision as number | undefined;
        metadata.precisionSource = raw.PrecisionSource as number | undefined;
        return;
      }
      default:
        return; // date / other, nothing extra to load
    }
  }

  private async loadView(
    entityLogicalName: string,
    savedQueryId?: string
  ): Promise<IViewDefinition> {
    const select = "?$select=name,fetchxml,layoutxml,layoutjson,returnedtypecode,savedqueryid";
    let raw: Record<string, unknown>;
    if (savedQueryId) {
      raw = await this.client.retrieveRecord("savedqueries", savedQueryId, select);
    } else {
      // Default public grid view for the entity (querytype 0).
      const result = await this.client.retrieveMultiple(
        "savedqueries",
        `${select}&$filter=returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and querytype eq 0 ` +
          `and isdefault eq true and statecode eq 0&$top=1`
      );
      if (result.entities.length === 0) {
        throw new Error(`No default grid view found for entity '${entityLogicalName}'`);
      }
      raw = result.entities[0];
    }
    return toViewDefinition(raw, entityLogicalName, savedQueryId);
  }

  private async loadLookupView(entityLogicalName: string): Promise<IViewDefinition> {
    const select = "?$select=name,fetchxml,layoutxml,layoutjson,returnedtypecode,savedqueryid";
    // Default lookup view for the entity (querytype 64), the one the native
    // single-record lookup uses.
    const result = await this.client.retrieveMultiple(
      "savedqueries",
      `${select}&$filter=returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and querytype eq 64 ` +
        `and isdefault eq true and statecode eq 0&$top=1`
    );
    if (result.entities.length === 0) {
      // No lookup view (some entities have none), fall back to the grid view.
      return this.loadView(entityLogicalName);
    }
    return toViewDefinition(result.entities[0], entityLogicalName);
  }

  /**
   * Resolves an entity's icon URL. Rules carried from production (the
   * OOTB `svg_<otc>.svg` path is a tested assumption, not documented platform
   * behavior): custom entities (logical name contains "_") → their vector
   * webresource; OOTB entities → `/_imgs/svg_<ObjectTypeCode>.svg`.
   */
  private async loadEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityLogicalName)}')` +
        `?$select=LogicalName,ObjectTypeCode,IconVectorName`
    );
    const base = this.client.clientUrl;
    if (entityLogicalName.includes("_")) {
      const vector = raw.IconVectorName as string | undefined;
      return vector ? `${base}/WebResources/${vector}` : undefined;
    }
    const objectTypeCode = raw.ObjectTypeCode as number | undefined;
    return objectTypeCode !== undefined && objectTypeCode !== null
      ? `${base}/_imgs/svg_${objectTypeCode}.svg`
      : undefined;
  }

  /**
   * Lists the directly-creatable activity types, ordered by display name. Filters
   * to out-of-box activities (IsCustomEntity false) and drops the system ones that
   * are not created directly from a grid (recurring master, untracked email,
   * social activity), so the list reads like the native "New activity" menu. Add-on
   * and custom activity types are out by design; widen this if a deployment needs
   * its own custom activity in the picker.
   */
  private async loadActivityTypes(): Promise<IActivityTypeInfo[]> {
    const raw = await this.client.get(
      "EntityDefinitions?$filter=IsActivity eq true and IsCustomEntity eq false" +
        "&$select=LogicalName,DisplayName,ObjectTypeCode"
    );
    const rows = (raw.value as Array<Record<string, unknown>> | undefined) ?? [];
    return rows
      .map((row) => ({
        logicalName: (row.LogicalName as string) ?? "",
        displayName: localizedLabel(row.DisplayName) ?? (row.LogicalName as string) ?? "",
        objectTypeCode: (row.ObjectTypeCode as number) ?? 0,
      }))
      .filter((type) => type.logicalName && !NON_CREATABLE_ACTIVITY_TYPES.has(type.logicalName))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /** Resolves a transaction currency's symbol + precision by id. */
  private async loadCurrencySymbol(transactionCurrencyId: string): Promise<ICurrencyInfo> {
    const raw = await this.client.retrieveRecord(
      "transactioncurrencies",
      transactionCurrencyId,
      "?$select=currencysymbol,currencyprecision"
    );
    return {
      symbol: (raw.currencysymbol as string) ?? "$",
      precision: raw.currencyprecision as number | undefined,
    };
  }

  /**
   * Resolves a system view by display name. Proven query shape: filter
   * savedqueries on name + returnedtypecode + active state; expect exactly one.
   */
  private async loadViewByName(
    entityLogicalName: string,
    viewName: string
  ): Promise<IViewDefinition> {
    const select = "$select=name,fetchxml,layoutxml,layoutjson,returnedtypecode,savedqueryid";
    const filter =
      `$filter=name eq '${LibraryUtils.escapeODataString(viewName)}' and ` +
      `returnedtypecode eq '${LibraryUtils.escapeODataString(entityLogicalName)}' and statecode eq 0`;
    const result = await this.client.retrieveMultiple("savedqueries", `?${select}&${filter}`);
    if (result.entities.length === 0) {
      throw new Error(`No active view named '${viewName}' found for entity '${entityLogicalName}'`);
    }
    if (result.entities.length > 1) {
      throw new Error(
        `Ambiguous view name '${viewName}' for entity '${entityLogicalName}' ` +
          `(${result.entities.length} matches)`
      );
    }
    return toViewDefinition(result.entities[0], entityLogicalName);
  }
  //#endregion
}

/** Normalizes a raw savedquery record into the kit's IViewDefinition. */
function toViewDefinition(
  raw: Record<string, unknown>,
  fallbackEntity: string,
  fallbackId?: string
): IViewDefinition {
  const layoutXml = (raw.layoutxml as string) ?? "";
  const layoutJson = (raw.layoutjson as string) ?? "";
  // Prefer layoutjson, it carries related-entity info cleanly; fall
  // back to layoutxml when it's absent or yields no columns.
  const jsonColumns = layoutJson ? parseLayoutColumnsFromJson(layoutJson) : [];
  const columns = jsonColumns.length > 0 ? jsonColumns : parseLayoutColumns(layoutXml);
  return {
    id: normalizeGuid((raw.savedqueryid as string) ?? fallbackId ?? ""),
    name: (raw.name as string) ?? "",
    entityLogicalName: (raw.returnedtypecode as string) ?? fallbackEntity,
    fetchXml: (raw.fetchxml as string) ?? "",
    layoutXml,
    layoutJson: layoutJson || undefined,
    columns,
  };
}

//#region normalizers

type RawLabel = unknown;
type RawOption = { Value?: number; Label?: RawLabel; Color?: string };

function localizedLabel(label: RawLabel): string | undefined {
  const userLabel = (label as { UserLocalizedLabel?: { Label?: string } } | undefined)
    ?.UserLocalizedLabel?.Label;
  return userLabel ?? undefined;
}

function readOption(raw: RawOption): IOptionItem {
  return {
    value: raw.Value ?? 0,
    label: localizedLabel(raw.Label) ?? String(raw.Value ?? ""),
    color: raw.Color ?? undefined,
  };
}

function readOptions(rawOptionSet: unknown): IOptionItem[] {
  const options = (rawOptionSet as { Options?: RawOption[] } | undefined)?.Options ?? [];
  return options.map(readOption);
}

/** Maps Dataverse AttributeTypeName values to the kit's AttributeKind. */
function kindFromTypeName(typeName: string): AttributeKind {
  switch (typeName) {
    case "StringType":
      return "text";
    case "MemoType":
      return "memo";
    case "PicklistType":
    case "StateType":
    case "StatusType":
      return "optionset";
    case "MultiSelectPicklistType":
      return "multioptionset";
    case "LookupType":
    case "CustomerType":
    case "OwnerType":
      return "lookup";
    case "DateTimeType":
      return "datetime";
    case "IntegerType":
    case "BigIntType":
      return "integer";
    case "DecimalType":
      return "decimal";
    case "DoubleType":
      return "double";
    case "MoneyType":
      return "money";
    case "BooleanType":
      return "boolean";
    default:
      return "other";
  }
}

function castTypeForOptionSet(typeName: string): string {
  switch (typeName) {
    case "StateType":
      return "Microsoft.Dynamics.CRM.StateAttributeMetadata";
    case "StatusType":
      return "Microsoft.Dynamics.CRM.StatusAttributeMetadata";
    default:
      return "Microsoft.Dynamics.CRM.PicklistAttributeMetadata";
  }
}

/**
 * Pulls ordered columns out of a savedquery layoutxml. Regex-based so it runs
 * identically in browsers, jsdom, and PCF sandboxes. Hidden cells are dropped;
 * `disablesorting` is honored. layoutxml link-entity cells use opaque composite
 * alias names, so related-entity resolution comes from layoutjson, this
 * path does not populate `relatedEntity`.
 */
export function parseLayoutColumns(layoutXml: string): IViewColumn[] {
  const columns: IViewColumn[] = [];
  const cellPattern = /<cell\b[^>]*>/g;
  for (const cell of layoutXml.match(cellPattern) ?? []) {
    const name = /name="([^"]+)"/.exec(cell)?.[1];
    if (!name || name === "0") {
      continue;
    }
    if (/\bishidden="(1|true)"/i.test(cell)) {
      continue;
    }
    const width = Number(/width="(\d+)"/.exec(cell)?.[1] ?? 100);
    const column: IViewColumn = { name, width };
    if (/\bdisablesorting="(1|true)"/i.test(cell)) {
      column.disableSorting = true;
    }
    columns.push(column);
  }
  return columns;
}

/** Shape of a layoutjson cell (field names verbatim from the platform). */
interface IRawLayoutCell {
  Name?: string;
  Width?: number;
  RelatedEntityName?: string;
  IsHidden?: boolean;
  DisableSorting?: boolean;
}

/**
 * Parses the modern `layoutjson` layout. Unlike layoutxml, each cell
 * carries `RelatedEntityName`, present only for related-entity (link-entity /
 * aliased) columns, so headers and types can resolve against the column's
 * OWNING entity. Reads `Rows[0].Cells` in order, dropping hidden cells.
 * Returns [] on malformed JSON so callers fall back to layoutxml.
 */
export function parseLayoutColumnsFromJson(layoutJson: string): IViewColumn[] {
  let parsed: { Rows?: Array<{ Cells?: IRawLayoutCell[] }> };
  try {
    parsed = JSON.parse(layoutJson);
  } catch {
    return [];
  }
  const cells = parsed.Rows?.[0]?.Cells ?? [];
  const columns: IViewColumn[] = [];
  for (const cell of cells) {
    const name = cell.Name;
    if (!name || name === "0" || cell.IsHidden) {
      continue;
    }
    const column: IViewColumn = { name, width: cell.Width ?? 100 };
    if (cell.RelatedEntityName) {
      column.relatedEntity = cell.RelatedEntityName;
    }
    if (cell.DisableSorting) {
      column.disableSorting = true;
    }
    columns.push(column);
  }
  return columns;
}
//#endregion
