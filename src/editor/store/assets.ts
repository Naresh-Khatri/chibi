import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from "idb-keyval";
import { newId, type ChibiAsset } from "@/runtime/schema";
import { useDoc } from "./document";

export const MAX_ASSET_BYTES = 100 * 1024 * 1024;
export const WARN_ASSET_BYTES = 25 * 1024 * 1024;

const assetKey = (hash: string) => `asset:${hash}`;

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stores the file blob (content-hash deduped) and adds an asset record to
 * the document. Re-importing identical bytes reuses the existing record.
 */
export async function importAssetFile(
  file: File,
  kind: ChibiAsset["kind"],
): Promise<ChibiAsset> {
  const hash = await sha256(file);
  const doc = useDoc.getState().doc;
  const existing = doc
    ? Object.values(doc.assets).find((a) => a.hash === hash && a.kind === kind)
    : undefined;
  if (existing) return existing;

  await idbSet(assetKey(hash), file);
  const asset: ChibiAsset = {
    id: newId("as"),
    kind,
    name: file.name,
    hash,
    size: file.size,
  };
  useDoc.getState().dispatch("Import asset", (d) => {
    d.assets[asset.id] = asset;
  });
  return asset;
}

export async function storeAssetBlob(hash: string, blob: Blob) {
  await idbSet(assetKey(hash), blob);
}

export async function getAssetBlob(hash: string): Promise<Blob | undefined> {
  return idbGet(assetKey(hash));
}

const urlCache = new Map<string, Promise<string>>();

export function assetUrl(asset: ChibiAsset): Promise<string> {
  let promise = urlCache.get(asset.hash);
  if (!promise) {
    promise = getAssetBlob(asset.hash).then((blob) => {
      if (!blob) throw new Error(`asset data missing for "${asset.name}"`);
      return URL.createObjectURL(blob);
    });
    urlCache.set(asset.hash, promise);
  }
  return promise;
}

/** Deletes stored asset blobs whose hash is not in the referenced set. */
export async function gcAssetBlobs(referencedHashes: Set<string>) {
  const allKeys = await idbKeys();
  await Promise.all(
    allKeys
      .filter(
        (k) =>
          typeof k === "string" &&
          k.startsWith("asset:") &&
          !referencedHashes.has(k.slice("asset:".length)),
      )
      .map((k) => idbDel(k)),
  );
}
