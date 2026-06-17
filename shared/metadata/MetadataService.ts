import type { CdsClient } from "../data/CdsClient";
import type {
  AttributeKind,
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

  constructor(client: CdsClient) {
    this.client = client;
  }

  getEntityMetadata(entityLogicalName: string): Promise<IEntityMetadata> {
    let cached = this.entityCache.get(entityLogicalName);
    if (!cached) {
      cached = this.loadEntityMetadata(entityLogicalName);
      this.entityCache.set(entityLogicalName, cached);
    }
    return cached;
  }

  getAttributeMetadata(
    entityLogicalName: string,
    attributeLogicalName: string
  ): Promise<IAttributeMetadata> {
    const key = `${entityLogicalName}.${attributeLogicalName}`;
    let cached = this.attributeCache.get(key);
    if (!cached) {
      cached = this.loadAttributeMetadata(entityLogicalName, attributeLogicalName);
      this.attributeCache.set(key, cached);
    }
    return cached;
  }

  getView(entityLogicalName: string, savedQueryId?: string): Promise<IViewDefinition> {
    const key = savedQueryId ? normalizeGuid(savedQueryId) : `default:${entityLogicalName}`;
    let cached = this.viewCache.get(key);
    if (!cached) {
      cached = this.loadView(entityLogicalName, savedQueryId);
      this.viewCache.set(key, cached);
    }
    return cached;
  }

  getCurrencySymbol(transactionCurrencyId: string): Promise<ICurrencyInfo> {
    const key = normalizeGuid(transactionCurrencyId);
    let cached = this.currencyCache.get(key);
    if (!cached) {
      cached = this.loadCurrencySymbol(key);
      this.currencyCache.set(key, cached);
    }
    return cached;
  }

  getEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    let cached = this.iconCache.get(entityLogicalName);
    if (!cached) {
      cached = this.loadEntityIconUrl(entityLogicalName);
      this.iconCache.set(entityLogicalName, cached);
    }
    return cached;
  }

  getViewByName(entityLogicalName: string, viewName: string): Promise<IViewDefinition> {
    const key = `name:${entityLogicalName}:${viewName}`;
    let cached = this.viewCache.get(key);
    if (!cached) {
      cached = this.loadViewByName(entityLogicalName, viewName);
      this.viewCache.set(key, cached);
    }
    return cached;
  }

  //#region loads

  private async loadEntityMetadata(entityLogicalName: string): Promise<IEntityMetadata> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${entityLogicalName}')` +
        `?$select=LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`
    );
    return {
      logicalName: entityLogicalName,
      displayName: localizedLabel(raw.DisplayName) ?? entityLogicalName,
      entitySetName: (raw.EntitySetName as string) ?? "",
      primaryIdAttribute: (raw.PrimaryIdAttribute as string) ?? "",
      primaryNameAttribute: (raw.PrimaryNameAttribute as string) ?? "",
    };
  }

  private async loadAttributeMetadata(
    entityLogicalName: string,
    attributeLogicalName: string
  ): Promise<IAttributeMetadata> {
    const basePath =
      `EntityDefinitions(LogicalName='${entityLogicalName}')` +
      `/Attributes(LogicalName='${attributeLogicalName}')`;
    const base = await this.client.get(
      `${basePath}?$select=LogicalName,DisplayName,Description,AttributeTypeName,RequiredLevel`
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
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MoneyAttributeMetadata?$select=Precision`
        );
        metadata.precision = raw.Precision as number | undefined;
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
        `${select}&$filter=returnedtypecode eq '${entityLogicalName}' and querytype eq 0 and isdefault eq true&$top=1`
      );
      if (result.entities.length === 0) {
        throw new Error(`No default grid view found for entity '${entityLogicalName}'`);
      }
      raw = result.entities[0];
    }
    return toViewDefinition(raw, entityLogicalName, savedQueryId);
  }

  /**
   * Resolves an entity's icon URL. Rules carried from production (the
   * OOTB `svg_<otc>.svg` path is a tested assumption, not documented platform
   * behavior): custom entities (logical name contains "_") → their vector
   * webresource; OOTB entities → `/_imgs/svg_<ObjectTypeCode>.svg`.
   */
  private async loadEntityIconUrl(entityLogicalName: string): Promise<string | undefined> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${entityLogicalName}')` +
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
      `returnedtypecode eq '${entityLogicalName}' and statecode eq 0`;
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
