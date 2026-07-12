import { beforeEach, describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  createDocument,
  DEFAULT_MATERIAL_ID,
  type ChibiDocument,
  type MeshNode,
  type Transform,
  type Vec3,
} from "@/runtime/schema";
import { useDoc } from "./document";
import { useUI } from "./ui";
import {
  duplicateNodes,
  groupNodes,
  removeNodes,
  setTransforms,
  topMostIds,
} from "./commands";

function mesh(id: string, transform?: Partial<Transform>, children: string[] = []): MeshNode {
  return {
    id,
    name: id,
    type: "mesh",
    geometry: { kind: "box", params: { width: 1, height: 1, depth: 1 } },
    materialId: DEFAULT_MATERIAL_ID,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      ...transform,
    },
    visible: true,
    castShadow: true,
    receiveShadow: true,
    children,
  };
}

/*
 * scene:
 *   nd_a            (root)
 *   nd_parent       (root)
 *     nd_child
 *   nd_b            (root)
 */
function loadScene() {
  const doc = createDocument("test");
  const nodes = [
    mesh("nd_a", { position: [1, 0, 0] }),
    mesh("nd_parent", { position: [0, 2, 0], rotation: [0, Math.PI / 2, 0] }, ["nd_child"]),
    mesh("nd_child", { position: [3, 0, 0] }),
    mesh("nd_b", { position: [0, 0, 5] }),
  ];
  for (const n of nodes) doc.nodes[n.id] = n;
  doc.root = ["nd_a", "nd_parent", "nd_b"];
  useDoc.getState().loadDocument("doc_test", doc);
  useUI.getState().select(null);
  useUI.getState().setActiveState("base");
}

function doc(): ChibiDocument {
  return useDoc.getState().doc!;
}

function worldPos(d: ChibiDocument, id: string): Vector3 {
  const chain: string[] = [];
  for (let cur: string | undefined = id; cur; ) {
    chain.unshift(cur);
    cur = Object.values(d.nodes).find((n) => n.children.includes(cur!))?.id;
  }
  const m = new Matrix4();
  for (const nid of chain) {
    const t = d.nodes[nid].transform;
    m.multiply(
      new Matrix4().compose(
        new Vector3(...t.position),
        new Quaternion().setFromEuler(new Euler(...t.rotation, "XYZ")),
        new Vector3(...t.scale),
      ),
    );
  }
  return new Vector3().setFromMatrixPosition(m);
}

beforeEach(loadScene);

describe("topMostIds", () => {
  it("drops descendants of other selected nodes, dedupes, ignores unknown ids", () => {
    expect(topMostIds(doc(), ["nd_child", "nd_parent", "nd_parent", "nd_a", "nd_ghost"])).toEqual(
      ["nd_child", "nd_parent", "nd_a"].filter((id) => id !== "nd_child"),
    );
  });
});

describe("removeNodes", () => {
  it("removes several nodes (and their subtrees) in one undo entry", () => {
    removeNodes(["nd_a", "nd_parent"]);
    expect(doc().nodes["nd_a"]).toBeUndefined();
    expect(doc().nodes["nd_child"]).toBeUndefined();
    expect(doc().root).toEqual(["nd_b"]);
    expect(useDoc.getState().undoStack).toHaveLength(1);
    useDoc.getState().undo();
    expect(doc().root).toEqual(["nd_a", "nd_parent", "nd_b"]);
  });

  it("prunes removed nodes from the selection", () => {
    useUI.getState().selectMany(["nd_a", "nd_b"]);
    removeNodes(["nd_a"]);
    expect(useUI.getState().selectedIds).toEqual(["nd_b"]);
  });
});

describe("duplicateNodes", () => {
  it("clones each top-most node once and selects the clones", () => {
    const countBefore = Object.keys(doc().nodes).length;
    const clones = duplicateNodes(["nd_a", "nd_child", "nd_parent"]);
    expect(clones).toHaveLength(2);
    expect(useDoc.getState().undoStack).toHaveLength(1);
    expect(useUI.getState().selectedIds).toEqual(clones);
    // subtree cloned exactly once
    const parentClone = doc().nodes[clones[1]];
    expect(parentClone.children).toHaveLength(1);
    // nd_a clone + nd_parent clone + its nd_child clone = 3 new nodes
    expect(Object.keys(doc().nodes)).toHaveLength(countBefore + 3);
  });
});

describe("setTransforms", () => {
  it("writes every node in one undo entry", () => {
    const t = (p: Vec3): Transform => ({ position: p, rotation: [0, 0, 0], scale: [1, 1, 1] });
    setTransforms([
      { nodeId: "nd_a", t: t([9, 0, 0]) },
      { nodeId: "nd_b", t: t([0, 9, 0]) },
    ]);
    expect(doc().nodes["nd_a"].transform.position).toEqual([9, 0, 0]);
    expect(doc().nodes["nd_b"].transform.position).toEqual([0, 9, 0]);
    expect(useDoc.getState().undoStack).toHaveLength(1);
  });
});

describe("groupNodes", () => {
  it("wraps top-most nodes in a group at the selection centroid without moving them", () => {
    const before = ["nd_a", "nd_child", "nd_b"].map((id) => worldPos(doc(), id));
    const groupId = groupNodes(["nd_a", "nd_b"]);
    expect(groupId).not.toBeNull();
    const group = doc().nodes[groupId!];
    expect(group.children).toEqual(["nd_a", "nd_b"]);
    // group replaces the first member's slot at root
    expect(doc().root).toEqual([groupId, "nd_parent"]);
    // centroid of (1,0,0) and (0,0,5)
    expect(group.transform.position).toEqual([0.5, 0, 2.5]);
    const after = ["nd_a", "nd_child", "nd_b"].map((id) => worldPos(doc(), id));
    before.forEach((b, i) => {
      expect(after[i].distanceTo(b)).toBeLessThan(1e-9);
    });
  });

  it("preserves world transforms when members sit under a rotated parent", () => {
    const before = worldPos(doc(), "nd_child");
    groupNodes(["nd_child", "nd_a"]);
    const after = worldPos(doc(), "nd_child");
    expect(after.distanceTo(before)).toBeLessThan(1e-9);
  });
});
