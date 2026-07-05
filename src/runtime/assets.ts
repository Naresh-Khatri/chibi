import type { ChibiAsset } from "./schema";

/**
 * Resolves an asset record to a loadable URL. The editor resolves from
 * IndexedDB; the runtime resolves from a bundled zip or a host-provided
 * callback. All rendering code goes through this interface.
 */
export interface AssetResolver {
  resolve(asset: ChibiAsset): Promise<string>;
}
