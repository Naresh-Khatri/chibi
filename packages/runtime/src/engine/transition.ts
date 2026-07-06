import type { Easing } from "../schema/types";
import { EASING } from "./easing";
import { interpolateValue, type SampleMap } from "./sampler";

/** one-shot tween between value maps, caller-driven deltas (like ClipPlayer); missing `from` keys snap to `to`, booleans hold then flip at completion */
export class Transition {
  done = false;
  private t = 0;

  constructor(
    private from: SampleMap,
    private to: SampleMap,
    private duration: number,
    private ease: Easing,
  ) {}

  advance(delta: number): SampleMap {
    this.t += delta;
    const u = this.duration <= 0 ? 1 : Math.min(this.t / this.duration, 1);
    if (u >= 1) this.done = true;
    const out: SampleMap = new Map();
    if (this.done) {
      for (const [key, value] of this.to) out.set(key, value);
      return out;
    }
    const eased = EASING[this.ease](u);
    for (const [key, toValue] of this.to) {
      const fromValue = this.from.get(key);
      out.set(
        key,
        fromValue === undefined
          ? toValue
          : interpolateValue(fromValue, toValue, eased),
      );
    }
    return out;
  }
}

/** interrupt-safe: pass the current in-flight values as `fromValues` and the new tween picks up exactly where the old one was */
export function createTransition(
  fromValues: SampleMap,
  toValues: SampleMap,
  duration: number,
  ease: Easing,
): Transition {
  return new Transition(new Map(fromValues), toValues, duration, ease);
}
