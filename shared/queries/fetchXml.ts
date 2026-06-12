/**
 * Minimal FetchXML composition helpers (queries area). Samples and
 * ViewModels build their queries from these; nothing here is entity-specific.
 */

export interface IFetchXmlOptions {
  entity: string;
  attributes: string[];
  /** Raw <filter> body, e.g. "<condition attribute='statecode' operator='eq' value='0'/>". */
  filter?: string;
  order?: { attribute: string; descending?: boolean };
  top?: number;
}

export function buildFetchXml(options: IFetchXmlOptions): string {
  const attributes = options.attributes
    .map((name) => `<attribute name="${name}" />`)
    .join("");
  const filter = options.filter ? `<filter type="and">${options.filter}</filter>` : "";
  const order = options.order
    ? `<order attribute="${options.order.attribute}" descending="${options.order.descending ? "true" : "false"}" />`
    : "";
  const top = options.top ? ` top="${options.top}"` : "";
  return (
    `<fetch version="1.0" output-format="xml-platform" mapping="logical"${top}>` +
    `<entity name="${options.entity}">${attributes}${filter}${order}</entity></fetch>`
  );
}

/** A single eq condition, XML-escaped. */
export function condition(attribute: string, operator: string, value: string): string {
  return `<condition attribute="${attribute}" operator="${operator}" value="${escapeXml(value)}" />`;
}

/** A like condition with surrounding wildcards (contains semantics). */
export function containsCondition(attribute: string, text: string): string {
  return `<condition attribute="${attribute}" operator="like" value="%${escapeXml(text)}%" />`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
