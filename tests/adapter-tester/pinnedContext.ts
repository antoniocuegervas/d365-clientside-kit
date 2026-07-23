import type { IViewModelContext } from "../../shared/context/IViewModelContext";
import { CdsClient } from "../../shared/data/CdsClient";
import { CdsWebApi } from "../../shared/context/WebResourceContextV8";
import { CdsEntityMetadataProvider } from "../../shared/metadata/CdsEntityMetadataProvider";
import { KitMetadataSource } from "../../shared/metadata/KitMetadataSource";
import { MetadataService } from "../../shared/metadata/MetadataService";

/**
 * Wraps a live context so its DATA CHANNEL rides a CdsClient pinned to a chosen
 * Web API version, while every host-surface member (globalContext, navigation,
 * client, device, formatting, form access, identity) delegates to the live ctx
 * untouched. The API version lab uses this to run tier 1's kit-data tests
 * against an explicit /api/data/vX.Y/ contract.
 *
 * What is pinned, and why it is pinnable through the public surface:
 *  - `webAPI`: a fresh {@link CdsWebApi} over the pinned client, the same
 *    cds-backed IWebApi the v8 adapter uses (retrieveMultiple/retrieveRecord/
 *    create/update/delete/fetch and the execute family all ride it).
 *  - `utils.getEntityMetadata`: the {@link CdsEntityMetadataProvider} synthesis
 *    over the pinned client, exactly how the v8.2 metadata lab constructs it.
 *  - `metadata` (views/currency): the kit's own {@link KitMetadataSource} takes
 *    a data-reads slice plus a CdsClient, so it is constructible over the pinned
 *    client the same way; view and currency reads are therefore pinnable, not
 *    skipped.
 *
 * The wrapper uses the live ctx as its prototype so class-instance members
 * (prototype getters like formContext, methods like getFormatting) survive; only
 * the pinned members are own overrides. Host-surface and version-explicit tests
 * are skipped in pinned mode by the runner, so this only needs the pinned data
 * reads to be honest.
 */
export function createPinnedContext(
  ctx: IViewModelContext,
  apiVersion: string
): IViewModelContext {
  const client = new CdsClient({ clientUrl: ctx.clientUrl, apiVersion });
  const webAPI = new CdsWebApi(client);
  const provider = new CdsEntityMetadataProvider(client);
  const metadata = new MetadataService(
    new KitMetadataSource({ dataReads: webAPI, client }),
    [provider]
  );
  return Object.assign(Object.create(ctx) as IViewModelContext, {
    webAPI,
    metadata,
    utils: {
      ...ctx.utils,
      getEntityMetadata: (entityName: string, attributes?: string[]) =>
        provider.getEntityMetadata(entityName, attributes),
    },
  });
}
