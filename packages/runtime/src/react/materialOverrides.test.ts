import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument, type ChibiDocument } from "../schema";
import { loadOverrideTexture, resolveMaterialIds } from "./materialOverrides";

function docWith(materials: { id: string; name: string }[]): ChibiDocument {
  const doc = createDocument();
  const base = Object.values(doc.materials)[0];
  for (const m of materials) doc.materials[m.id] = { ...base, ...m };
  return doc;
}

describe("resolveMaterialIds", () => {
  const doc = docWith([
    { id: "mt_a", name: "key:1" },
    { id: "mt_b", name: "accent" },
    { id: "mt_c", name: "accent" },
  ]);

  it("matches an id", () => {
    expect(resolveMaterialIds(doc, "mt_a")).toEqual(["mt_a"]);
  });

  it("falls back to every material with that name", () => {
    expect(resolveMaterialIds(doc, "key:1")).toEqual(["mt_a"]);
    expect(resolveMaterialIds(doc, "accent")).toEqual(["mt_b", "mt_c"]);
  });

  it("returns nothing for an unknown target", () => {
    expect(resolveMaterialIds(doc, "nope")).toEqual([]);
  });
});

describe("logo texture fitting", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockImage(width: number, height: number) {
    const drawImage = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("Image", class {
      naturalWidth = width;
      naturalHeight = height;
      crossOrigin = "";
      onload?: () => void;
      set src(_value: string) { this.onload?.(); }
    });
    return { canvas, drawImage };
  }

  it.each([[400, 200, 0, 128, 512, 256], [200, 400, 128, 0, 256, 512]])(
    "contains a %i × %i SVG without distorting its aspect ratio",
    async (width, height, x, y, imageWidth, imageHeight) => {
      const { canvas, drawImage } = mockImage(width, height);
      const texture = await loadOverrideTexture("https://example.com/logo.svg", "contain");
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(512);
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), x, y, imageWidth, imageHeight);
      texture.dispose();
    },
  );

  it("contains raster logos and keeps default textures at their original size", async () => {
    const { canvas, drawImage } = mockImage(300, 100);
    const contained = await loadOverrideTexture("https://example.com/logo.png", "contain");
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 100, 300, 100);
    contained.dispose();
    const original = await loadOverrideTexture("https://example.com/logo.png");
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(100);
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 300, 100);
    original.dispose();
  });
});
