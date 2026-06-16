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

/** A lookup cell extracted from a Web API record: id, display name, and target entity. */
export interface ILookupCell {
  id: string;
  name: string;
  /** Target entity logical name from the lookuplogicalname annotation. */
  target: string;
}

/**
 * Extracts a lookup value from a Web API record using the `_attr_value` triplet
 * (id + FormattedValue name + lookuplogicalname target). Returns null when the
 * lookup is empty (G-01 type-aware lookup cells).
 */
export function lookupCell(
  record: Record<string, unknown>,
  attributeLogicalName: string
): ILookupCell | null {
  const idKey = `_${attributeLogicalName}_value`;
  const id = record[idKey];
  if (id === null || id === undefined || id === "") {
    return null;
  }
  const name = record[`${idKey}@OData.Community.Display.V1.FormattedValue`];
  const target = record[`${idKey}@Microsoft.Dynamics.CRM.lookuplogicalname`];
  return {
    id: String(id),
    name: name !== undefined ? String(name) : "",
    target: target !== undefined ? String(target) : "",
  };
}

/**
 * Splits an aliased layout column name (`alias.attr`) into its parts (N-01).
 * Link-entity columns surface as `alias.attribute`; root columns have no dot.
 * Returns `{ logicalName }` (alias undefined) for a plain root-entity column.
 */
export function splitAliasedColumn(columnName: string): { alias?: string; logicalName: string } {
  const dot = columnName.indexOf(".");
  if (dot < 0) {
    return { logicalName: columnName };
  }
  return { alias: columnName.slice(0, dot), logicalName: columnName.slice(dot + 1) };
}

/**
 * Extracts a lookup value from an aliased link-entity column (N-01). Unlike a
 * root lookup, the value rides the alias-qualified key (`alias.attr` and its
 * `@…FormattedValue` / `@…lookuplogicalname` annotations) rather than the
 * `_attr_value` triplet. Returns null when empty.
 */
export function aliasedLookupCell(
  record: Record<string, unknown>,
  columnName: string
): ILookupCell | null {
  const id = record[columnName];
  if (id === null || id === undefined || id === "") {
    return null;
  }
  const name = record[`${columnName}@OData.Community.Display.V1.FormattedValue`];
  const target = record[`${columnName}@Microsoft.Dynamics.CRM.lookuplogicalname`];
  return {
    id: String(id),
    name: name !== undefined ? String(name) : "",
    target: target !== undefined ? String(target) : "",
  };
}
