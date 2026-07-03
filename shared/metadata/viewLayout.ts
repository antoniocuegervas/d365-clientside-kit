import type { IViewColumn, IViewDefinition } from "../context/IViewModelContext";
import { normalizeGuid } from "../utils/EntityModel";

/**
 * Saved-view (savedquery) layout normalization, shared by every metadata
 * source: a raw savedquery record in, the kit's IViewDefinition out. Kept
 * separate from the sources because the record shape is identical whether it
 * arrived over cds-client or the native Web API.
 */

/** Normalizes a raw savedquery record into the kit's IViewDefinition. */
export function toViewDefinition(
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
