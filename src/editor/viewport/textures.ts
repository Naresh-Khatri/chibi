import { NoColorSpace, SRGBColorSpace, TextureLoader, type Texture } from "three";
import type { ChibiAsset } from "@/runtime/schema";
import { assetUrl } from "../store/assets";

type CacheEntry = { texture?: Texture; promise: Promise<Texture> };

const cache = new Map<string, CacheEntry>();
const loader = new TextureLoader();

export function loadTexture(asset: ChibiAsset, srgb: boolean): CacheEntry {
  const key = `${asset.hash}:${srgb ? "srgb" : "linear"}`;
  let entry = cache.get(key);
  if (!entry) {
    const newEntry: CacheEntry = {
      promise: assetUrl(asset)
        .then((url) => loader.loadAsync(url))
        .then((texture) => {
          texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
          newEntry.texture = texture;
          return texture;
        }),
    };
    entry = newEntry;
    cache.set(key, entry);
  }
  return entry;
}
