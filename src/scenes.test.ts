import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocument } from "@/runtime/schema";

// every scene document bundled in public/ must parse against the schema
const SCENES_DIR = join(__dirname, "..", "public", "scenes");

describe("bundled scene documents", () => {
  const files = readdirSync(SCENES_DIR).filter((f) => f.endsWith(".json"));
  it("finds bundled scenes", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(`${file} validates`, () => {
      const raw = JSON.parse(readFileSync(join(SCENES_DIR, file), "utf8"));
      const doc = validateDocument(raw);
      // every node/material reference must resolve
      for (const node of Object.values(doc.nodes)) {
        for (const child of node.children) {
          expect(doc.nodes[child], `child ${child} of ${node.id}`).toBeDefined();
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
