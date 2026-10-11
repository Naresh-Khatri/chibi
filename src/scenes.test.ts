import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { validateDocument } from "@/runtime/schema";

// every scene document bundled in public/ must parse against the schema
const SCENES_DIR = join(__dirname, "..", "public", "scenes");

describe("bundled scene documents", () => {
  const files = readdirSync(SCENES_DIR).filter(
    (f) => f.endsWith(".chibi.json") || f.endsWith(".chibi.zip"),
  );
  it("finds bundled scenes", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(`${file} validates`, async () => {
      const bytes = readFileSync(join(SCENES_DIR, file));
      const zip = file.endsWith(".zip") ? await JSZip.loadAsync(bytes) : null;
      const text = zip
        ? await zip.file("document.json")!.async("string")
        : bytes.toString("utf8");
      const doc = validateDocument(JSON.parse(text));
      // every node/material reference must resolve
      for (const node of Object.values(doc.nodes)) {
        for (const child of node.children) {
          expect(doc.nodes[child], `child ${child} of ${node.id}`).toBeDefined();
        }
        if (node.type === "model") {
          const asset = doc.assets[node.assetId];
          expect(asset, `asset ${node.assetId} of ${node.id}`).toBeDefined();
          expect(zip?.file(`assets/${asset.hash}`), `data for ${asset.name}`).toBeTruthy();
          if (node.materialId) {
            expect(doc.materials[node.materialId], `material ${node.materialId} of ${node.id}`).toBeDefined();
          }
        }
        if (node.type === "mesh") {
          expect(
            doc.materials[node.materialId],
            `material ${node.materialId} of ${node.id}`,
          ).toBeDefined();
        }
      }
      for (const id of doc.root) {
        expect(doc.nodes[id], `root node ${id}`).toBeDefined();
      }
    });
  }
});
