/**
 * Pure FetchXML mutation helpers for rich server-side paging (N-04).
 *
 * Dataverse has no OData offset jump (`$skip` is unsupported), so jump-to-any-
 * page rides FetchXML's `page`/`count` attributes, the only server-side
 * random-page mechanism. These are string/XML composition only (no parser), so
 * they run identically in browsers, jsdom, and PCF sandboxes.
 *
 * Rich mode isn't on the `?savedQuery=` path, so quick-find / declarative
 * filters / server sort must be composed INTO the FetchXML (conditions/orders)
 * rather than layered as OData options (the simple-mode T-01 trick). As with
 * simple mode, only ROOT-entity attributes are addressed, dotted (link-entity)
 * names are dropped, matching the savedQuery-layer boundary.
 */

export interface IFetchPagingOptions {
  /** 1-based page number → `page` attribute. */
  page: number;
  /** Page size → `count` attribute. */
  count: number;
  /** Add `returntotalrecordcount='true'` to fetch the (capped) total once. */
  returnTotalRecordCount?: boolean;
}

export interface IFetchCondition {
  attribute: string;
  /** FetchXML operator, e.g. "eq", "ne", "like". */
  operator: string;
  /** Omitted for null-style operators; otherwise rendered as the `value` attr. */
  value?: string | number | boolean;
}

const isRootAttribute = (attribute: string): boolean => !attribute.includes(".");

/** XML-escapes a value for an attribute literal. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sets `page`/`count` (and optional `returntotalrecordcount`) on the root
 * `<fetch>` element, stripping attributes that conflict with paging (`top`,
 * and any prior `page`/`count`/`paging-cookie`/`returntotalrecordcount`).
 */
export function setFetchPaging(fetchXml: string, options: IFetchPagingOptions): string {
  return fetchXml.replace(/<fetch\b([^>]*?)(\/?)>/, (_match, attrs: string, selfClose: string) => {
    const cleaned = attrs.replace(
      /\s+(page|count|top|paging-cookie|returntotalrecordcount)="[^"]*"/g,
      ""
    );
    let injected = ` page="${options.page}" count="${options.count}"`;
    if (options.returnTotalRecordCount) {
      injected += ` returntotalrecordcount="true"`;
    }
    return `<fetch${cleaned}${injected}${selfClose}>`;
  });
}

/**
 * Inserts a `<filter type="…">` with the given conditions just inside the root
 * `<entity>` element. Sibling `<filter>` elements at entity level are ANDed by
 * Dataverse, so callers compose an "and" filter for declarative filters and a
 * separate "or" filter for quick find. Root attributes only. No-op when no
 * usable conditions remain or no root `<entity>` is present.
 */
export function addRootFilter(
  fetchXml: string,
  conditions: IFetchCondition[],
  type: "and" | "or" = "and"
): string {
  const usable = conditions.filter((condition) => isRootAttribute(condition.attribute));
  if (usable.length === 0) {
    return fetchXml;
  }
  const inner = usable
    .map((condition) => {
      const valueAttr =
        condition.value === undefined
          ? ""
          : ` value="${xmlEscape(String(condition.value))}"`;
      return `<condition attribute="${condition.attribute}" operator="${condition.operator}"${valueAttr} />`;
    })
    .join("");
  const filterXml = `<filter type="${type}">${inner}</filter>`;
  return fetchXml.replace(/(<entity\b[^>]*>)/, `$1${filterXml}`);
}

/**
 * Replaces the root entity's `<order>` element(s) with a single order. Existing
 * root-level orders are removed first so the host sort wins. Root attributes
 * only. No-op for dotted attributes or when no root `<entity>` is present.
 */
export function setRootOrder(fetchXml: string, attribute: string, descending: boolean): string {
  if (!isRootAttribute(attribute)) {
    return fetchXml;
  }
  // Drop existing top-level <order .../> elements (those directly under entity
  // appear before any nested link-entity; a coarse strip is acceptable here
  // since rich mode owns the sort).
  const withoutOrders = fetchXml.replace(/<order\b[^>]*\/>/g, "").replace(/<order\b[^>]*>\s*<\/order>/g, "");
  const orderXml = `<order attribute="${attribute}" descending="${descending ? "true" : "false"}" />`;
  // Insert just before the root entity's closing tag.
  return withoutOrders.replace(/(<\/entity>)/, `${orderXml}$1`);
}
