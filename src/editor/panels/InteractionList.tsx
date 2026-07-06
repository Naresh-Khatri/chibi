"use client";

import {
  BASE_STATE_ID,
  type Action,
  type AnimationClip,
  type Easing,
  type Interaction,
  type SceneState,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import {
  addInteraction,
  removeInteraction,
  setInteractionAction,
  setInteractionTrigger,
} from "../store/stateCommands";
import { DragNumber, Dropdown, type MenuItem } from "./controls";

const EASE_OPTIONS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

const TRIGGER_LABELS: Record<string, string> = {
  start: "Start",
  click: "Click",
  hoverEnter: "Hover enter",
  hoverExit: "Hover exit",
};

const ACTION_LABELS: Record<Action["type"], string> = {
  transition: "Transition",
  playAnimation: "Play animation",
  toggleStates: "Toggle states",
};

/** node scope = that node's pointer triggers; "start" = document-level */
export type InteractionScope = { kind: "node"; nodeId: string } | { kind: "start" };

export function InteractionList({ scope }: { scope: InteractionScope }) {
  const interactions = useDoc((s) => s.doc?.interactions);
  const states = useDoc((s) => s.doc?.states);
  const animations = useDoc((s) => s.doc?.animations);
  if (!interactions || !states || !animations) return null;

  const rows = interactions.filter((ix) =>
    scope.kind === "start"
      ? ix.trigger.type === "start"
      : ix.trigger.type !== "start" && ix.trigger.nodeId === scope.nodeId,
  );

  const add = () => {
    const firstNonBase = Object.keys(states).find((id) => id !== BASE_STATE_ID);
    addInteraction(
      scope.kind === "start"
        ? { type: "start" }
        : { type: "click", nodeId: scope.nodeId },
      {
        type: "transition",
        to: firstNonBase ?? BASE_STATE_ID,
        duration: 0.4,
        ease: "easeOut",
      },
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((ix) => (
        <InteractionRow
          key={ix.id}
          ix={ix}
          scope={scope}
          states={states}
          animations={animations}
        />
      ))}
      {rows.length === 0 && (
        <div className="text-[11px] text-ink-dim/70">
          {scope.kind === "start"
            ? "Nothing runs on scene start yet."
            : "No interactions on this object yet."}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="h-6 self-start rounded bg-panel-2 px-2 text-xs text-ink hover:bg-panel-2/70"
      >
        + Add interaction
      </button>
    </div>
  );
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-ink-dim">{label}</span>
      {children}
    </div>
  );
}

function InteractionRow({
  ix,
  scope,
  states,
  animations,
}: {
  ix: Interaction;
  scope: InteractionScope;
  states: Record<string, SceneState>;
  animations: Record<string, AnimationClip>;
}) {
  const action = ix.action;
  const stateList = Object.values(states);
  const clipList = Object.values(animations);
  const firstNonBase =
    stateList.find((s) => s.id !== BASE_STATE_ID)?.id ?? BASE_STATE_ID;

  const triggerItems: MenuItem[] =
    scope.kind === "node"
      ? (["click", "hoverEnter", "hoverExit"] as const).map((type) => ({
          label:
            type === ix.trigger.type
              ? `✓ ${TRIGGER_LABELS[type]}`
              : TRIGGER_LABELS[type],
          onSelect: () =>
            setInteractionTrigger(ix.id, { type, nodeId: scope.nodeId }),
        }))
      : [];

  const actionTypeItems: MenuItem[] = [
    {
      label: ACTION_LABELS.transition,
      onSelect: () =>
        action.type !== "transition" &&
        setInteractionAction(ix.id, {
          type: "transition",
          to: firstNonBase,
          duration: 0.4,
          ease: "easeOut",
        }),
    },
    {
      label: ACTION_LABELS.playAnimation,
      onSelect: () =>
        action.type !== "playAnimation" &&
        setInteractionAction(ix.id, {
          type: "playAnimation",
          animationId: clipList[0]?.id ?? "",
        }),
    },
    {
      label: ACTION_LABELS.toggleStates,
      onSelect: () =>
        action.type !== "toggleStates" &&
        setInteractionAction(ix.id, {
          type: "toggleStates",
          a: BASE_STATE_ID,
          b: firstNonBase,
          duration: 0.4,
          ease: "easeOut",
        }),
    },
  ];

  const statePicker = (value: string, onPick: (id: string) => void) => (
    <Dropdown
      button={<>{states[value]?.name ?? "missing state"} ▾</>}
      items={stateList.map((s) => ({
        label: s.id === value ? `✓ ${s.name}` : s.name,
        onSelect: () => onPick(s.id),
      }))}
    />
  );

  const easePicker = (value: Easing, onPick: (e: Easing) => void) => (
    <Dropdown
      button={<>{value} ▾</>}
      items={EASE_OPTIONS.map((e) => ({
        label: e === value ? `✓ ${e}` : e,
        onSelect: () => onPick(e),
      }))}
    />
  );

  const durationRow = (
    current: { duration: number },
    update: (duration: number) => Action,
  ) => (
    <ParamRow label="Duration s">
      <DragNumber
        value={current.duration}
        min={0}
        step={0.1}
        onCommit={(v, merge) =>
          setInteractionAction(
            ix.id,
            update(v),
            merge ? { mergeKey: `ix:${ix.id}:duration` } : undefined,
          )
        }
      />
    </ParamRow>
  );

  return (
    <div className="flex flex-col gap-1 rounded border border-edge bg-panel-2/30 p-1.5">
      <div className="flex items-center gap-1">
        {scope.kind === "start" ? (
          <span className="px-1 text-xs text-ink">Start</span>
        ) : (
          <Dropdown
            button={<>{TRIGGER_LABELS[ix.trigger.type]} ▾</>}
            items={triggerItems}
          />
        )}
        <span className="text-xs text-ink-dim">→</span>
        <Dropdown
          button={<>{ACTION_LABELS[action.type]} ▾</>}
          items={actionTypeItems}
        />
        <span className="flex-1" />
        <button
          type="button"
          title="Delete interaction"
          className="text-ink-dim hover:text-red-400"
          onClick={() => removeInteraction(ix.id)}
        >
          ✕
        </button>
      </div>

      {action.type === "transition" && (
        <>
          <ParamRow label="To state">
            {statePicker(action.to, (to) =>
              setInteractionAction(ix.id, { ...action, to }),
            )}
          </ParamRow>
          {durationRow(action, (duration) => ({ ...action, duration }))}
          <ParamRow label="Ease">
            {easePicker(action.ease, (ease) =>
              setInteractionAction(ix.id, { ...action, ease }),
            )}
          </ParamRow>
        </>
      )}

      {action.type === "playAnimation" && (
        <ParamRow label="Clip">
          {clipList.length === 0 ? (
            <span className="text-[11px] text-ink-dim/70">no clips yet</span>
          ) : (
            <Dropdown
              button={<>{animations[action.animationId]?.name ?? "pick a clip"} ▾</>}
              items={clipList.map((c) => ({
                label: c.id === action.animationId ? `✓ ${c.name}` : c.name,
                onSelect: () =>
                  setInteractionAction(ix.id, { ...action, animationId: c.id }),
              }))}
            />
          )}
        </ParamRow>
      )}

      {action.type === "toggleStates" && (
        <>
          <ParamRow label="State A">
            {statePicker(action.a, (a) =>
              setInteractionAction(ix.id, { ...action, a }),
            )}
          </ParamRow>
          <ParamRow label="State B">
            {statePicker(action.b, (b) =>
              setInteractionAction(ix.id, { ...action, b }),
            )}
          </ParamRow>
          {durationRow(action, (duration) => ({ ...action, duration }))}
          <ParamRow label="Ease">
            {easePicker(action.ease, (ease) =>
              setInteractionAction(ix.id, { ...action, ease }),
            )}
          </ParamRow>
        </>
      )}
    </div>
  );
}
