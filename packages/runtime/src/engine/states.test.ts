import { describe, expect, it } from "vitest";
import { BASE_STATE_ID, createDocument, newId } from "../schema";
import type { ChibiDocument, Interaction, MeshNode, Vec3 } from "../schema";
import { makeTargetKey } from "./sampler";
import {
  getBaseValue,
  nodeManagedKeys,
  resolveStateValues,
  resolveValue,
} from "./state";
import { createTransition } from "./transition";
import { InteractionRuntime, interactiveNodeIds } from "./interactions";

const HOVER = "st_hover";

function docWithState(): { doc: ChibiDocument; cubeId: string } {
  const doc = createDocument("Test");
  const cubeId = doc.root[0];
  const cube = doc.nodes[cubeId] as MeshNode;
  doc.states[HOVER] = {
    id: HOVER,
    nodeId: cubeId,
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

  it("nodeManagedKeys is the union of keys overridden by the node's states", () => {
    const { doc, cubeId } = docWithState();
    expect(nodeManagedKeys(doc, cubeId)).toEqual(
      new Set([
        makeTargetKey(cubeId, "transform.scale"),
        makeTargetKey("mt_default", "color"),
      ]),
    );
    expect(nodeManagedKeys(doc, "nd_other")).toEqual(new Set());
  });

  it("resolveStateValues covers every managed key, virtual base included", () => {
    const { doc, cubeId } = docWithState();
    const base = resolveStateValues(doc, cubeId, BASE_STATE_ID);
    expect(base.get(makeTargetKey(cubeId, "transform.scale"))).toEqual([1, 1, 1]);
    expect(base.get(makeTargetKey("mt_default", "color"))).toBe("#b8b8c4");
    const hover = resolveStateValues(doc, cubeId, HOVER);
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
        { type: "transition", nodeId: cubeId, to: HOVER, duration: 1, ease: "linear" },
      ),
      mk(
        { type: "hoverExit", nodeId: cubeId },
        {
          type: "transition",
          nodeId: cubeId,
          to: BASE_STATE_ID,
          duration: 1,
          ease: "linear",
        },
      ),
    ];
    return { doc, cubeId, scaleKey: makeTargetKey(cubeId, "transform.scale") };
  }

  it("transitions the object toward a state on a pointer trigger", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    const rt = new InteractionRuntime(doc);
    expect(rt.pointer("hoverEnter", cubeId)).toBe(true);
    expect(rt.pointer("click", cubeId)).toBe(false);
    const mid = rt.advance(0.5).get(scaleKey) as Vec3;
    expect(mid[0]).toBeCloseTo(1.5, 10);
    rt.advance(0.5);
    expect(rt.advance(0).get(scaleKey)).toEqual([2, 2, 2]);
    expect(rt.stateOf(cubeId)).toBe(HOVER);
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

  it("two objects transition independently, without resetting each other", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    const lightId = doc.root[1];
    doc.states["st_up"] = {
      id: "st_up",
      nodeId: lightId,
      name: "Up",
      overrides: { [lightId]: { "transform.position": [3, 10, 2] } },
    };
    doc.interactions.push({
      id: newId("ix"),
      trigger: { type: "click", nodeId: lightId },
      action: { type: "transition", nodeId: lightId, to: "st_up", duration: 1, ease: "linear" },
    });
    const posKey = makeTargetKey(lightId, "transform.position");

    const rt = new InteractionRuntime(doc);
    rt.pointer("hoverEnter", cubeId);
    rt.advance(0.5); // cube halfway
    rt.pointer("click", lightId); // starts the light's own tween
    const values = rt.advance(0.5);
    expect(values.get(scaleKey)).toEqual([2, 2, 2]); // cube finished undisturbed
    expect((values.get(posKey) as Vec3)[1]).toBeCloseTo(7.5, 10); // light halfway
    expect(rt.stateOf(cubeId)).toBe(HOVER);
    expect(rt.stateOf(lightId)).toBe("st_up");
  });

  it("ignores a transition whose state belongs to another object", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    const lightId = doc.root[1];
    doc.interactions = [
      {
        id: newId("ix"),
        trigger: { type: "click", nodeId: cubeId },
        action: { type: "transition", nodeId: lightId, to: HOVER, duration: 0, ease: "linear" },
      },
    ];
    const rt = new InteractionRuntime(doc);
    rt.pointer("click", cubeId);
    expect(rt.advance(0).get(scaleKey)).toEqual([1, 1, 1]);
    expect(rt.stateOf(lightId)).toBe(BASE_STATE_ID);
  });

  it("start triggers fire on start()", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    doc.interactions.push({
      id: newId("ix"),
      trigger: { type: "start" },
      action: { type: "transition", nodeId: cubeId, to: HOVER, duration: 0, ease: "linear" },
    });
    const rt = new InteractionRuntime(doc);
    rt.start();
    expect(rt.advance(0).get(scaleKey)).toEqual([2, 2, 2]);
  });

  it("toggleStates flips between the pair based on the object's current state", () => {
    const { doc, cubeId } = interactiveDoc();
    doc.interactions = [
      {
        id: newId("ix"),
        trigger: { type: "click", nodeId: cubeId },
        action: {
          type: "toggleStates",
          nodeId: cubeId,
          a: BASE_STATE_ID,
          b: HOVER,
          duration: 0,
          ease: "linear",
        },
      },
    ];
    const rt = new InteractionRuntime(doc);
    rt.pointer("click", cubeId);
    expect(rt.stateOf(cubeId)).toBe(HOVER);
    rt.pointer("click", cubeId);
    expect(rt.stateOf(cubeId)).toBe(BASE_STATE_ID);
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

  it("dispatches a scroll trigger's action exactly once crossing the threshold, either direction", () => {
    const { doc, cubeId } = interactiveDoc();
    doc.interactions.push({
      id: newId("ix"),
      trigger: { type: "scroll", progress: 0.5 },
      action: { type: "transition", nodeId: cubeId, to: HOVER, duration: 0, ease: "linear" },
    });
    const rt = new InteractionRuntime(doc);
    rt.scroll(0.2);
    expect(rt.stateOf(cubeId)).toBe(BASE_STATE_ID); // below threshold, no fire yet
    rt.scroll(0.6); // crossed upward
    expect(rt.stateOf(cubeId)).toBe(HOVER);
    rt.scroll(0.8); // still above, no re-fire (action here would be idempotent anyway)
    rt.scroll(0.4); // crossed back downward — fires again (transition to HOVER again, a no-op state-wise)
    expect(rt.stateOf(cubeId)).toBe(HOVER);
  });

  it("toggleStates on a scroll trigger flips once per crossing", () => {
    const { doc, cubeId } = interactiveDoc();
    doc.interactions.push({
      id: newId("ix"),
      trigger: { type: "scroll", progress: 0.5 },
      action: {
        type: "toggleStates",
        nodeId: cubeId,
        a: BASE_STATE_ID,
        b: HOVER,
        duration: 0,
        ease: "linear",
      },
    });
    const rt = new InteractionRuntime(doc);
    rt.scroll(0.6); // cross up -> toggles to HOVER
    expect(rt.stateOf(cubeId)).toBe(HOVER);
    rt.scroll(0.7); // no crossing, no toggle
    expect(rt.stateOf(cubeId)).toBe(HOVER);
    rt.scroll(0.3); // cross down -> toggles back
    expect(rt.stateOf(cubeId)).toBe(BASE_STATE_ID);
  });

  it("getScrollProgress reflects the last clamped value; repeat calls at the same value are no-ops", () => {
    const { doc } = interactiveDoc();
    const rt = new InteractionRuntime(doc);
    expect(rt.getScrollProgress()).toBe(0);
    rt.scroll(1.4); // clamps to 1
    expect(rt.getScrollProgress()).toBe(1);
    rt.scroll(-3); // clamps to 0
    expect(rt.getScrollProgress()).toBe(0);
  });

  it("advance() layers scroll bindings over transitions/clips on the same key", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    doc.states["st_scroll_scale"] = {
      id: "st_scroll_scale",
      nodeId: cubeId,
      name: "ScrollScale",
      overrides: { [cubeId]: { "transform.scale": [5, 5, 5] } },
    };
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "state", nodeId: cubeId, stateId: "st_scroll_scale" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const rt = new InteractionRuntime(doc);
    rt.pointer("hoverEnter", cubeId); // starts a transition toward scale [2,2,2]
    rt.scroll(1); // full scroll -> binding wants scale [5,5,5]
    const value = rt.advance(0.5).get(scaleKey);
    expect(value).toEqual([5, 5, 5]); // scroll binding wins over the in-flight transition
  });

  it("pointerMove damps toward the target; isActive() while settling, idle at rest", () => {
    const { doc, cubeId } = interactiveDoc();
    doc.states["st_ptr"] = {
      id: "st_ptr",
      nodeId: cubeId,
      name: "Ptr",
      overrides: { [cubeId]: { "transform.scale": [3, 3, 3] } },
    };
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "x",
      target: { type: "state", nodeId: cubeId, stateId: "st_ptr" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const rt = new InteractionRuntime(doc);
    expect(rt.isActive()).toBe(false); // at rest
    rt.pointerMove(1, 0.5);
    expect(rt.isActive()).toBe(true); // settling
    rt.advance(1 / 60);
    const { x } = rt.getPointer();
    expect(x).toBeGreaterThan(0.5);
    expect(x).toBeLessThan(1); // damped, not snapped
    for (let i = 0; i < 600 && rt.isActive(); i++) rt.advance(1 / 60);
    expect(rt.getPointer().x).toBe(1); // settled exactly (snap)
    expect(rt.isActive()).toBe(false);
  });

  it("pointerLeave eases back to the (0.5, 0.5) rest", () => {
    const { doc } = interactiveDoc();
    doc.camera.parallax = 0.1; // pointer feature via parallax alone
    const rt = new InteractionRuntime(doc);
    rt.pointerMove(1, 0);
    for (let i = 0; i < 600 && rt.isActive(); i++) rt.advance(1 / 60);
    rt.pointerLeave();
    expect(rt.isActive()).toBe(true);
    for (let i = 0; i < 600 && rt.isActive(); i++) rt.advance(1 / 60);
    expect(rt.getPointer()).toEqual({ x: 0.5, y: 0.5 });
  });

  it("pointer movement never activates a doc without pointer features", () => {
    const { doc } = interactiveDoc();
    const rt = new InteractionRuntime(doc);
    rt.pointerMove(1, 1);
    expect(rt.isActive()).toBe(false);
  });

  it("advance() layers pointer bindings over clips/transitions, but under scroll bindings", () => {
    const { doc, cubeId, scaleKey } = interactiveDoc();
    doc.states["st_ptr"] = {
      id: "st_ptr",
      nodeId: cubeId,
      name: "Ptr",
      overrides: { [cubeId]: { "transform.scale": [3, 3, 3] } },
    };
    doc.states["st_scroll"] = {
      id: "st_scroll",
      nodeId: cubeId,
      name: "Scroll",
      overrides: { [cubeId]: { "transform.scale": [5, 5, 5] } },
    };
    doc.pointerBindings.push({
      id: "pb_1",
      axis: "x",
      target: { type: "state", nodeId: cubeId, stateId: "st_ptr" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    const rt = new InteractionRuntime(doc);
    rt.pointer("hoverEnter", cubeId); // transition toward [2,2,2]
    rt.pointerMove(1, 0.5);
    for (let i = 0; i < 600 && rt.getPointer().x !== 1; i++) rt.advance(1 / 60);
    expect(rt.advance(0).get(scaleKey)).toEqual([3, 3, 3]); // pointer wins over transition
    doc.scrollBindings.push({
      id: "sb_1",
      target: { type: "state", nodeId: cubeId, stateId: "st_scroll" },
      start: 0,
      end: 1,
      ease: "linear",
    });
    rt.scroll(1);
    expect(rt.advance(0).get(scaleKey)).toEqual([5, 5, 5]); // scroll wins over pointer
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
        action: { type: "transition", nodeId: cubeId, to: HOVER, duration: 1, ease: "linear" },
      },
      {
        id: newId("ix"),
        trigger: { type: "start" },
        action: { type: "transition", nodeId: cubeId, to: HOVER, duration: 1, ease: "linear" },
      },
    ];
    const { click, hover } = interactiveNodeIds(doc);
    expect(click).toEqual(new Set([cubeId]));
    expect(hover).toEqual(new Set(["nd_other"]));
  });
});
