import { describe, expect, it } from "vitest";
import { createDocument } from "../schema";
import type { AnimationClip, ChibiDocument, Vec3 } from "../schema/types";
import { EASING } from "./easing";
import { makeTargetKey } from "./sampler";
import {
  clampProgress,
  docUsesScroll,
  elementScrollProgress,
  sampleScrollBindings,
} from "./scroll";

describe("clampProgress", () => {
  it("clamps to [0, 1]", () => {
    expect(clampProgress(-2)).toBe(0);
    expect(clampProgress(0.5)).toBe(0.5);
    expect(clampProgress(4)).toBe(1);
  });

  it("treats NaN as 0", () => {
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe("elementScrollProgress", () => {
  it("is 0 before the element enters the viewport from below", () => {
    expect(elementScrollProgress(1000, 500, 800)).toBe(0);
  });

  it("is 0.5 once the element's top reaches the viewport top (rect height == viewport height)", () => {
    expect(elementScrollProgress(0, 800, 800)).toBe(0.5);
  });

  it("is 1 once the element has fully exited above the viewport", () => {
    expect(elementScrollProgress(-500, 500, 800)).toBe(1);
  });

  it("is degenerate-safe when viewport + rect height is zero", () => {
    expect(elementScrollProgress(0, 0, 0)).toBe(0);
  });
});

describe("docUsesScroll", () => {
  it("is false for a plain document", () => {
    expect(docUsesScroll(createDocument("Test"))).toBe(false);
  });

  it("is true when a scroll trigger is present", () => {
    const doc = createDocument("Test");
    doc.interactions.push({
      id: "ix_scroll",
      trigger: { type: "scroll", progress: 0.5 },
      action: { type: "playAnimation", animationId: "an_missing" },
    });
    expect(docUsesScroll(doc)).toBe(true);
  });

  it("is true when a scroll binding is present", () => {
    const doc = createDocument("Test");
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "animation", animationId: "an_missing" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    expect(docUsesScroll(doc)).toBe(true);
  });
});

describe("sampleScrollBindings", () => {
  function docWithClip(): { doc: ChibiDocument; clip: AnimationClip } {
    const doc = createDocument("Test");
    const clip: AnimationClip = {
      id: "an_spin",
      name: "Spin",
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

  it("returns nothing with no bindings", () => {
    expect(sampleScrollBindings(createDocument("Test"), 0.5).size).toBe(0);
  });

  it("maps global progress into the binding's [start,end] window before sampling", () => {
    const { doc } = docWithClip();
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "animation", animationId: "an_spin" },
      start: 0.2,
      end: 0.9,
      ease: "linear",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    // before the window: clamped to u=0 -> clip time 0
    expect(sampleScrollBindings(doc, 0).get(key)).toEqual([0, 0, 0]);
    // after the window: clamped to u=1 -> clip time = duration
    expect(sampleScrollBindings(doc, 1).get(key)).toEqual([0, 2, 0]);
    // halfway through the window -> u=0.5 -> clip time 1 -> midpoint value
    const mid = sampleScrollBindings(doc, 0.2 + (0.9 - 0.2) / 2).get(key) as Vec3;
    expect(mid[1]).toBeCloseTo(1, 10);
  });

  it("applies the binding's ease to local progress before sampling", () => {
    const { doc } = docWithClip();
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "animation", animationId: "an_spin" },
      start: 0,
      end: 1,
      ease: "easeIn",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    const value = sampleScrollBindings(doc, 0.5).get(key) as Vec3;
    expect(value[1]).toBeCloseTo(EASING.easeIn(0.5) * 2, 10);
  });

  it("a zero-width window snaps to 0 before end, 1 at/after end", () => {
    const { doc } = docWithClip();
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "animation", animationId: "an_spin" },
      start: 0.5,
      end: 0.5,
      ease: "linear",
    });
    const key = makeTargetKey("nd_x", "transform.position");
    expect(sampleScrollBindings(doc, 0.2).get(key)).toEqual([0, 0, 0]);
    expect(sampleScrollBindings(doc, 0.5).get(key)).toEqual([0, 2, 0]);
    expect(sampleScrollBindings(doc, 0.8).get(key)).toEqual([0, 2, 0]);
  });

  it("no-ops when the animation target is missing", () => {
    const doc = createDocument("Test");
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "animation", animationId: "an_missing" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    expect(sampleScrollBindings(doc, 0.5).size).toBe(0);
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
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "state", nodeId, stateId: "st_up" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const key = makeTargetKey(nodeId, "transform.position");
    expect(sampleScrollBindings(doc, 0).get(key)).toEqual([0, 0.5, 0]); // base
    const mid = sampleScrollBindings(doc, 0.5).get(key) as Vec3;
    expect(mid[1]).toBeCloseTo(2.25, 10);
    expect(sampleScrollBindings(doc, 1).get(key)).toEqual([0, 4, 0]);
  });

  it("no-ops when the state target's stateId doesn't belong to nodeId", () => {
    const doc = createDocument("Test");
    const nodeId = doc.root[0];
    const otherId = doc.root[1];
    doc.states["st_up"] = {
      id: "st_up",
      nodeId,
      name: "Up",
      overrides: { [nodeId]: { "transform.position": [0, 4, 0] } },
    };
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "state", nodeId: otherId, stateId: "st_up" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    expect(sampleScrollBindings(doc, 0.5).size).toBe(0);
  });

  it("layers multiple bindings, later ones winning on key collisions", () => {
    const { doc, clip } = docWithClip();
    doc.animations["an_spin2"] = { ...clip, id: "an_spin2" };
    doc.scrollBindings.push(
      {
        id: "sb_1",
        target: { type: "animation", animationId: "an_spin" },
        start: 0,
        end: 1,
        ease: "linear",
      },
      {
        id: "sb_2",
        target: { type: "animation", animationId: "an_spin2" },
        start: 0,
        end: 1,
        ease: "linear",
      },
    );
    const key = makeTargetKey("nd_x", "transform.position");
    // both bindings target the same key at progress 1 -> both resolve to the
    // clip's end value, so this just confirms the map ends up populated once
    expect(sampleScrollBindings(doc, 1).get(key)).toEqual([0, 2, 0]);
  });
});
