import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { loadDocument } from "./load";
import { createDocument, newId } from "./schema";

function encode(doc: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(doc));
}

describe("loadDocument", () => {
  it("loads a bare JSON document from bytes", async () => {
    const doc = createDocument("Json scene");
    const loaded = await loadDocument(encode(doc));
    expect(loaded.doc).toEqual(doc);
    await expect(
      loaded.resolveAsset({
        id: "as_x",
        kind: "texture",
        name: "tex.png",
        hash: "h1",
        size: 3,
      }),
    ).rejects.toThrow(/resolveAsset/);
  });

  it("loads a zip export and resolves bundled assets to blob URLs", async () => {
    const doc = createDocument("Zip scene");
    const assetId = newId("as");
    doc.assets[assetId] = {
      id: assetId,
      kind: "texture",
      name: "tex.png",
      hash: "abc123",
      size: 3,
    };
    const zip = new JSZip();
    zip.file("document.json", JSON.stringify(doc));
    zip.folder("assets")!.file("abc123", new Uint8Array([1, 2, 3]));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const loaded = await loadDocument(bytes);
    expect(loaded.doc).toEqual(doc);
    const url = await loaded.resolveAsset(doc.assets[assetId]);
    expect(url).toMatch(/^blob:/);
    // cached: same URL on the second resolve
    expect(await loaded.resolveAsset(doc.assets[assetId])).toBe(url);
    loaded.dispose();
  });

  it("rejects a zip without document.json", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "nope");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(loadDocument(bytes)).rejects.toThrow(/document\.json/);
  });

  it("rejects an invalid document with a zod error", async () => {
    await expect(loadDocument(encode({ chibi: 99 }))).rejects.toThrow();
  });
});
