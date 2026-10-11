import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { createDocument } from "../schema";
import { SceneNodes } from "./nodeOverrides";

function setup() {
  const doc = createDocument();
  const id = doc.root[0];
  const object = new Group();
  const registry = new Map([[id, object]]);
  const invalidate = vi.fn();
  return { doc, id, object, registry, invalidate, nodes: new SceneNodes(doc, registry, invalidate) };
}

describe("host node overrides", () => {
  it("coalesces host writes into one follow-up frame and then returns to idle", () => {
    const { nodes, id } = setup();
    expect(nodes.consumeHostChange()).toBe(false);
    nodes.setTransform(id, { position: [1, 2, 3] });
    nodes.setVisible(id, false);
    nodes.clear(id);
    expect(nodes.consumeHostChange()).toBe(true);
    expect(nodes.consumeHostChange()).toBe(false);
  });

  it("keeps requesting a follow-up frame throughout an external animation", () => {
    const { nodes, id } = setup();
    for (let frame = 0; frame < 150; frame++) {
      nodes.setTransform(id, { rotation: [0, frame / 75, 0] });
      expect(nodes.consumeHostChange()).toBe(true);
    }
    expect(nodes.consumeHostChange()).toBe(false);
  });

  it("does not keep rendering for engine samples, late mounts, or rejected writes", () => {
    const { nodes, id } = setup();
    nodes.sample(id, "transform.position", [1, 2, 3]);
    nodes.apply(id);
    nodes.setVisible("missing", false);
    nodes.clear("missing");
    nodes.setTransform("missing", {});
    expect(() => nodes.setTransform(id, { position: [NaN, 0, 0] })).toThrow();
    expect(nodes.consumeHostChange()).toBe(false);
  });

  it("does not wake another mounted scene", () => {
    const a = setup();
    const b = setup();
    a.nodes.setVisible(a.id, false);
    expect(b.nodes.consumeHostChange()).toBe(false);
    expect(a.nodes.consumeHostChange()).toBe(true);
  });

  it("keeps host transforms while engine samples advance and restores the latest sample on clear", () => {
    const { nodes, id, object, doc, invalidate } = setup();
    const original = structuredClone(doc);
    nodes.setTransform(id, { position: [4, 5, 6] });
    nodes.sample(id, "transform.position", [7, 8, 9]);
    nodes.sample(id, "transform.scale", [2, 2, 2]);
    expect(object.position.toArray()).toEqual([4, 5, 6]);
    expect(object.scale.toArray()).toEqual([2, 2, 2]);
    nodes.clear(id);
    expect(object.position.toArray()).toEqual([7, 8, 9]);
    expect(doc).toEqual(original);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("copies inputs, merges partial patches, and applies overrides to late mounts", () => {
    const { nodes, id, object, registry } = setup();
    registry.delete(id);
    const position: [number, number, number] = [1, 2, 3];
    nodes.setTransform(id, { position });
    position[0] = 100;
    nodes.setTransform(id, { scale: [3, 3, 3] });
    nodes.setVisible(id, false);
    registry.set(id, object);
    nodes.apply(id);
    expect(object.position.toArray()).toEqual([1, 2, 3]);
    expect(object.scale.toArray()).toEqual([3, 3, 3]);
    expect(object.visible).toBe(false);
  });

  it("rejects invalid transforms atomically and ignores unknown nodes", () => {
    const { nodes, id, object } = setup();
    expect(nodes.setTransform("missing", { position: [1, 2, 3] })).toBe(false);
    expect(() => nodes.setTransform(id, { position: [1, 2, 3], scale: [NaN, 1, 1] })).toThrow(TypeError);
    expect(object.position.toArray()).toEqual([0, 0, 0]);
  });

  it("keeps mounted instances independent", () => {
    const a = setup();
    const b = new SceneNodes(a.doc, new Map([[a.id, new Group()]]), vi.fn());
    b.setTransform(a.id, { position: [10, 0, 0] });
    a.nodes.apply(a.id);
    expect(a.object.position.toArray()).toEqual(a.doc.nodes[a.id].transform.position);
  });
});
