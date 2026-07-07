import JSZip from "jszip";
import { validateDocument, type ChibiDocument } from "@/runtime/schema";
import { useDoc } from "./document";
import { getAssetBlob, storeAssetBlob } from "./assets";
import { useUI } from "./ui";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function fileBase(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "-").toLowerCase() || "scene";
}

export async function exportCurrentDocument(format: "json" | "zip") {
  const doc = useDoc.getState().doc;
  if (!doc) return;
  const base = fileBase(doc.name);

  if (format === "json") {
    if (Object.keys(doc.assets).length > 0) {
      useUI
        .getState()
        .showToast("Scene references assets — use Export .chibi.zip instead");
      return;
    }
    downloadBlob(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
      `${base}.chibi.json`,
    );
    return;
  }

  const zip = new JSZip();
  zip.file("document.json", JSON.stringify(doc, null, 2));
  const assetsFolder = zip.folder("assets")!;
  for (const asset of Object.values(doc.assets)) {
    const blob = await getAssetBlob(asset.hash);
    if (blob) {
      assetsFolder.file(asset.hash, blob);
    } else {
      useUI
        .getState()
        .showToast(`Missing data for "${asset.name}" — exported without it`);
    }
  }
  downloadBlob(
    await zip.generateAsync({ type: "blob" }),
    `${base}.chibi.zip`,
  );
}

/** Parses a .chibi.json / .chibi.zip file and stores any bundled assets. */
export async function importDocumentFromFile(
  file: File,
): Promise<ChibiDocument> {
  if (file.name.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file("document.json");
    if (!entry) throw new Error("Not a chibi export — document.json missing");
    const doc = validateDocument(JSON.parse(await entry.async("string")));
    for (const asset of Object.values(doc.assets)) {
      const data = zip.file(`assets/${asset.hash}`);
      if (data) await storeAssetBlob(asset.hash, await data.async("blob"));
    }
    return doc;
  }
  return validateDocument(JSON.parse(await file.text()));
}
