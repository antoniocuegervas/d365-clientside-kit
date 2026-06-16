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

/** Normalizes a guid to the canonical bare lowercase form. */
export function normalizeGuid(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
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
