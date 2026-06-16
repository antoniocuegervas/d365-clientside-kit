/**
 * Cross-host entity value types, the vocabulary shared by controls,
 * ViewModels, and the Web API layer.
 */

/** A reference to a Dataverse record (lookup value shape). */
export interface IEntityReference {
  /** Record id, bare lowercase guid, no braces. */
  id: string;
  /** Entity logical name, e.g. "account". */
  logicalName: string;
  /** Primary-name display value, when known. */
  name?: string;
  /** Entity icon URL for display (G-10); set by the smart tier when enabled. */
  iconUrl?: string;
}

/** One choice in an option set (presentational controls render these). */
export interface IOptionItem {
  value: number;
  label: string;
  /** Option color from metadata, when defined. */
  color?: string;
}

/**
 * The `Xrm.LookupValue` shape, what a form lookup attribute's `setValue`
 * expects and what `getValue` returns (N-05). Note the braced GUID Xrm uses on
 * write and `entityType` (the platform's name for the logical name).
 */
export interface IXrmLookupValue {
  /** Record id, Xrm expects a braced `{GUID}` on write. */
  id: string;
  /** Entity logical name (Xrm calls this `entityType`). */
  entityType: string;
  /** Primary-name display value. */
  name?: string;
}

/** Normalizes a guid to the canonical bare lowercase form. */
export function normalizeGuid(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

/** Wraps a bare guid in the braces Xrm expects when writing a lookup. */
export function braceGuid(id: string): string {
  return `{${normalizeGuid(id)}}`;
}

/**
 * Converts a kit reference to the `Xrm.LookupValue` write shape (N-05): braced
 * GUID + `entityType`. Apps push this onto a form lookup attribute.
 */
export function toLookupValue(reference: IEntityReference): IXrmLookupValue {
  return {
    id: braceGuid(reference.id),
    entityType: reference.logicalName,
    name: reference.name,
  };
}

/**
 * Converts an `Xrm.LookupValue` (or the array a form returns) back to a kit
 * `EntityReference` (N-05). Uses the first element; returns null when empty.
 */
export function fromLookupValue(
  value: IXrmLookupValue | IXrmLookupValue[] | null | undefined
): EntityReference | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || !first.id) {
    return null;
  }
  return new EntityReference(first.entityType, first.id, first.name);
}

export class EntityReference implements IEntityReference {
  readonly id: string;
  readonly logicalName: string;
  readonly name?: string;

  constructor(logicalName: string, id: string, name?: string) {
    this.logicalName = logicalName;
    this.id = normalizeGuid(id);
    this.name = name;
  }

  equals(other: IEntityReference | null | undefined): boolean {
    return (
      !!other &&
      this.logicalName === other.logicalName &&
      this.id === normalizeGuid(other.id)
    );
  }

  /** This reference as an `Xrm.LookupValue` for writing to a form attribute (N-05). */
  toLookupValue(): IXrmLookupValue {
    return toLookupValue(this);
  }

  /**
   * Reads a lookup from a Web API record using the standard annotation
   * triplet (_attr_value + formatted value + lookup logical name).
   * Returns null when the lookup is empty.
   */
  static fromODataRecord(
    record: Record<string, unknown>,
    attributeLogicalName: string
  ): EntityReference | null {
    const id = record[`_${attributeLogicalName}_value`] as string | null | undefined;
    if (!id) {
      return null;
    }
    const logicalName =
      (record[
        `_${attributeLogicalName}_value@Microsoft.Dynamics.CRM.lookuplogicalname`
      ] as string | undefined) ?? "";
    const name = record[
      `_${attributeLogicalName}_value@OData.Community.Display.V1.FormattedValue`
    ] as string | undefined;
    return new EntityReference(logicalName, id, name);
  }
}
