import { BASE_STATE_ID } from "../schema/create";
import type { Action, ChibiDocument, Easing, Trigger } from "../schema/types";
import { ClipPlayer } from "./player";
import type { SampleMap } from "./sampler";
import { resolveStateValues } from "./state";
import { createTransition, type Transition } from "./transition";

export type PointerTriggerType = "click" | "hoverEnter" | "hoverExit";

/** surfaced to the host app via <ChibiScene onEvent>; "ready" comes from the react layer */
export type RuntimeEvent =
  | { type: "ready" }
  | { type: "interaction"; trigger: Trigger; action: Action }
  | { type: "stateChange"; nodeId: string; stateId: string };

export type TransitionOpts = { duration?: number; ease?: Easing };

const DEFAULT_TRANSITION: Required<TransitionOpts> = {
  duration: 0.3,
  ease: "easeInOut",
};

/** node ids with pointer interactions — event wiring + cursor */
export function interactiveNodeIds(doc: ChibiDocument): {
  click: Set<string>;
  hover: Set<string>;
} {
  const click = new Set<string>();
  const hover = new Set<string>();
  for (const ix of doc.interactions) {
    if (ix.trigger.type === "click") click.add(ix.trigger.nodeId);
    else if (ix.trigger.type !== "start") hover.add(ix.trigger.nodeId);
  }
  return { click, hover };
}

/**
 * interaction dispatcher. host feeds pointer events in + pulls a value map
 * per frame; applying it to three objects is the host's job. states are
 * per-object: each node has its own logical state + in-flight transition, so
 * objects animate independently. interrupting a node's transition mid-flight
 * tweens from the current values — no jumps.
 */
export class InteractionRuntime {
  /** host app listener (interaction firings + state changes) */
  onEvent?: (event: RuntimeEvent) => void;
  /** render host hook — fired whenever motion may start; wakes a demand frameloop */
  onWake?: () => void;

  private doc: ChibiDocument;
  private paused = false;
  private current: SampleMap = new Map(); // live value per state-managed key
  private currentStates = new Map<string, string>(); // nodeId -> stateId
  private transitions = new Map<string, Transition>(); // nodeId -> in-flight
  private players = new Map<string, ClipPlayer>();

  constructor(doc: ChibiDocument) {
    this.doc = doc;
    for (const state of Object.values(doc.states)) {
      if (this.currentStates.has(state.nodeId)) continue;
      this.currentStates.set(state.nodeId, BASE_STATE_ID);
      for (const [key, value] of resolveStateValues(doc, state.nodeId, BASE_STATE_ID)) {
        this.current.set(key, value);
      }
    }
  }

  /** the node's logical state; toggleStates compares against this */
  stateOf(nodeId: string): string {
    return this.currentStates.get(nodeId) ?? BASE_STATE_ID;
  }

  /** fire `start` triggers — call once on scene mount */
  start(): void {
    for (const ix of this.doc.interactions) {
      if (ix.trigger.type === "start") {
        this.onEvent?.({ type: "interaction", trigger: ix.trigger, action: ix.action });
        this.run(ix.action);
      }
    }
  }

  /** dispatch a pointer trigger; true if any interaction fired */
  pointer(type: PointerTriggerType, nodeId: string): boolean {
    let handled = false;
    for (const ix of this.doc.interactions) {
      if (ix.trigger.type === type && ix.trigger.nodeId === nodeId) {
        this.onEvent?.({ type: "interaction", trigger: ix.trigger, action: ix.action });
        this.run(ix.action);
        handled = true;
      }
    }
    return handled;
  }

  // host api (ChibiSceneApi delegates here) ------------------------------

  /** app-driven transition; "base" resets every stateful object */
  transitionTo(stateId: string, opts?: TransitionOpts): void {
    const duration = opts?.duration ?? DEFAULT_TRANSITION.duration;
    const ease = opts?.ease ?? DEFAULT_TRANSITION.ease;
    if (stateId === BASE_STATE_ID) {
      for (const nodeId of this.currentStates.keys()) {
        this.goTo(nodeId, BASE_STATE_ID, duration, ease);
      }
      return;
    }
    const state = this.doc.states[stateId];
    if (state) this.goTo(state.nodeId, stateId, duration, ease);
  }

  play(animationId: string): void {
    this.run({ type: "playAnimation", animationId });
  }

  pause(animationId: string): void {
    this.players.get(animationId)?.pause();
  }

  stop(animationId: string): void {
    const player = this.players.get(animationId);
    if (!player) return;
    player.stop();
    this.onWake?.(); // one more frame to re-apply the t=0 pose
  }

  /** logical state per stateful node (nodes at virtual base included) */
  getState(): Record<string, string> {
    return Object.fromEntries(this.currentStates);
  }

  /** freeze/unfreeze all motion; paused advance() applies nothing */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.onWake?.();
  }

  /** motion pending? drives the host's demand-frameloop invalidation */
  isActive(): boolean {
    if (this.paused) return false;
    if (this.transitions.size > 0) return true;
    for (const player of this.players.values()) {
      if (player.playing) return true;
    }
    return false;
  }

  /** values to apply this frame; clip samples layer over state values, finished non-looping clips hold their last pose */
  advance(delta: number): SampleMap {
    if (this.paused) return new Map();
    for (const [nodeId, transition] of this.transitions) {
      for (const [key, value] of transition.advance(delta)) {
        this.current.set(key, value);
      }
      if (transition.done) this.transitions.delete(nodeId);
    }
    const out = new Map(this.current);
    for (const player of this.players.values()) {
      for (const [key, value] of player.advance(delta)) out.set(key, value);
    }
    return out;
  }

  private run(action: Action): void {
    switch (action.type) {
      case "transition":
        this.goTo(action.nodeId, action.to, action.duration, action.ease);
        break;
      case "toggleStates":
        this.goTo(
          action.nodeId,
          this.stateOf(action.nodeId) === action.a ? action.b : action.a,
          action.duration,
          action.ease,
        );
        break;
      case "playAnimation": {
        if (!this.doc.animations[action.animationId]) return;
        let player = this.players.get(action.animationId);
        if (!player) {
          player = new ClipPlayer(this.doc.animations[action.animationId]);
          this.players.set(action.animationId, player);
        }
        player.time = 0; // retrigger restarts the clip
        player.play();
        this.onWake?.();
        break;
      }
    }
  }

  private goTo(
    nodeId: string,
    stateId: string,
    duration: number,
    ease: Easing,
  ): void {
    if (stateId !== BASE_STATE_ID && this.doc.states[stateId]?.nodeId !== nodeId) {
      return;
    }
    if (this.currentStates.get(nodeId) !== stateId) {
      this.onEvent?.({ type: "stateChange", nodeId, stateId });
    }
    this.currentStates.set(nodeId, stateId);
    this.onWake?.();
    // per-node transition — replaces only this node's tween; `to` only holds
    // the node's managed keys, so the shared `current` map is a safe `from`
    this.transitions.set(
      nodeId,
      createTransition(
        this.current,
        resolveStateValues(this.doc, nodeId, stateId),
        duration,
        ease,
      ),
    );
  }
}
