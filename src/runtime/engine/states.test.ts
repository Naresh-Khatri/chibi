import { describe, expect, it } from "vitest";
import { BASE_STATE_ID, createDocument, newId } from "../schema";
import type { ChibiDocument, Interaction, MeshNode, Vec3 } from "../schema";
import { makeTargetKey } from "./sampler";
import { getBaseValue, resolveStateValues, resolveValue, stateManagedKeys } from "./state";
import { createTransition } from "./transition";
import { InteractionRuntime, interactiveNodeIds } from "./interactions";

const HOVER = "st_hover";

function docWithState(): { doc: ChibiDocument; cubeId: string } {
  const doc = createDocument("Test");
  const cubeId = doc.root[0];
  const cube = doc.nodes[cubeId] as MeshNode;
  doc.states[HOVER] = {
    id: HOVER,
    name: "Hover",
    overrides: {
      [cubeId]: { "transform.scale": [2, 2, 2] },
      [cube.materialId]: { color: "#ff0000" },
    },
  };
  return { doc, cubeId };
}

describe("state resolution", () => {
  it("reads base values for nodes and materials", () => {
    const { doc, cubeId } = docWithState();
    expect(getBaseValue(doc, cubeId, "transform.scale")).toEqual([1, 1, 1]);
    expect(getBaseValue(doc, cubeId, "visible")).toBe(true);
    expect(getBaseValue(doc, "mt_default", "opacity")).toBe(1);
    expect(getBaseValue(doc, cubeId, "nope")).toBeUndefined();
    expect(getBaseValue(doc, "missing", "color")).toBeUndefined();
  });

  it("resolveValue prefers the state's override and falls back to base", () => {
    const { doc, cubeId } = docWithState();
    expect(resolveValue(doc, HOVER, cubeId, "transform.scale")).toEqual([2, 2, 2]);
    expect(resolveValue(doc, HOVER, cubeId, "transform.position")).toEqual([
      0, 0.5, 0,
    ]);
    expect(resolveValue(doc, BASE_STATE_ID, cubeId, "transform.scale")).toEqual([
      1, 1, 1,
    ]);
  });

  it("stateManagedKeys is the union of overridden keys across all states", () => {
    const { doc, cubeId } = docWithState();
    const keys = stateManagedKeys(doc);
    expect(keys).toEqual(
      new Set([
        makeTargetKey(cubeId, "transform.scale"),
        makeTargetKey("mt_default", "color"),
      ]),
    );
  });

  it("resolveStateValues covers every managed key, base state included", () => {
    const { doc, cubeId } = docWithState();
    const base = resolveStateValues(doc, BASE_STATE_ID);
    expect(base.get(makeTargetKey(cubeId, "transform.scale"))).toEqual([1, 1, 1]);
    expect(base.get(makeTargetKey("mt_default", "color"))).toBe("#b8b8c4");
    const hover = resolveStateValues(doc, HOVER);
    expect(hover.get(makeTargetKey(cubeId, "transform.scale"))).toEqual([2, 2, 2]);
    expect(hover.get(makeTargetKey("mt_default", "color"))).toBe("#ff0000");
  });
});

describe("createTransition", () => {
  it("tweens from -> to and finishes exactly on the target values", () => {
    const from = new Map([["nd_x:opacity" as const, 0]]);
    const to = new Map([["nd_x:opacity" as const, 1]]);
    const tr = createTransition(from, to, 1, "linear");
    expect(tr.advance(0.5).get("nd_x:opacity")).toBeCloseTo(0.5, 10);
    expect(tr.done).toBe(false);
    expect(tr.advance(0.5).get("nd_x:opacity")).toBe(1);
    expect(tr.done).toBe(true);
  });

  it("zero duration completes immediately", () => {
    const tr = createTransition(new Map(), new Map([["k", 5]]), 0, "easeOut");
    expect(tr.advance(0).get("k")).toBe(5);
    expect(tr.done).toBe(true);
  });

  it("holds booleans until completion, then flips", () => {
    const tr = createTransition(
      new Map([["k", true]]),
      new Map([["k", false]]),
      1,
      "linear",
    );
    expect(tr.advance(0.9).get("k")).toBe(true);
    expect(tr.advance(0.2).get("k")).toBe(false);
  });

  it("keys missing from `from` snap to their target value", () => {
    const tr = createTransition(new Map(), new Map([["k", 10]]), 1, "linear");
    expect(tr.advance(0.1).get("k")).toBe(10);
  });
});

describe("InteractionRuntime", () => {
  function interactiveDoc() {
    const { doc, cubeId } = docWithState();
    const mk = (trigger: Interaction["trigger"], action: Interaction["action"]) =>
      ({ id: newId("ix"), trigger, action }) as Interaction;
    doc.interactions = [
      mk(
        { type: "hoverEnter", nodeId: cubeId },
        { type: "transition", to: HOVER, duration: 1, ease: "linear" },
      ),
      mk(
        { type: "hoverExit", nodeId: cubeId },
        { type: "transition", to: BASE_STATE_ID, duration: 1, ease: "linear" },
      ),
    ];
    return { doc, cubeId, scaleKey: makeTargetKey(cubeId, "transform.scale") };
  }

  it("transitions toward a state on a pointer trigger", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    const rt = new InteractionRuntime(doc);
    expect(rt.pointer("hoverEnter", cubeId)).toBe(true);
    expect(rt.pointer("click", cubeId)).toBe(false);
    const mid = rt.advance(0.5).get(scaleKey) as Vec3;
    expect(mid[0]).toBeCloseTo(1.5, 10);
    rt.advance(0.5);
    expect(rt.advance(0).get(scaleKey)).toEqual([2, 2, 2]);
    expect(rt.currentStateId).toBe(HOVER);
  });

  it("interrupting a transition tweens from the in-flight values", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    const rt = new InteractionRuntime(doc);
    rt.pointer("hoverEnter", cubeId);
    rt.advance(0.5); // halfway to scale 2 → 1.5
    rt.pointer("hoverExit", cubeId); // back to base from 1.5, not from 2
    const value = rt.advance(0.5).get(scaleKey) as Vec3;
    expect(value[0]).toBeCloseTo(1.25, 10);
    rt.advance(0.5);
    expect(rt.advance(0).get(scaleKey)).toEqual([1, 1, 1]);
  });

  it("start triggers fire on start()", () => {
    const { doc, scaleKey } = interactiveDoc();
    doc.interactions.push({
      id: newId("ix"),
      trigger: { type: "start" },
      action: { type: "transition", to: HOVER, duration: 0, ease: "linear" },
    });
    const rt = new InteractionRuntime(doc);
    rt.start();
    expect(rt.advance(0).get(scaleKey)).toEqual([2, 2, 2]);
  });

  it("toggleStates flips between the pair based on the current state", () => {
    const { doc, cubeId } = interactiveDoc();
    doc.interactions = [
      {
        id: newId("ix"),
        trigger: { type: "click", nodeId: cubeId },
        action: {
          type: "toggleStates",
          a: BASE_STATE_ID,
          b: HOVER,
          duration: 0,
          ease: "linear",
        },
      },
    ];
    const rt = new InteractionRuntime(doc);
    rt.pointer("click", cubeId);
    expect(rt.currentStateId).toBe(HOVER);
    rt.pointer("click", cubeId);
    expect(rt.currentStateId).toBe(BASE_STATE_ID);
  });

  it("playAnimation layers clip samples over state values and restarts on retrigger", () => {
    const { doc, cubeId } = interactiveDoc();
    const posKey = makeTargetKey(cubeId, "transform.position");
    doc.animations["an_float"] = {
      id: "an_float",
      name: "Float",
      duration: 2,
      loop: false,
      tracks: [
        {
          targetId: cubeId,
          property: "transform.position",
          keyframes: [
            { t: 0, v: [0, 0, 0], ease: "linear" },
            { t: 2, v: [0, 2, 0] },
          ],
        },
      ],
    };
    doc.interactions = [
      {
        id: newId("ix"),
        trigger: { type: "click", nodeId: cubeId },
        action: { type: "playAnimation", animationId: "an_float" },
      },
    ];
    const rt = new InteractionRuntime(doc);
    rt.pointer("click", cubeId);
    expect((rt.advance(1).get(posKey) as Vec3)[1]).toBeCloseTo(1, 10);
    rt.pointer("click", cubeId); // restart
    expect((rt.advance(0.5).get(posKey) as Vec3)[1]).toBeCloseTo(0.5, 10);
  });
});

describe("interactiveNodeIds", () => {
  it("splits click and hover targets, ignoring start triggers", () => {
    const { doc, cubeId } = docWithState();
    doc.interactions = [
      {
        id: newId("ix"),
        trigger: { type: "click", nodeId: cubeId },
        action: { type: "playAnimation", animationId: "an_x" },
      },
      {
        id: newId("ix"),
        trigger: { type: "hoverEnter", nodeId: "nd_other" },
        action: { type: "transition", to: HOVER, duration: 1, ease: "linear" },
      },
      {
        id: newId("ix"),
        trigger: { type: "start" },
        action: { type: "transition", to: HOVER, duration: 1, ease: "linear" },
      },
    ];
    const { click, hover } = interactiveNodeIds(doc);
    expect(click).toEqual(new Set([cubeId]));
    expect(hover).toEqual(new Set(["nd_other"]));
  });
});
