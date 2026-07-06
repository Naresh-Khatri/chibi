import {
  BASE_STATE_ID,
  newId,
  type Action,
  type ChibiDocument,
  type PropertyValue,
  type Trigger,
} from "@/runtime/schema";
import { useDoc, type DispatchOpts } from "./document";
import { useUI } from "./ui";

function dispatch(
  label: string,
  recipe: (draft: ChibiDocument) => void,
  opts?: DispatchOpts,
) {
  useDoc.getState().dispatch(label, recipe, opts);
}

/** guard for base-only ops (structural edits, keyframes): toast + false while a non-base state is active. value commands record overrides instead — see commands.ts */
export function requireBaseState(what: string): boolean {
  const ui = useUI.getState();
  if (ui.activeStateId === BASE_STATE_ID) return true;
  ui.showToast(`Switch to the Base state to ${what}`);
  return false;
}

export function addState(): string {
  const id = newId("st");
  dispatch("Add state", (d) => {
    const names = new Set(Object.values(d.states).map((s) => s.name));
    let i = 2;
    while (names.has(`State ${i}`)) i++;
    d.states[id] = { id, name: `State ${i}`, overrides: {} };
  });
  useUI.getState().setActiveState(id);
  return id;
}

export function renameState(stateId: string, name: string) {
  if (stateId === BASE_STATE_ID || !name.trim()) return;
  dispatch("Rename state", (d) => {
    const state = d.states[stateId];
    if (state) state.name = name.trim();
  });
}

/** interactions whose action references the state (transition.to / toggle a|b) */
export function stateReferenceCount(stateId: string): number {
  const doc = useDoc.getState().doc;
  if (!doc) return 0;
  return doc.interactions.filter((ix) => actionReferencesState(ix.action, stateId))
    .length;
}

function actionReferencesState(action: Action, stateId: string): boolean {
  if (action.type === "transition") return action.to === stateId;
  if (action.type === "toggleStates")
    return action.a === stateId || action.b === stateId;
  return false;
}

/** deletes the state + any interactions referencing it */
export function deleteState(stateId: string) {
  if (stateId === BASE_STATE_ID) return;
  dispatch("Delete state", (d) => {
    if (!d.states[stateId]) return;
    delete d.states[stateId];
    d.interactions = d.interactions.filter(
      (ix) => !actionReferencesState(ix.action, stateId),
    );
  });
  const ui = useUI.getState();
  if (ui.activeStateId === stateId) ui.setActiveState(BASE_STATE_ID);
}

/** the state-editing write path: record property overrides for one target */
export function writeOverrides(
  stateId: string,
  targetId: string,
  entries: Record<string, PropertyValue>,
  opts?: DispatchOpts,
  label = "Edit state",
) {
  if (stateId === BASE_STATE_ID) return;
  dispatch(
    label,
    (d) => {
      const state = d.states[stateId];
      if (!state) return;
      const target = (state.overrides[targetId] ??= {});
      for (const [path, value] of Object.entries(entries)) {
        target[path] = Array.isArray(value) ? [...value] : value;
      }
    },
    opts,
  );
}

export function clearOverride(stateId: string, targetId: string, path: string) {
  dispatch("Reset override", (d) => {
    const state = d.states[stateId];
    const target = state?.overrides[targetId];
    if (!target || !(path in target)) return;
    delete target[path];
    if (Object.keys(target).length === 0) delete state!.overrides[targetId];
  });
}

export function addInteraction(trigger: Trigger, action: Action): string {
  const id = newId("ix");
  dispatch("Add interaction", (d) => {
    d.interactions.push({ id, trigger, action });
  });
  return id;
}

export function setInteractionTrigger(id: string, trigger: Trigger) {
  dispatch("Edit interaction", (d) => {
    const ix = d.interactions.find((i) => i.id === id);
    if (ix) ix.trigger = trigger;
  });
}

export function setInteractionAction(
  id: string,
  action: Action,
  opts?: DispatchOpts,
) {
  dispatch(
    "Edit interaction",
    (d) => {
      const ix = d.interactions.find((i) => i.id === id);
      if (ix) ix.action = action;
    },
    opts,
  );
}

export function removeInteraction(id: string) {
  dispatch("Delete interaction", (d) => {
    const idx = d.interactions.findIndex((i) => i.id === id);
    if (idx >= 0) d.interactions.splice(idx, 1);
  });
}
