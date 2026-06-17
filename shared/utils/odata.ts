import { normalizeGuid, type IEntityReference } from "./EntityModel";

/**
 * OData formatting helpers for the Dataverse Web API.
 */

/**
 * Derives the entity set name from a logical name using standard Dataverse
 * pluralization. Convention-based, pass an explicit set name wherever a
 * customization breaks the convention (rare for OOTB entities).
 */
export function entitySetName(logicalName: string): string {
  const lower = logicalName.toLowerCase();
  if (/(s|x|z|ch|sh)$/.test(lower)) {
    return `${lower}es`;
  }
  if (/[^aeiou]y$/.test(lower)) {
    return `${lower.slice(0, -1)}ies`;
  }
  return `${lower}s`;
}

/** Escapes a string literal for use inside an OData filter/query. */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Formats an @odata.bind path for associating a lookup on create/update. */
export function odataBind(reference: IEntityReference, entitySet?: string): string {
  return `/${entitySet ?? entitySetName(reference.logicalName)}(${normalizeGuid(reference.id)})`;
}

/**
 * Formats a primitive for an OData `$filter` literal: strings quoted and
 * `''`-escaped, booleans as true/false, numbers raw (G-15).
 */
export function formatODataValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return `'${escapeODataString(value)}'`;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

/** Reads the formatted-value annotation for an attribute, if present. */
export function formattedValue(
  record: Record<string, unknown>,
  attributeLogicalName: string
): string | undefined {
  return record[`${attributeLogicalName}@OData.Community.Display.V1.FormattedValue`] as
    | string
    | undefined;
}
