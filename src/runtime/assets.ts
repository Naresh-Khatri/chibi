import type { ChibiAsset } from "./schema";

/**
 * Resolves an asset record to a loadable URL. The editor resolves from
 * IndexedDB; the runtime resolves from a bundled zip or a host-provided
 * callback. All rendering code goes through this interface.
 */
export type ResolveAssetUrl = (asset: ChibiAsset) => Promise<string>;

/** default resolver when a document has assets but no source for them */
export function missingAssetResolver(reason: string): ResolveAssetUrl {
  return (asset) =>
    Promise.reject(
      new Error(`chibi: cannot resolve asset "${asset.name}" — ${reason}`),
    );
}
