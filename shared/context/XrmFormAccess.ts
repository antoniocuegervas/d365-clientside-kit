import type { IFormAccess } from "./IViewModelContext";
import { normalizeGuid, toLookupValue, type IEntityReference } from "../utils/EntityModel";

/**
 * Structural slice of an Xrm.Page / formContext that form access needs , 
 * identical between modern UCI webresources (parent Xrm.Page) and CRM 8.x.
 */
export interface IXrmPageLike {
  data?: {
    entity?: {
      getId(): string;
      getEntityName(): string;
      attributes: {
        get(name: string): { getValue(): unknown; setValue(value: unknown): void } | null;
      };
    };
  };
}

/** IFormAccess over an Xrm.Page-shaped object. */
export class XrmPageFormAccess implements IFormAccess {
  readonly raw: unknown;
  private readonly page: IXrmPageLike;

  constructor(page: IXrmPageLike) {
    this.page = page;
    this.raw = page;
  }

  /** True when the page actually has a record form behind it. */
  static hasForm(page: IXrmPageLike | undefined): page is IXrmPageLike {
    return !!page?.data?.entity;
  }

  getRecordId(): string | null {
    const id = this.page.data?.entity?.getId() ?? "";
    return id ? normalizeGuid(id) : null;
  }

  getEntityName(): string | null {
    return this.page.data?.entity?.getEntityName() ?? null;
  }

  getAttributeValue<T = unknown>(attributeLogicalName: string): T | null {
    const attribute = this.page.data?.entity?.attributes.get(attributeLogicalName);
    return (attribute?.getValue() as T | undefined) ?? null;
  }

  setAttributeValue(attributeLogicalName: string, value: unknown): void {
    // A kit IEntityReference is converted to the Xrm.LookupValue[] write shape
    // (braced GUID + entityType) so apps can push a chosen lookup straight onto
    // a form attribute without hand-rolling the conversion (N-05).
    const resolved = isEntityReference(value) ? [toLookupValue(value)] : value;
    this.page.data?.entity?.attributes.get(attributeLogicalName)?.setValue(resolved);
  }
}

/** Duck-types a kit IEntityReference (vs a plain primitive/object value). */
function isEntityReference(value: unknown): value is IEntityReference {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<IEntityReference>;
  return typeof candidate.id === "string" && typeof candidate.logicalName === "string";
}
