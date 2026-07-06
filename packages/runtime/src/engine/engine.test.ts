import { describe, expect, it } from "vitest";
import type { AnimationClip, Easing, Vec3 } from "../schema/types";
import { DEFAULT_EASE, EASING } from "./easing";
import {
  lerpHexColor,
  makeTargetKey,
  parseTargetKey,
  sampleClip,
  sampleKeyframes,
} from "./sampler";
import { ClipPlayer } from "./player";

function clip(partial: Partial<AnimationClip>): AnimationClip {
  return {
    id: "an_test",
    name: "Test",
    duration: 2,
    loop: false,
    tracks: [],
    ...partial,
  };
}

const bounceTrack = {
  targetId: "nd_cube",
  property: "transform.position",
  keyframes: [
    { t: 0, v: [0, 0, 0] as Vec3, ease: "linear" as Easing },
    { t: 1, v: [0, 1, 0] as Vec3, ease: "linear" as Easing },
    { t: 2, v: [0, 0, 0] as Vec3 },
  ],
};

describe("easing", () => {
  it("hits 0 at u=0 and 1 at u=1", () => {
    for (const fn of Object.values(EASING)) {
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    }
  });

  it("is monotonically non-decreasing", () => {
    const STEPS = 200;
    for (const [name, fn] of Object.entries(EASING)) {
      let prev = fn(0);
      for (let i = 1; i <= STEPS; i++) {
        const v = fn(i / STEPS);
        expect(v, `${name} at u=${i / STEPS}`).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it("defaults segments to easeInOut", () => {
    expect(DEFAULT_EASE).toBe("easeInOut");
  });
});

describe("sampleKeyframes", () => {
  const kfs = bounceTrack.keyframes;

  it("returns exact values at keyframes", () => {
    expect(sampleKeyframes(kfs, 0)).toEqual([0, 0, 0]);
    expect(sampleKeyframes(kfs, 1)).toEqual([0, 1, 0]);
    expect(sampleKeyframes(kfs, 2)).toEqual([0, 0, 0]);
  });

  it("interpolates between keyframes (linear ease)", () => {
    expect(sampleKeyframes(kfs, 0.5)).toEqual([0, 0.5, 0]);
    expect(sampleKeyframes(kfs, 0.25)).toEqual([0, 0.25, 0]);
  });

  it("clamps before the first and after the last keyframe", () => {
    expect(sampleKeyframes(kfs, -5)).toEqual([0, 0, 0]);
    expect(sampleKeyframes(kfs, 99)).toEqual([0, 0, 0]);
    const offset = [{ t: 0.5, v: 3 }, { t: 1, v: 7 }];
    expect(sampleKeyframes(offset, 0)).toBe(3);
    expect(sampleKeyframes(offset, 2)).toBe(7);
  });

  it("applies the ease of the keyframe the segment leaves", () => {
    const eased = [
      { t: 0, v: 0, ease: "easeIn" as Easing },
      { t: 1, v: 1 },
    ];
    expect(sampleKeyframes(eased, 0.5)).toBeCloseTo(EASING.easeIn(0.5), 10);
  });

  it("lerps scalars", () => {
    const kf = [
      { t: 0, v: 2, ease: "linear" as Easing },
      { t: 1, v: 4 },
    ];
    expect(sampleKeyframes(kf, 0.5)).toBe(3);
  });

  it("steps booleans at the next keyframe", () => {
    const kf = [
      { t: 0, v: true },
      { t: 1, v: false },
    ];
    expect(sampleKeyframes(kf, 0.999)).toBe(true);
    expect(sampleKeyframes(kf, 1)).toBe(false);
  });

  it("lerps colors in sRGB", () => {
    const kf = [
      { t: 0, v: "#000000", ease: "linear" as Easing },
      { t: 1, v: "#ff0000" },
    ];
    expect(sampleKeyframes(kf, 0.5)).toBe("#800000");
    expect(sampleKeyframes(kf, 0)).toBe("#000000");
    expect(sampleKeyframes(kf, 1)).toBe("#ff0000");
  });
});

describe("lerpHexColor", () => {
  it("handles #rgb shorthand and mixed channels", () => {
    expect(lerpHexColor("#fff", "#000", 1)).toBe("#000000");
    expect(lerpHexColor("#102030", "#304050", 0.5)).toBe("#203040");
  });
});

describe("sampleClip", () => {
  it("samples every non-empty track keyed by target:property", () => {
    const c = clip({
      tracks: [
        bounceTrack,
        { targetId: "mt_red", property: "opacity", keyframes: [] },
      ],
    });
    const map = sampleClip(c, 0.5);
    expect(map.size).toBe(1);
    expect(map.get(makeTargetKey("nd_cube", "transform.position"))).toEqual([
      0, 0.5, 0,
    ]);
  });

  it("wraps time by duration when looping", () => {
    const c = clip({ loop: true, tracks: [bounceTrack] });
    const key = makeTargetKey("nd_cube", "transform.position");
    expect(sampleClip(c, 2.5).get(key)).toEqual([0, 0.5, 0]);
    expect(sampleClip(c, 4).get(key)).toEqual([0, 0, 0]);
    expect(sampleClip(c, -0.5).get(key)).toEqual(sampleClip(c, 1.5).get(key));
  });

  it("clamps instead of wrapping when not looping", () => {
    const c = clip({ loop: false, tracks: [bounceTrack] });
    const key = makeTargetKey("nd_cube", "transform.position");
    expect(sampleClip(c, 5).get(key)).toEqual([0, 0, 0]);
  });
});

describe("targetKey", () => {
  it("round-trips targetId and property", () => {
    const key = makeTargetKey("nd_ab-12_x", "transform.position");
    expect(parseTargetKey(key)).toEqual({
      targetId: "nd_ab-12_x",
      property: "transform.position",
    });
  });
});

describe("ClipPlayer", () => {
  it("advances only while playing and emits samples", () => {
    const player = new ClipPlayer(clip({ loop: true, tracks: [bounceTrack] }));
    const key = makeTargetKey("nd_cube", "transform.position");
    expect(player.advance(0.5).get(key)).toEqual([0, 0, 0]); // paused: no advance
    player.play();
    expect(player.advance(0.5).get(key)).toEqual([0, 0.5, 0]);
    expect(player.time).toBeCloseTo(0.5, 10);
  });

  it("loops time past the duration", () => {
    const player = new ClipPlayer(clip({ loop: true, tracks: [bounceTrack] }));
    player.play();
    player.advance(2.5);
    expect(player.time).toBeCloseTo(0.5, 10);
    expect(player.playing).toBe(true);
  });

  it("parks at the end of a non-looping clip and pauses", () => {
    const player = new ClipPlayer(clip({ loop: false, tracks: [bounceTrack] }));
    player.play();
    player.advance(10);
    expect(player.time).toBe(2);
    expect(player.playing).toBe(false);
    player.play(); // restarts from 0
    expect(player.time).toBe(0);
  });

  it("stop resets time; seek clamps to the clip range", () => {
    const player = new ClipPlayer(clip({ loop: false, tracks: [bounceTrack] }));
    player.play();
    player.advance(1);
    player.stop();
    expect(player.time).toBe(0);
    expect(player.playing).toBe(false);
    player.seek(99);
    expect(player.time).toBe(2);
    player.seek(-1);
    expect(player.time).toBe(0);
  });
});
