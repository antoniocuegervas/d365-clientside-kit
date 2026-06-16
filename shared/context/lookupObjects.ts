import type { ILookupOptions } from "./IViewModelContext";
import { normalizeGuid, type IEntityReference, type IXrmLookupValue } from "../utils/EntityModel";

/**
 * Shared mapping between the kit's `ILookupOptions`/`IEntityReference` and the
 * native `Xrm.Utility.lookupObjects` shapes (G-02). `lookupObjects` is not in
 * the public `@types/xrm` surface, so the host call is typed structurally here
 * and used by both the modern and V8 webresource adapters.
 */

/** Native lookup result row, `Xrm.Utility.lookupObjects` resolves an array of these. */
export type { IXrmLookupValue };

/** Native lookup options object passed to `Xrm.Utility.lookupObjects`. */
export interface IXrmLookupOptions {
  allowMultiSelect?: boolean;
  defaultEntityType?: string;
  entityTypes?: string[];
  disableMru?: boolean;
  filters?: Array<{ filterXml: string; entityLogicalName: string }>;
  viewIds?: string[];
}

/** Structural slice of `Xrm.Utility` the adapters rely on for the lookup dialog. */
export interface IXrmUtilityLookup {
  lookupObjects?(options: IXrmLookupOptions): PromiseLike<IXrmLookupValue[] | undefined>;
}

/** Maps the kit's lookup options to the native object (1:1). */
export function toXrmLookupOptions(options: ILookupOptions): IXrmLookupOptions {
  return {
    allowMultiSelect: options.allowMultiSelect,
    defaultEntityType: options.defaultEntityType,
    entityTypes: options.entityTypes,
    disableMru: options.disableMru,
    filters: options.filters?.map((f) => ({
      filterXml: f.filterXml,
      entityLogicalName: f.entityLogicalName,
    })),
    viewIds: options.viewIds,
  };
}

/** Maps native lookup results to kit entity references (empty on cancel). */
export function toEntityReferences(
  values: IXrmLookupValue[] | undefined | null
): IEntityReference[] {
  return (values ?? []).map((value) => ({
    id: normalizeGuid(value.id),
    logicalName: value.entityType,
    name: value.name,
  }));
}

/** Calls the host lookup dialog or throws a clear error when unavailable. */
export async function callLookupObjects(
  utility: IXrmUtilityLookup | undefined,
  options: ILookupOptions,
  hostLabel: string
): Promise<IEntityReference[]> {
  if (typeof utility?.lookupObjects !== "function") {
    throw new Error(`The native lookup dialog (lookupObjects) is not available in the ${hostLabel} host.`);
  }
  const result = await utility.lookupObjects(toXrmLookupOptions(options));
  return toEntityReferences(result);
}
