import type { CdsClient } from "../data/CdsClient";
import type {
  IAttributeDescriptor,
  IAttributeMetadata,
  IAttributeMetadataCollection,
  IEntityMetadata,
} from "../context/IViewModelContext";
import { LibraryUtils } from "../utils/LibraryUtils";

/**
 * Synthesizes the STANDARD entity-metadata shape from the OData metadata
 * endpoints, for hosts without the native store (pre-v9) and as the runtime
 * fallback behind it. The goal is that a consumer of
 * `context.utils.getEntityMetadata` reads one shape on every host: entity
 * fields as plain strings, attributes as an ItemCollection whose items carry
 * a PascalCase `attributeDescriptor`, labels resolved to strings the way the
 * native store serves them. Where the native store's encoding is unverified
 * (RequiredLevel, AttributeTypeName), the OData encoding is kept verbatim;
 * the attributeMetadataReads helpers accept both by design.
 *
 * Results are cached per (entity, attribute-set) for the session; metadata is
 * effectively immutable at runtime. A failed load is evicted so a later call
 * retries. `clearCache` is wired into IMetadataApi.clearCache by the adapters.
 */
export class CdsEntityMetadataProvider {
  private readonly client: CdsClient;
  private readonly cache = new Map<string, Promise<IEntityMetadata>>();

  constructor(client: CdsClient) {
    this.client = client;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getEntityMetadata(entityName: string, attributes?: string[]): Promise<IEntityMetadata> {
    const requested = [...new Set(attributes ?? [])].sort();
    const key = `${entityName}|${requested.join(",")}`;
    const existing = this.cache.get(key);
    if (existing) {
      return existing;
    }
    const created = this.load(entityName, requested);
    this.cache.set(key, created);
    created.catch(() => {
      // Drop the failed entry, but only if it is still the one we stored, so a
      // retry a later caller has already started is left in place.
      if (this.cache.get(key) === created) {
        this.cache.delete(key);
      }
    });
    return created;
  }

  private async load(entityName: string, attributes: string[]): Promise<IEntityMetadata> {
    const [entity, descriptors] = await Promise.all([
      this.loadEntity(entityName),
      Promise.all(attributes.map((attribute) => this.loadDescriptor(entityName, attribute))),
    ]);
    return { ...entity, Attributes: toAttributeCollection(descriptors) };
  }

  private async loadEntity(entityName: string): Promise<IEntityMetadata> {
    const raw = await this.client.get(
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityName)}')` +
        `?$select=LogicalName,DisplayName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode`
    );
    const entitySetName = (raw.EntitySetName as string) ?? "";
    // Teach the convention-based pluralizer this entity's real set name, so the
    // cds-client write/query/bind paths use the authoritative name instead of a
    // guess for any custom entity the convention would miss.
    LibraryUtils.cacheEntitySetName(entityName, entitySetName);
    return {
      LogicalName: (raw.LogicalName as string) ?? entityName,
      // The native store serves entity labels as plain strings; match it.
      DisplayName: localizedLabel(raw.DisplayName) ?? entityName,
      EntitySetName: entitySetName,
      PrimaryIdAttribute: (raw.PrimaryIdAttribute as string) ?? "",
      PrimaryNameAttribute: (raw.PrimaryNameAttribute as string) ?? "",
      ObjectTypeCode: raw.ObjectTypeCode as number | undefined,
    };
  }

  /**
   * Two requests per attribute, the OData reality: the base row, then the
   * kind-specific cast query for the details (option lists, targets, bounds).
   * The result is assembled into one PascalCase descriptor.
   */
  private async loadDescriptor(
    entityName: string,
    attributeName: string
  ): Promise<IAttributeDescriptor> {
    const basePath =
      `EntityDefinitions(LogicalName='${LibraryUtils.escapeODataString(entityName)}')` +
      `/Attributes(LogicalName='${LibraryUtils.escapeODataString(attributeName)}')`;
    const base = await this.client.get(
      `${basePath}?$select=LogicalName,DisplayName,Description,AttributeTypeName,RequiredLevel,` +
        `IsSecured,CanBeSecuredForCreate,CanBeSecuredForRead,CanBeSecuredForUpdate`
    );
    const typeName =
      ((base.AttributeTypeName as { Value?: string } | undefined)?.Value ?? "").toString();

    const descriptor: IAttributeDescriptor = {
      LogicalName: (base.LogicalName as string) ?? attributeName,
      // Labels resolved to strings, the native store's encoding.
      DisplayName: localizedLabel(base.DisplayName) ?? attributeName,
      Description: localizedLabel(base.Description),
      // Kept verbatim where the native store's encoding is unverified; the
      // reads helpers accept the OData encodings.
      AttributeTypeName: base.AttributeTypeName,
      RequiredLevel: base.RequiredLevel,
      IsSecured: base.IsSecured === true,
      // Field-level security capability flags: which operations an FLS
      // profile can actually restrict on this column.
      CanBeSecuredForCreate: base.CanBeSecuredForCreate,
      CanBeSecuredForRead: base.CanBeSecuredForRead,
      CanBeSecuredForUpdate: base.CanBeSecuredForUpdate,
    };

    await this.applyKindSpecifics(basePath, typeName, descriptor);
    return descriptor;
  }

  /** Second, cast-typed query for the details each attribute kind needs. */
  private async applyKindSpecifics(
    basePath: string,
    typeName: string,
    descriptor: IAttributeDescriptor
  ): Promise<void> {
    switch (typeName) {
      case "PicklistType":
      case "StateType":
      case "StatusType": {
        const cast = castTypeForOptionSet(typeName);
        const raw = await this.client.get(`${basePath}/${cast}?$expand=OptionSet,GlobalOptionSet`);
        descriptor.OptionSet = {
          Options: readOptions(raw.OptionSet ?? raw.GlobalOptionSet),
        };
        return;
      }
      case "MultiSelectPicklistType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata` +
            `?$expand=OptionSet,GlobalOptionSet`
        );
        descriptor.OptionSet = {
          Options: readOptions(raw.OptionSet ?? raw.GlobalOptionSet),
        };
        return;
      }
      case "BooleanType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$expand=OptionSet`
        );
        const optionSet = raw.OptionSet as
          | { TrueOption?: RawOption; FalseOption?: RawOption }
          | undefined;
        descriptor.OptionSet = {
          FalseOption: optionSet?.FalseOption ? readOption(optionSet.FalseOption) : undefined,
          TrueOption: optionSet?.TrueOption ? readOption(optionSet.TrueOption) : undefined,
        };
        return;
      }
      case "LookupType":
      case "CustomerType":
      case "OwnerType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`
        );
        descriptor.Targets = (raw.Targets as string[] | undefined) ?? [];
        return;
      }
      case "DateTimeType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=Format`
        );
        descriptor.Format = raw.Format;
        return;
      }
      case "StringType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MaxLength`
        );
        descriptor.MaxLength = raw.MaxLength;
        return;
      }
      case "MemoType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=MaxLength`
        );
        descriptor.MaxLength = raw.MaxLength;
        return;
      }
      case "IntegerType":
      case "BigIntType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.${typeName === "BigIntType" ? "BigInt" : "Integer"}AttributeMetadata?$select=MinValue,MaxValue`
        );
        descriptor.MinValue = raw.MinValue;
        descriptor.MaxValue = raw.MaxValue;
        return;
      }
      case "DecimalType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DecimalAttributeMetadata` +
            `?$select=Precision,MinValue,MaxValue`
        );
        descriptor.Precision = raw.Precision;
        descriptor.MinValue = raw.MinValue;
        descriptor.MaxValue = raw.MaxValue;
        return;
      }
      case "DoubleType": {
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.DoubleAttributeMetadata` +
            `?$select=Precision,MinValue,MaxValue`
        );
        descriptor.Precision = raw.Precision;
        descriptor.MinValue = raw.MinValue;
        descriptor.MaxValue = raw.MaxValue;
        return;
      }
      case "MoneyType": {
        // PrecisionSource decides which precision actually applies: 0 the
        // attribute Precision, 1 the record currency's precision, 2 the org
        // pricing precision. Both ride along so the money control can pick.
        const raw = await this.client.get(
          `${basePath}/Microsoft.Dynamics.CRM.MoneyAttributeMetadata` +
            `?$select=Precision,PrecisionSource,MinValue,MaxValue`
        );
        descriptor.Precision = raw.Precision;
        descriptor.PrecisionSource = raw.PrecisionSource;
        descriptor.MinValue = raw.MinValue;
        descriptor.MaxValue = raw.MaxValue;
        return;
      }
      default:
        return; // nothing extra to load for this kind
    }
  }
}

/** Wraps synthesized descriptors in the standard ItemCollection shape. */
function toAttributeCollection(descriptors: IAttributeDescriptor[]): IAttributeMetadataCollection {
  const items: IAttributeMetadata[] = descriptors.map((descriptor) => ({
    LogicalName: descriptor.LogicalName,
    attributeDescriptor: descriptor,
  }));
  return {
    get: (name: string) => items.find((item) => item.LogicalName === name) ?? null,
    getAll: () => items,
    forEach: (callback: (item: IAttributeMetadata, index: number) => void) =>
      items.forEach(callback),
    getLength: () => items.length,
  };
}

//#region OData label/option normalizers

type RawLabel = unknown;
type RawOption = { Value?: number; Label?: RawLabel; Color?: string };

/** Resolves an OData label object to the user-localized string. */
export function localizedLabel(label: RawLabel): string | undefined {
  const userLabel = (label as { UserLocalizedLabel?: { Label?: string } } | undefined)
    ?.UserLocalizedLabel?.Label;
  return userLabel ?? undefined;
}

function readOption(raw: RawOption): { Value: number; Label: string; Color?: string } {
  return {
    Value: raw.Value ?? 0,
    // Labels resolved to strings, the native store's encoding.
    Label: localizedLabel(raw.Label) ?? String(raw.Value ?? ""),
    Color: raw.Color ?? undefined,
  };
}

function readOptions(rawOptionSet: unknown): Array<{ Value: number; Label: string; Color?: string }> {
  const options = (rawOptionSet as { Options?: RawOption[] } | undefined)?.Options ?? [];
  return options.map(readOption);
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
//#endregion
