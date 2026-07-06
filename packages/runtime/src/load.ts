import { validateDocument, type ChibiDocument } from "./schema";
import { missingAssetResolver, type ResolveAssetUrl } from "./assets";

export type LoadedScene = {
  doc: ChibiDocument;
  /** resolves bundled zip assets to blob URLs; rejects with a clear error for bare-JSON documents that reference assets */
  resolveAsset: ResolveAssetUrl;
  /** revoke created blob URLs when the scene is discarded */
  dispose: () => void;
};

/**
 * Load a `.chibi.json` / `.chibi.zip` scene from a URL or raw bytes.
 * Zip layout matches the editor export: `document.json` + `assets/<hash>`.
 * jszip is imported lazily so JSON-only hosts never pay for it.
 */
export async function loadDocument(
  src: string | ArrayBuffer | Uint8Array | Blob,
): Promise<LoadedScene> {
  const bytes = await toBytes(src);
  if (isZip(bytes)) return loadZip(bytes);
  const doc = validateDocument(JSON.parse(new TextDecoder().decode(bytes)));
  return {
    doc,
    resolveAsset: missingAssetResolver(
      "document was loaded from bare JSON; pass resolveAsset or use a .chibi.zip",
    ),
    dispose: () => {},
  };
}

async function toBytes(
  src: string | ArrayBuffer | Uint8Array | Blob,
): Promise<Uint8Array> {
  if (typeof src === "string") {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`chibi: failed to fetch scene "${src}" (${res.status})`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  if (src instanceof Uint8Array) return src;
  if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
  return new Uint8Array(src);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
}

async function loadZip(bytes: Uint8Array): Promise<LoadedScene> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("document.json");
  if (!entry) throw new Error("chibi: not a chibi export — document.json missing");
  const doc = validateDocument(JSON.parse(await entry.async("string")));

  const urls = new Map<string, string>(); // hash -> blob URL
  const resolveAsset: ResolveAssetUrl = async (asset) => {
    const cached = urls.get(asset.hash);
    if (cached) return cached;
    const data = zip.file(`assets/${asset.hash}`);
    if (!data) {
      throw new Error(`chibi: asset "${asset.name}" missing from zip`);
    }
    const url = URL.createObjectURL(await data.async("blob"));
    urls.set(asset.hash, url);
    return url;
  };
  return {
    doc,
    resolveAsset,
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
