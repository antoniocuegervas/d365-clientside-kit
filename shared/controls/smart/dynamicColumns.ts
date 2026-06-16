import type * as React from "react";
import type { IGridRow } from "../presentational/DataGrid";
import { formattedValue, lookupCell } from "../../utils/odata";

/**
 * Dynamic ("polymorphic") column support (G-16), generalizes the cross-sell
 * fork's trick. A single grid column can resolve its value from two or more
 * SOURCE fields, each rendered with its own formatting: probe sources in order,
 * the first with a value renders the cell. This retires per-scenario grid forks
 * (e.g. one system populates a lookup, another a free-text field, but the user
 * needs one column).
 */

export interface IDynamicColumnSource {
  /** Source attribute (supports the aliased "alias.attr" form). */
  field: string;
  /** How to read/render the source value. Default: text/formatted. */
  kind?: "lookup" | "text" | "formatted" | "custom";
  /** Per-source custom renderer; receives the row and the resolved value. */
  render?: (row: IGridRow, value: unknown) => React.ReactNode;
}

export interface IDynamicColumnSpec {
  /** Column header text. */
  header: string;
  /** Probed in order; the first source with a value renders the cell. */
  sources: IDynamicColumnSource[];
  /**
   * Sorting hooks. `comparator` enables client-side sort of merged rows;
   * `fetchOrder`/`odataOrder` are emitted by hosts driving server sort over
   * each source field (FetchXML override / OData modes).
   */
  sort?: {
    fetchOrder?: (descending: boolean) => string;
    odataOrder?: (descending: boolean) => string;
    comparator?: (a: IGridRow, b: IGridRow) => number;
  };
  /** Optional contribution to quick-find / filter composition. */
  filter?: (criteria: unknown) => string;
}

/** A source value resolved from a record: a lookup cell or a primitive. */
export interface IResolvedSource {
  source: IDynamicColumnSource;
  value: unknown;
  /** True when `value` is an ILookupCell (render as a link). */
  isLookup: boolean;
}

const hasValue = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== "";

/** Reads one source's value from a record per its kind, or null when empty. */
function readSource(
  record: Record<string, unknown>,
  source: IDynamicColumnSource
): IResolvedSource | null {
  if (source.kind === "lookup") {
    const cell = lookupCell(record, source.field);
    return cell ? { source, value: cell, isLookup: true } : null;
  }
  if (source.kind === "formatted") {
    const formatted = formattedValue(record, source.field);
    return hasValue(formatted) ? { source, value: formatted, isLookup: false } : null;
  }
  // text / custom / default: raw value, falling back to its formatted annotation
  const raw = record[source.field];
  if (hasValue(raw)) {
    return { source, value: raw, isLookup: false };
  }
  const formatted = formattedValue(record, source.field);
  return hasValue(formatted) ? { source, value: formatted, isLookup: false } : null;
}

/** First source (in order) that has a value, or null when all are empty. */
export function resolveDynamicSource(
  record: Record<string, unknown>,
  spec: IDynamicColumnSpec
): IResolvedSource | null {
  for (const source of spec.sources) {
    const resolved = readSource(record, source);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
