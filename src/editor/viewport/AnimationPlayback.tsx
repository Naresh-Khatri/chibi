"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { ChibiDocument, PropertyValue } from "@/runtime/schema";
import { parseTargetKey, resolveValue, sampleClip } from "@/runtime/engine";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { getSceneObject } from "./objectRegistry";
import { getCachedMaterial } from "./materials";

/**
 * Drives timeline playback. While the timeline is playing or paused mid-clip
 * (scrub preview), applies sampled values imperatively to the registered
 * Object3Ds / cached three materials each frame — no store writes, no React
 * re-renders. On stop, snaps every touched target back to its document value;
 * the document stays the source of truth.
 */
export function AnimationPlayback() {
  // targetKeys written to since the last restore
  const touched = useRef(new Set<string>());

  useFrame((_, delta) => {
    const ui = useUI.getState();
    const doc = useDoc.getState().doc;
    if (!doc) return;
    const clip = ui.activeClipId ? doc.animations[ui.activeClipId] : undefined;

    if (!clip || ui.playback === "stopped") {
      if (touched.current.size) restoreAll(doc, touched.current);
      return;
    }

    let t = ui.playhead;
    if (ui.playback === "playing") {
      // play pressed while parked at the end of a non-looping clip: replay
      if (!clip.loop && t >= clip.duration) t = 0;
      t += delta;
      if (clip.loop) {
        if (clip.duration > 0) t %= clip.duration;
      } else if (t >= clip.duration) {
        t = clip.duration;
        useUI.setState({ playback: "paused" });
      }
      useUI.setState({ playhead: t });
    }

    // Reapplying every frame (even paused) keeps the preview live while the
    // user edits keyframes, undoes, or the playhead scrubs.
    for (const [key, value] of sampleClip(clip, t)) {
      const { targetId, property } = parseTargetKey(key);
      if (applyValue(doc, targetId, property, value)) touched.current.add(key);
    }
  });

  // restore document values if unmounted mid-playback
  useEffect(() => {
    const set = touched.current;
    return () => {
      const doc = useDoc.getState().doc;
      if (doc && set.size) restoreAll(doc, set);
    };
  }, []);

  return null;
}

// restore target = doc value resolved through the active state, not raw base
function restoreAll(doc: ChibiDocument, touched: Set<string>) {
  const stateId = useUI.getState().activeStateId;
  for (const key of touched) {
    const { targetId, property } = parseTargetKey(key);
    const value = resolveValue(doc, stateId, targetId, property);
    if (value !== undefined) applyValue(doc, targetId, property, value);
  }
  touched.clear();
}

function applyValue(
  doc: ChibiDocument,
  targetId: string,
  property: string,
  value: PropertyValue,
): boolean {
  if (doc.nodes[targetId]) {
    const obj = getSceneObject(targetId);
    if (!obj) return false;
    if (property === "visible") {
      obj.visible = Boolean(value);
      return true;
    }
    if (!Array.isArray(value)) return false;
    switch (property) {
      case "transform.position":
        obj.position.set(value[0], value[1], value[2]);
        return true;
      case "transform.rotation":
        obj.rotation.set(value[0], value[1], value[2]);
        return true;
      case "transform.scale":
        obj.scale.set(value[0], value[1], value[2]);
        return true;
    }
    return false;
  }

  const def = doc.materials[targetId];
  const mat = def ? getCachedMaterial(targetId) : null;
  if (!def || !mat) return false;
  switch (property) {
    case "color":
      if (typeof value === "string") {
        mat.color.set(value);
        return true;
      }
      return false;
    case "opacity":
      if (typeof value === "number") {
        mat.opacity = value;
        mat.transparent = def.transparent || value < 1;
        return true;
      }
      return false;
  }
  return false;
}

