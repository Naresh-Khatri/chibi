"use client";

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BASE_STATE_ID,
  type Action,
  type AnimationClip,
  type ChibiNode,
  type Easing,
  type Interaction,
  type ObjectState,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import {
  addInteraction,
  removeInteraction,
  setInteractionAction,
  setInteractionTrigger,
} from "../store/stateCommands";
import { DragNumber, Dropdown, Slider, type MenuItem } from "./controls";

const EASE_OPTIONS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

const TRIGGER_LABELS: Record<string, string> = {
  start: "Start",
  click: "Click",
  hoverEnter: "Hover enter",
  hoverExit: "Hover exit",
  scroll: "Scroll",
};

const ACTION_LABELS: Record<Action["type"], string> = {
  transition: "Transition",
  playAnimation: "Play animation",
  toggleStates: "Toggle states",
};

/** node scope = that node's pointer triggers; "start" = document-level */
export type InteractionScope = { kind: "node"; nodeId: string } | { kind: "start" };

// states are per-object: default to the trigger node when it has states, else
// the first object that does
function defaultStateTarget(
  scope: InteractionScope,
  states: Record<string, ObjectState>,
): { nodeId: string; firstState: string } {
  const list = Object.values(states);
  const scopeNode = scope.kind === "node" ? scope.nodeId : undefined;
  const nodeId =
    (scopeNode && list.some((s) => s.nodeId === scopeNode)
      ? scopeNode
      : undefined) ??
    list[0]?.nodeId ??
    scopeNode ??
    "";
  return {
    nodeId,
    firstState: list.find((s) => s.nodeId === nodeId)?.id ?? BASE_STATE_ID,
  };
}

export function InteractionList({ scope }: { scope: InteractionScope }) {
  const interactions = useDoc((s) => s.doc?.interactions);
  const states = useDoc((s) => s.doc?.states);
  const animations = useDoc((s) => s.doc?.animations);
  const nodes = useDoc((s) => s.doc?.nodes);
  if (!interactions || !states || !animations || !nodes) return null;

  // scroll triggers are scene-level (no nodeId), same as start
  const rows = interactions.filter((ix) =>
    scope.kind === "start"
      ? ix.trigger.type === "start" || ix.trigger.type === "scroll"
      : ix.trigger.type !== "start" &&
        ix.trigger.type !== "scroll" &&
        ix.trigger.nodeId === scope.nodeId,
  );

  const add = () => {
    const target = defaultStateTarget(scope, states);
    addInteraction(
      scope.kind === "start"
        ? { type: "start" }
        : { type: "click", nodeId: scope.nodeId },
      {
        type: "transition",
        nodeId: target.nodeId,
        to: target.firstState,
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
          nodes={nodes}
        />
      ))}
      {rows.length === 0 && (
        <div className="text-[11px] text-muted-foreground/70">
          {scope.kind === "start"
            ? "Nothing runs on scene start yet."
            : "No interactions on this object yet."}
        </div>
      )}
      <Button variant="secondary" size="xs" className="self-start" onClick={add}>
        <Plus />
        Add interaction
      </Button>
    </div>
  );
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function InteractionRow({
  ix,
  scope,
  states,
  animations,
  nodes,
}: {
  ix: Interaction;
  scope: InteractionScope;
  states: Record<string, ObjectState>;
  animations: Record<string, AnimationClip>;
  nodes: Record<string, ChibiNode>;
}) {
  const action = ix.action;
  const stateList = Object.values(states);
  const clipList = Object.values(animations);
  const statefulNodeIds = [...new Set(stateList.map((s) => s.nodeId))];
  const firstStateOf = (nodeId: string) =>
    stateList.find((s) => s.nodeId === nodeId)?.id ?? BASE_STATE_ID;

  const triggerItems: MenuItem[] =
    scope.kind === "node"
      ? (["click", "hoverEnter", "hoverExit"] as const).map((type) => ({
          label: TRIGGER_LABELS[type],
          checked: type === ix.trigger.type,
          onSelect: () =>
            setInteractionTrigger(ix.id, { type, nodeId: scope.nodeId }),
        }))
      : (["start", "scroll"] as const).map((type) => ({
          label: TRIGGER_LABELS[type],
          checked: type === ix.trigger.type,
          onSelect: () =>
            setInteractionTrigger(
              ix.id,
              type === "start" ? { type: "start" } : { type: "scroll", progress: 0.5 },
            ),
        }));

  const target = defaultStateTarget(scope, states);
  const actionTypeItems: MenuItem[] = [
    {
      label: ACTION_LABELS.transition,
      checked: action.type === "transition",
      onSelect: () =>
        action.type !== "transition" &&
        setInteractionAction(ix.id, {
          type: "transition",
          nodeId: target.nodeId,
          to: target.firstState,
          duration: 0.4,
          ease: "easeOut",
        }),
    },
    {
      label: ACTION_LABELS.playAnimation,
      checked: action.type === "playAnimation",
      onSelect: () =>
        action.type !== "playAnimation" &&
        setInteractionAction(ix.id, {
          type: "playAnimation",
          animationId: clipList[0]?.id ?? "",
        }),
    },
    {
      label: ACTION_LABELS.toggleStates,
      checked: action.type === "toggleStates",
      onSelect: () =>
        action.type !== "toggleStates" &&
        setInteractionAction(ix.id, {
          type: "toggleStates",
          nodeId: target.nodeId,
          a: BASE_STATE_ID,
          b: target.firstState,
          duration: 0.4,
          ease: "easeOut",
        }),
    },
  ];

  const objectPicker = (value: string, onPick: (nodeId: string) => void) => {
    // stateful nodes + the current pick (kept even if its states were deleted)
    const ids =
      !value || statefulNodeIds.includes(value)
        ? statefulNodeIds
        : [value, ...statefulNodeIds];
    if (ids.length === 0) {
      return (
        <span className="text-[11px] text-muted-foreground/70">no objects with states yet</span>
      );
    }
    return (
      <Dropdown
        button={<>{nodes[value]?.name ?? "pick an object"}</>}
        items={ids.map((id) => ({
          label: nodes[id]?.name ?? id,
          checked: id === value,
          onSelect: () => onPick(id),
        }))}
      />
    );
  };

  const statePicker = (
    nodeId: string,
    value: string,
    onPick: (id: string) => void,
  ) => {
    const options = [
      { id: BASE_STATE_ID, name: "Base" },
      ...stateList.filter((s) => s.nodeId === nodeId),
    ];
    const label =
      value === BASE_STATE_ID ? "Base" : (states[value]?.name ?? "missing state");
    return (
      <Dropdown
        button={<>{label}</>}
        items={options.map((s) => ({
          label: s.name,
          checked: s.id === value,
          onSelect: () => onPick(s.id),
        }))}
      />
    );
  };

  const easePicker = (value: Easing, onPick: (e: Easing) => void) => (
    <Dropdown
      button={<>{value}</>}
      items={EASE_OPTIONS.map((e) => ({
        label: e,
        checked: e === value,
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
    <div className="flex flex-col gap-1 rounded border border-border bg-muted/30 p-1.5">
      <div className="flex items-center gap-1">
        <Dropdown
          button={<>{TRIGGER_LABELS[ix.trigger.type]}</>}
          items={triggerItems}
        />
        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
        <Dropdown
          button={<>{ACTION_LABELS[action.type]}</>}
          items={actionTypeItems}
        />
        <span className="flex-1" />
        <button
          type="button"
          title="Delete interaction"
          className="text-muted-foreground transition-colors hover:text-destructive"
          onClick={() => removeInteraction(ix.id)}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {ix.trigger.type === "scroll" && (
        <ParamRow label="At">
          <Slider
            value={ix.trigger.progress}
            min={0}
            max={1}
            step={0.01}
            onCommit={(v, merge) =>
              setInteractionTrigger(
                ix.id,
                { type: "scroll", progress: v },
                merge ? { mergeKey: `ix:${ix.id}:scrollAt` } : undefined,
              )
            }
          />
        </ParamRow>
      )}

      {action.type === "transition" && (
        <>
          <ParamRow label="Object">
            {objectPicker(action.nodeId, (nodeId) =>
              setInteractionAction(ix.id, {
                ...action,
                nodeId,
                to: firstStateOf(nodeId),
              }),
            )}
          </ParamRow>
          <ParamRow label="To state">
            {statePicker(action.nodeId, action.to, (to) =>
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
            <span className="text-[11px] text-muted-foreground/70">no clips yet</span>
          ) : (
            <Dropdown
              button={<>{animations[action.animationId]?.name ?? "pick a clip"}</>}
              items={clipList.map((c) => ({
                label: c.name,
                checked: c.id === action.animationId,
                onSelect: () =>
                  setInteractionAction(ix.id, { ...action, animationId: c.id }),
              }))}
            />
          )}
        </ParamRow>
      )}

      {action.type === "toggleStates" && (
        <>
          <ParamRow label="Object">
            {objectPicker(action.nodeId, (nodeId) =>
              setInteractionAction(ix.id, {
                ...action,
                nodeId,
                a: BASE_STATE_ID,
                b: firstStateOf(nodeId),
              }),
            )}
          </ParamRow>
          <ParamRow label="State A">
            {statePicker(action.nodeId, action.a, (a) =>
              setInteractionAction(ix.id, { ...action, a }),
            )}
          </ParamRow>
          <ParamRow label="State B">
            {statePicker(action.nodeId, action.b, (b) =>
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
