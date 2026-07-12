import { describe, expect, it } from "vitest";
import { createDocument } from "../schema";
import type { AnimationClip, ChibiDocument, Vec3 } from "../schema/types";
import { makeTargetKey } from "./sampler";
import { dampProgress, docUsesPointer, samplePointerBindings } from "./pointer";

function docWithClip(): { doc: ChibiDocument; clip: AnimationClip } {
  const doc = createDocument("Test");
  const clip: AnimationClip = {
    id: "an_drift",
    name: "Drift",
    duration: 2,
    loop: false,
    tracks: [
      {
        targetId: "nd_x",
        property: "transform.position",
        keyframes: [
          { t: 0, v: [0, 0, 0], ease: "linear" },
          { t: 2, v: [0, 2, 0] },
        ],
      },
    ],
  };
  doc.animations[clip.id] = clip;
  return { doc, clip };
}

describe("docUsesPointer", () => {
  it("is false for a plain document", () => {
    expect(docUsesPointer(createDocument("Test"))).toBe(false);
  });

  it("is true when a pointer binding is present", () => {
    const doc = createDocument("Test");
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "x",
      target: { type: "animation", animationId: "an_missing" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    expect(docUsesPointer(doc)).toBe(true);
  });

  it("is true when camera parallax is enabled", () => {
    const doc = createDocument("Test");
    doc.camera.parallax = 0.1;
    expect(docUsesPointer(doc)).toBe(true);
  });
});

describe("dampProgress", () => {
  it("approaches the target monotonically without overshoot", () => {
    let current = 0;
    let prev = current;
    for (let i = 0; i < 20; i++) {
      current = dampProgress(current, 1, 1 / 60);
      expect(current).toBeGreaterThan(prev);
      expect(current).toBeLessThanOrEqual(1);
      prev = current;
    }
  });

  it("snaps to the target when close enough", () => {
    // exponential approach alone never lands; the snap ends the demand loop
    let current = 0;
    for (let i = 0; i < 1000 && current !== 1; i++) {
      current = dampProgress(current, 1, 1 / 60);
    }
    expect(current).toBe(1);
  });

  it("is a no-op at the target", () => {
    expect(dampProgress(0.5, 0.5, 1 / 60)).toBe(0.5);
  });
});

describe("samplePointerBindings", () => {
  it("returns nothing with no bindings", () => {
    expect(samplePointerBindings(createDocument("Test"), 0.5, 0.5).size).toBe(0);
  });

  it("an x-axis binding responds to x only", () => {
    const { doc } = docWithClip();
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "x",
      target: { type: "animation", animationId: "an_drift" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    expect(samplePointerBindings(doc, 1, 0).get(key)).toEqual([0, 2, 0]);
    // y moves, x at 0 -> clip start regardless of y
    expect(samplePointerBindings(doc, 0, 1).get(key)).toEqual([0, 0, 0]);
  });

  it("a y-axis binding samples the vertical progress", () => {
    const { doc } = docWithClip();
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "y",
      target: { type: "animation", animationId: "an_drift" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    const mid = samplePointerBindings(doc, 0, 0.5).get(key) as Vec3;
    expect(mid[1]).toBeCloseTo(1, 10);
  });

  it("applies the [start,end] window like scroll bindings", () => {
    const { doc } = docWithClip();
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "x",
      target: { type: "animation", animationId: "an_drift" },
      start: 0.5,
      end: 1,
      ease: "linear",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    // below the window: clamped to u=0
    expect(samplePointerBindings(doc, 0.25, 0).get(key)).toEqual([0, 0, 0]);
    const mid = samplePointerBindings(doc, 0.75, 0).get(key) as Vec3;
    expect(mid[1]).toBeCloseTo(1, 10);
  });

  it("interpolates base -> state for a state-target binding", () => {
    const doc = createDocument("Test");
    const nodeId = doc.root[0];
    doc.states["st_up"] = {
      id: "st_up",
      nodeId,
      name: "Up",
      overrides: { [nodeId]: { "transform.position": [0, 4, 0] } },
    };
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "y",
      target: { type: "state", nodeId, stateId: "st_up" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const key = makeTargetKey(nodeId, "transform.position");
    expect(samplePointerBindings(doc, 0, 0).get(key)).toEqual([0, 0.5, 0]); // base
    expect(samplePointerBindings(doc, 0, 1).get(key)).toEqual([0, 4, 0]);
  });
});
