import {
  newId,
  type AnimationClip,
  type ChibiDocument,
  type Easing,
  type Keyframe,
  type PropertyValue,
  type Track,
} from "@/runtime/schema";
import { getBaseValue } from "@/runtime/engine";
import { useDoc, type DispatchOpts } from "./document";
import { useUI } from "./ui";
import { requireBaseState } from "./stateCommands";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

const T_EPSILON = 1e-4;

function findTrack(
  d: ChibiDocument,
  clipId: string,
  targetId: string,
  property: string,
): Track | undefined {
  return d.animations[clipId]?.tracks.find(
    (t) => t.targetId === targetId && t.property === property,
  );
}

export function addClip(): string {
  if (!requireBaseState("edit animations")) return "";
  const id = newId("an");
  dispatch("New clip", (d) => {
    const names = new Set(Object.values(d.animations).map((a) => a.name));
    let name = "Clip";
    for (let i = 2; names.has(name); i++) name = `Clip ${i}`;
    const clip: AnimationClip = { id, name, duration: 3, loop: true, tracks: [] };
    d.animations[id] = clip;
  });
  useUI.getState().setActiveClip(id);
  return id;
}

export function removeClip(clipId: string) {
  if (!requireBaseState("edit animations")) return;
  dispatch("Delete clip", (d) => {
    delete d.animations[clipId];
  });
  const ui = useUI.getState();
  if (ui.activeClipId === clipId) {
    const remaining = Object.keys(useDoc.getState().doc?.animations ?? {});
    ui.setActiveClip(remaining[0] ?? null);
  }
}

export function setClipProp(
  clipId: string,
  updates: Partial<Pick<AnimationClip, "name" | "duration" | "loop">>,
  opts?: DispatchOpts,
) {
  if (updates.name !== undefined && !updates.name.trim()) return;
  if (!requireBaseState("edit animations")) return;
  dispatch(
    "Edit clip",
    (d) => {
      const clip = d.animations[clipId];
      if (!clip) return;
      if (updates.name !== undefined) clip.name = updates.name.trim();
      if (updates.duration !== undefined) {
        clip.duration = Math.max(0.1, updates.duration);
      }
      if (updates.loop !== undefined) clip.loop = updates.loop;
    },
    opts,
  );
}

export function addTrack(clipId: string, targetId: string, property: string) {
  if (!requireBaseState("edit animations")) return;
  dispatch("Add track", (d) => {
    const clip = d.animations[clipId];
    if (!clip || findTrack(d, clipId, targetId, property)) return;
    clip.tracks.push({ targetId, property, keyframes: [] });
  });
}

export function removeTrack(clipId: string, targetId: string, property: string) {
  if (!requireBaseState("edit animations")) return;
  dispatch("Delete track", (d) => {
    const clip = d.animations[clipId];
    if (!clip) return;
    const idx = clip.tracks.findIndex(
      (t) => t.targetId === targetId && t.property === property,
    );
    if (idx >= 0) clip.tracks.splice(idx, 1);
  });
}

/** Insert a keyframe at `t`, replacing any existing keyframe at that time. */
export function addKeyframe(
  clipId: string,
  targetId: string,
  property: string,
  t: number,
  v: PropertyValue,
  ease?: Easing,
) {
  if (!requireBaseState("edit keyframes")) return;
  dispatch("Add keyframe", (d) => {
    const track = findTrack(d, clipId, targetId, property);
    if (!track) return;
    const kf: Keyframe = ease ? { t, v, ease } : { t, v };
    const existing = track.keyframes.findIndex(
      (k) => Math.abs(k.t - t) < T_EPSILON,
    );
    if (existing >= 0) track.keyframes[existing] = kf;
    else {
      track.keyframes.push(kf);
      track.keyframes.sort((a, b) => a.t - b.t);
    }
  });
}

/** Retime a keyframe; keeps the array sorted. Drags pass a gesture mergeKey. */
export function moveKeyframe(
  clipId: string,
  targetId: string,
  property: string,
  index: number,
  newT: number,
  opts?: DispatchOpts,
) {
  if (!requireBaseState("edit keyframes")) return;
  dispatch(
    "Move keyframe",
    (d) => {
      const track = findTrack(d, clipId, targetId, property);
      const kf = track?.keyframes[index];
      if (!track || !kf) return;
      kf.t = Math.max(0, newT);
      track.keyframes.sort((a, b) => a.t - b.t);
    },
    opts,
  );
}

export function setKeyframe(
  clipId: string,
  targetId: string,
  property: string,
  index: number,
  updates: { v?: PropertyValue; ease?: Easing },
  opts?: DispatchOpts,
) {
  if (!requireBaseState("edit keyframes")) return;
  dispatch(
    "Edit keyframe",
    (d) => {
      const track = findTrack(d, clipId, targetId, property);
      const kf = track?.keyframes[index];
      if (!kf) return;
      if (updates.v !== undefined) kf.v = updates.v;
      if (updates.ease !== undefined) kf.ease = updates.ease;
    },
    opts,
  );
}

export function removeKeyframe(
  clipId: string,
  targetId: string,
  property: string,
  index: number,
) {
  if (!requireBaseState("edit keyframes")) return;
  dispatch("Delete keyframe", (d) => {
    const track = findTrack(d, clipId, targetId, property);
    if (track?.keyframes[index]) track.keyframes.splice(index, 1);
  });
}

/** Current document value of an animatable property (what "add key" captures). */
export function getAnimatableValue(
  doc: ChibiDocument,
  targetId: string,
  property: string,
): PropertyValue | undefined {
  return getBaseValue(doc, targetId, property);
}
