import { BASE_STATE_ID } from "../schema/create";
import type { Action, ChibiDocument, Easing } from "../schema/types";
import { ClipPlayer } from "./player";
import type { SampleMap } from "./sampler";
import { resolveStateValues } from "./state";
import { createTransition, type Transition } from "./transition";

export type PointerTriggerType = "click" | "hoverEnter" | "hoverExit";

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
 * per frame; applying it to three objects is the host's job. interrupting a
 * transition mid-flight tweens from the current values — no jumps.
 */
export class InteractionRuntime {
  currentStateId = BASE_STATE_ID; // toggleStates compares against this

  private doc: ChibiDocument;
  private current: SampleMap; // live value per state-managed key
  private transition: Transition | null = null;
  private players = new Map<string, ClipPlayer>();

  constructor(doc: ChibiDocument) {
    this.doc = doc;
    this.current = resolveStateValues(doc, BASE_STATE_ID);
  }

  /** fire `start` triggers — call once on scene mount */
  start(): void {
    for (const ix of this.doc.interactions) {
      if (ix.trigger.type === "start") this.run(ix.action);
    }
  }

  /** dispatch a pointer trigger; true if any interaction fired */
  pointer(type: PointerTriggerType, nodeId: string): boolean {
    let handled = false;
    for (const ix of this.doc.interactions) {
      if (ix.trigger.type === type && ix.trigger.nodeId === nodeId) {
        this.run(ix.action);
        handled = true;
      }
    }
    return handled;
  }

  /** values to apply this frame; clip samples layer over state values, finished non-looping clips hold their last pose */
  advance(delta: number): SampleMap {
    if (this.transition) {
      const values = this.transition.advance(delta);
      for (const [key, value] of values) this.current.set(key, value);
      if (this.transition.done) this.transition = null;
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
        this.goTo(action.to, action.duration, action.ease);
        break;
      case "toggleStates":
        this.goTo(
          this.currentStateId === action.a ? action.b : action.a,
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
        break;
      }
    }
  }

  private goTo(stateId: string, duration: number, ease: Easing): void {
    if (!this.doc.states[stateId]) return;
    this.currentStateId = stateId;
    this.transition = createTransition(
      this.current,
      resolveStateValues(this.doc, stateId),
      duration,
      ease,
    );
  }
}
