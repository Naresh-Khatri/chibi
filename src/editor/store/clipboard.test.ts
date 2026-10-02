import { beforeEach, describe, expect, it } from "vitest";
import {
  createDocument,
  createMaterial,
  DEFAULT_MATERIAL_ID,
  type ChibiDocument,
  type MeshNode,
  type ModelNode,
  type Transform,
} from "@/runtime/schema";
import { useDoc } from "./document";
import { useUI } from "./ui";
import {
  buildClipboard,
  copySelection,
  cutSelection,
  parseClipboard,
  pasteClipboard,
  pasteFromText,
  serializeClipboard,
} from "./clipboard";

function mesh(id: string, transform: Partial<Transform> = {}, children: string[] = [], materialId = DEFAULT_MATERIAL_ID): MeshNode {
  return {
    id,
    name: id,
    type: "mesh",
    geometry: { kind: "box", params: { width: 1, height: 1, depth: 1 } },
    materialId,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...transform },
    visible: true,
    castShadow: true,
    receiveShadow: true,
    children,
  };
}

/*
 *   nd_parent (pos 0,2,0)
 *     nd_child (pos 3,0,0, red material)
 *   nd_model (glb asset)
 */
function sourceDoc(): ChibiDocument {
  const doc = createDocument("source");
  const red = { ...createMaterial("mt_red", "Red"), color: "#ff0000" };
  red.maps.map = "as_tex";
  doc.materials[red.id] = red;
  doc.assets.as_tex = { id: "as_tex", kind: "texture", name: "t.png", hash: "h_tex", size: 10 };
  doc.assets.as_glb = { id: "as_glb", kind: "glb", name: "m.glb", hash: "h_glb", size: 20 };
  const model: ModelNode = {
    id: "nd_model",
    name: "Model",
    type: "model",
    assetId: "as_glb",
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    children: [],
    castShadow: true,
    receiveShadow: true,
  };
  for (const n of [
    mesh("nd_parent", { position: [0, 2, 0] }, ["nd_child"]),
    mesh("nd_child", { position: [3, 0, 0] }, [], "mt_red"),
    model,
  ]) {
    doc.nodes[n.id] = n;
  }
  doc.root = ["nd_parent", "nd_model"];
  return doc;
}

function load(id: string, doc: ChibiDocument) {
  useDoc.getState().loadDocument(id, doc);
  useUI.getState().select(null);
  useUI.getState().setActiveState("base");
}

const doc = () => useDoc.getState().doc!;

describe("clipboard", () => {
  beforeEach(() => load("doc_src", sourceDoc()));

  it("bakes world transform into copied roots, collects materials + assets", () => {
    const payload = buildClipboard(doc(), "doc_src", ["nd_child", "nd_model"])!;
    expect(payload.roots).toEqual(["nd_child", "nd_model"]);
    expect(payload.nodes.nd_child.transform.position).toEqual([3, 2, 0]);
    expect(Object.keys(payload.materials)).toEqual(["mt_red"]);
    expect(Object.keys(payload.assets).sort()).toEqual(["as_glb", "as_tex"]);
  });

  it("round-trips through text and rejects foreign text", () => {
    const payload = buildClipboard(doc(), "doc_src", ["nd_parent"])!;
    // json drops -0 -> compare against the parsed form
    expect(parseClipboard(serializeClipboard(payload))).toEqual(JSON.parse(serializeClipboard(payload)));
    expect(parseClipboard("hello")).toBeNull();
    expect(parseClipboard('{"chibiClipboard":1}')).toBeNull();
  });

  it("pastes into the same doc with fresh ids, reusing materials", () => {
    const payload = buildClipboard(doc(), "doc_src", ["nd_parent"])!;
    const [rootId] = pasteClipboard(payload);
    const d = doc();
    expect(d.root).toEqual(["nd_parent", "nd_model", rootId]);
    const root = d.nodes[rootId];
    expect(root.name).toBe("nd_parent 2");
    expect(root.children).toHaveLength(1);
    const child = d.nodes[root.children[0]] as MeshNode;
    expect(child.id).not.toBe("nd_child");
    expect(child.materialId).toBe("mt_red");
    expect(Object.keys(d.materials)).toHaveLength(2);
    expect(useUI.getState().selectedIds).toEqual([rootId]);
  });

  it("pastes into another doc, carrying materials + assets over", () => {
    const payload = buildClipboard(doc(), "doc_src", ["nd_child", "nd_model"])!;
    const target = createDocument("target");
    target.assets.as_other = { id: "as_other", kind: "glb", name: "same.glb", hash: "h_glb", size: 20 };
    load("doc_target", target);

    const [childId, modelId] = pasteClipboard(payload);
    const d = doc();
    const child = d.nodes[childId] as MeshNode;
    expect(child.transform.position).toEqual([3, 2, 0]);
    expect(child.materialId).not.toBe(DEFAULT_MATERIAL_ID);
    const material = d.materials[child.materialId];
    expect(material.color).toBe("#ff0000");
    expect(d.assets[material.maps.map!].hash).toBe("h_tex");
    // same glb already imported -> dedup by hash
    expect((d.nodes[modelId] as ModelNode).assetId).toBe("as_other");
    expect(Object.keys(d.assets)).toHaveLength(2);

    // second paste reuses the now-identical material
    pasteClipboard(payload);
    expect(Object.keys(doc().materials)).toHaveLength(2);
  });

  it("cut removes the selection; paste restores it from memory", () => {
    useUI.getState().select("nd_parent");
    expect(cutSelection()).toContain("chibiClipboard");
    expect(doc().nodes.nd_parent).toBeUndefined();
    const [rootId] = pasteFromText(undefined);
    expect(doc().nodes[rootId].name).toBe("nd_parent");
    expect(doc().nodes[rootId].children).toHaveLength(1);
  });

  it("copy with nothing selected is a no-op; paste blocked outside base", () => {
    expect(copySelection()).toBeNull();
    const payload = buildClipboard(doc(), "doc_src", ["nd_model"])!;
    useUI.getState().setActiveState("st_x");
    expect(pasteClipboard(payload)).toEqual([]);
  });
});
