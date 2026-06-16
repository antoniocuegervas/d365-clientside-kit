import { escapeODataString, formatODataValue } from "../../utils/odata";

/**
 * Pure query-string composition for SmartViewGrid (G-01, built on T-01).
 *
 * The grid runs a saved view by id (`?savedQuery={id}`), and quick find,
 * declarative filters, and server `$orderby` layer on top as additional OData
 * options the server ANDs over the view's own query. This is pure string
 * composition, no FetchXML parsing or merging.
 *
 * Boundary (from the platform): the layered `$filter`/`$orderby` only address
 * ROOT-entity attributes, so any field containing "." (a link-entity/aliased
 * column) is dropped here.
 */

export interface ISmartViewGridFilter {
  attribute: string;
  /** Comparison operator. Default "eq". */
  operator?: "eq" | "ne";
  /** Skipped entirely when null/undefined. */
  value: string | number | boolean | null | undefined;
}

export interface ISortSpec {
  attribute: string;
  descending?: boolean;
}

export interface IViewQueryParams {
  quickFindText?: string;
  /** Fields the quick-find text is `contains`-matched against. */
  quickFindFields?: string[];
  filters?: ISmartViewGridFilter[];
  orderBy?: ISortSpec | null;
  /** Page size → `$top`. */
  top?: number;
}

const isRootAttribute = (field: string): boolean => !field.includes(".");

/** quickFind AND filter1 AND filter2 …, or undefined when nothing applies. */
export function composeFilterExpression(params: IViewQueryParams): string | undefined {
  const clauses: string[] = [];

  const text = params.quickFindText?.trim();
  if (text) {
    const escaped = escapeODataString(text);
    const contains = (params.quickFindFields ?? [])
      .filter(isRootAttribute)
      .map((field) => `contains(${field},'${escaped}')`);
    if (contains.length === 1) {
      clauses.push(contains[0]);
    } else if (contains.length > 1) {
      clauses.push(`(${contains.join(" or ")})`);
    }
  }

  for (const filter of params.filters ?? []) {
    if (filter.value === null || filter.value === undefined) {
      continue;
    }
    if (!isRootAttribute(filter.attribute)) {
      continue;
    }
    clauses.push(`${filter.attribute} ${filter.operator ?? "eq"} ${formatODataValue(filter.value)}`);
  }

  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

/** e.g. "createdon desc", undefined for link-entity attributes or no sort. */
export function composeOrderBy(orderBy: ISortSpec | null | undefined): string | undefined {
  if (!orderBy || !isRootAttribute(orderBy.attribute)) {
    return undefined;
  }
  return `${orderBy.attribute}${orderBy.descending ? " desc" : " asc"}`;
}

/** Builds the full `?savedQuery=…[&$filter=…][&$orderby=…][&$top=…]` options. */
export function buildSavedQueryOptions(viewId: string, params: IViewQueryParams): string {
  const parts = [`savedQuery=${viewId}`];
  const filter = composeFilterExpression(params);
  if (filter) {
    parts.push(`$filter=${filter}`);
  }
  const orderBy = composeOrderBy(params.orderBy);
  if (orderBy) {
    parts.push(`$orderby=${orderBy}`);
  }
  if (params.top) {
    parts.push(`$top=${params.top}`);
  }
  return `?${parts.join("&")}`;
}
