import type { AnimationClip } from "../schema/types";
import { sampleClip, type SampleMap } from "./sampler";

/**
 * Minimal stateful clip player. The caller owns the clock and feeds deltas
 * (e.g. from useFrame); no DOM, timers or three.js here.
 */
export class ClipPlayer {
  clip: AnimationClip;
  time = 0;
  playing = false;

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  play(): void {
    // replay from the start when parked at the end of a non-looping clip
    if (!this.clip.loop && this.time >= this.clip.duration) this.time = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    this.time = 0;
  }

  seek(t: number): void {
    this.time = Math.max(0, Math.min(t, this.clip.duration));
  }

  /**
   * Advance by `delta` seconds when playing and return the sampled values.
   * A non-looping clip parks at its duration and pauses itself.
   */
  advance(delta: number): SampleMap {
    if (this.playing) {
      this.time += delta;
      if (this.clip.loop) {
        if (this.clip.duration > 0) this.time %= this.clip.duration;
      } else if (this.time >= this.clip.duration) {
        this.time = this.clip.duration;
        this.playing = false;
      }
    }
    return this.sample();
  }

  sample(): SampleMap {
    return sampleClip(this.clip, this.time);
  }
}
