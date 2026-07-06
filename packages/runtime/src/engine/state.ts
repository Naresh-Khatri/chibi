import type { ChibiDocument, ObjectState, PropertyValue } from "../schema/types";
import { makeTargetKey, type SampleMap, type TargetKey } from "./sampler";

/** base value of a registry property; vec3s copied so callers can't mutate the doc */
export function getBaseValue(
  doc: ChibiDocument,
  targetId: string,
  property: string,
): PropertyValue | undefined {
  const node = doc.nodes[targetId];
  if (node) {
    switch (property) {
      case "transform.position":
        return [...node.transform.position];
      case "transform.rotation":
        return [...node.transform.rotation];
      case "transform.scale":
        return [...node.transform.scale];
      case "visible":
        return node.visible;
    }
    return undefined;
  }
  const material = doc.materials[targetId];
  if (material) {
    switch (property) {
      case "color":
        return material.color;
      case "opacity":
        return material.opacity;
    }
  }
  return undefined;
}

export function getStateOverride(
  doc: ChibiDocument,
  stateId: string,
  targetId: string,
  property: string,
): PropertyValue | undefined {
  return doc.states[stateId]?.overrides[targetId]?.[property];
}

export function resolveValue(
  doc: ChibiDocument,
  stateId: string,
  targetId: string,
  property: string,
): PropertyValue | undefined {
  return (
    getStateOverride(doc, stateId, targetId, property) ??
    getBaseValue(doc, targetId, property)
  );
}

/** the node's own states (its virtual Base is not materialized) */
export function statesOf(doc: ChibiDocument, nodeId: string): ObjectState[] {
  return Object.values(doc.states).filter((s) => s.nodeId === nodeId);
}

/** union of keys overridden by ANY of the node's states — transitioning must restore keys the target state doesn't override back to base */
export function nodeManagedKeys(
  doc: ChibiDocument,
  nodeId: string,
): Set<TargetKey> {
  const keys = new Set<TargetKey>();
  for (const state of statesOf(doc, nodeId)) {
    for (const [targetId, props] of Object.entries(state.overrides)) {
      for (const property of Object.keys(props)) {
        keys.add(makeTargetKey(targetId, property));
      }
    }
  }
  return keys;
}

/** node state -> flat value map over the node's managed keys (override ?? base); viewport "apply state" + transition tween target */
export function resolveStateValues(
  doc: ChibiDocument,
  nodeId: string,
  stateId: string,
): SampleMap {
  const out: SampleMap = new Map();
  const overrides = doc.states[stateId]?.overrides ?? {};
  for (const key of nodeManagedKeys(doc, nodeId)) {
    const i = key.indexOf(":");
    const targetId = key.slice(0, i);
    const property = key.slice(i + 1);
    const value = overrides[targetId]?.[property] ?? getBaseValue(doc, targetId, property);
    if (value !== undefined) out.set(key, value);
  }
  return out;
}
