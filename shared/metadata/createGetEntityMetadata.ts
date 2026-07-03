import type { IEntityMetadata } from "../context/IViewModelContext";
import { LibraryUtils } from "../utils/LibraryUtils";
import type { CdsEntityMetadataProvider } from "./CdsEntityMetadataProvider";

/**
 * The host's own metadata read: `Xrm.Utility.getEntityMetadata` on the modern
 * webresource host, `context.utils.getEntityMetadata` on PCF. Both resolve
 * the same client-side metadata store object.
 */
export type NativeGetEntityMetadata = (
  entityName: string,
  attributes?: string[]
) => PromiseLike<unknown>;

/**
 * Builds the kit's `utils.getEntityMetadata`: native-first with an OData
 * fallback.
 *
 * With a native read available (modern, PCF) the platform's object passes
 * through UNTOUCHED: it is client-cached by the platform and offline-capable,
 * and keeping it verbatim keeps the kit's surface exactly the standard one.
 * When the native read fails, or no native read exists (pre-v9, a harness),
 * the provider synthesizes the same shape from the OData endpoints, so a
 * consumer reads one contract everywhere.
 *
 * Either way, the entity's authoritative EntitySetName is taught to the
 * LibraryUtils pluralizer cache while the payload is in hand, so bind/query
 * paths use the real set name for any custom entity the convention would miss.
 */
export function createGetEntityMetadata(options: {
  native?: NativeGetEntityMetadata;
  provider: CdsEntityMetadataProvider;
}): (entityName: string, attributes?: string[]) => Promise<IEntityMetadata> {
  return async (entityName, attributes) => {
    if (options.native) {
      try {
        const result = (await options.native(entityName, attributes)) as IEntityMetadata;
        teachEntitySetName(entityName, result);
        return result;
      } catch (error) {
        console.warn(
          `Native metadata read failed for entity '${entityName}'; falling back to the OData source.`,
          error
        );
      }
    }
    // The provider teaches the pluralizer itself as it synthesizes.
    return options.provider.getEntityMetadata(entityName, attributes);
  };
}

function teachEntitySetName(entityName: string, metadata: IEntityMetadata): void {
  const entitySetName = metadata?.EntitySetName;
  if (typeof entitySetName === "string" && entitySetName) {
    LibraryUtils.cacheEntitySetName(entityName, entitySetName);
  }
}
