"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BASE_STATE_ID,
  type AnimationClip,
  type ChibiNode,
  type Easing,
  type ObjectState,
  type ScrollBinding,
  type ScrollBindingTarget,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import {
  addScrollBinding,
  removeScrollBinding,
  setScrollBindingEase,
  setScrollBindingRange,
  setScrollBindingTarget,
} from "../store/scrollCommands";
import { DragNumber, Dropdown, type MenuItem } from "./controls";

const EASE_OPTIONS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// scroll-scrub bindings UI — sibling to the discrete `scroll` trigger above.
// see docs/specs/13-scroll-interactions.md
export function ScrollBindingList() {
  const bindings = useDoc((s) => s.doc?.scrollBindings);
  const states = useDoc((s) => s.doc?.states);
  const animations = useDoc((s) => s.doc?.animations);
  const nodes = useDoc((s) => s.doc?.nodes);
  if (!bindings || !states || !animations || !nodes) return null;

  const clipList = Object.values(animations);
  const stateList = Object.values(states);

  const add = () => {
    const target: ScrollBindingTarget =
      stateList.length > 0
        ? { type: "state", nodeId: stateList[0].nodeId, stateId: stateList[0].id }
        : { type: "animation", animationId: clipList[0]?.id ?? "" };
    addScrollBinding(target);
  };

  const canAdd = stateList.length > 0 || clipList.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      {bindings.map((binding) => (
        <ScrollBindingRow
          key={binding.id}
          binding={binding}
          states={states}
          animations={animations}
          nodes={nodes}
        />
      ))}
      {bindings.length === 0 && (
        <div className="text-[11px] text-muted-foreground/70">
          No scroll-scrubbed animations or states yet.
        </div>
      )}
      <Button
        variant="secondary"
        size="xs"
        className="self-start"
        disabled={!canAdd}
        title={canAdd ? undefined : "Add a state or animation clip first"}
        onClick={add}
      >
        <Plus />
        Add scroll binding
      </Button>
    </div>
  );
}

function ScrollBindingRow({
  binding,
  states,
  animations,
  nodes,
}: {
  binding: ScrollBinding;
  states: Record<string, ObjectState>;
  animations: Record<string, AnimationClip>;
  nodes: Record<string, ChibiNode>;
}) {
  const target = binding.target;
  const stateList = Object.values(states);
  const clipList = Object.values(animations);
  const statefulNodeIds = [...new Set(stateList.map((s) => s.nodeId))];

  const targetTypeItems: MenuItem[] = [
    {
      label: "Animation",
      checked: target.type === "animation",
      onSelect: () =>
        target.type !== "animation" &&
        setScrollBindingTarget(binding.id, {
          type: "animation",
          animationId: clipList[0]?.id ?? "",
        }),
    },
    {
      label: "State",
      checked: target.type === "state",
      onSelect: () =>
        target.type !== "state" &&
        stateList[0] &&
        setScrollBindingTarget(binding.id, {
          type: "state",
          nodeId: stateList[0].nodeId,
          stateId: stateList[0].id,
        }),
    },
  ];

  const rangeRow = (
    <ParamRow label="Range">
      <div className="flex flex-1 items-center gap-1.5">
        <DragNumber
          value={binding.start}
          min={0}
          max={1}
          step={0.01}
          onCommit={(v, merge) =>
            setScrollBindingRange(
              binding.id,
              { start: v },
              merge ? { mergeKey: `sb:${binding.id}:start` } : undefined,
            )
          }
        />
        <span className="text-[11px] text-muted-foreground/70">to</span>
        <DragNumber
          value={binding.end}
          min={0}
          max={1}
          step={0.01}
          onCommit={(v, merge) =>
            setScrollBindingRange(
              binding.id,
              { end: v },
              merge ? { mergeKey: `sb:${binding.id}:end` } : undefined,
            )
          }
        />
      </div>
    </ParamRow>
  );

  const easeRow = (
    <ParamRow label="Ease">
      <Dropdown
        button={<>{binding.ease}</>}
        items={EASE_OPTIONS.map((e) => ({
          label: e,
          checked: e === binding.ease,
          onSelect: () => setScrollBindingEase(binding.id, e),
        }))}
      />
    </ParamRow>
  );

  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-muted/30 p-1.5">
      <div className="flex items-center gap-1">
        <Dropdown button={<>{target.type === "animation" ? "Animation" : "State"}</>} items={targetTypeItems} />
        <span className="flex-1" />
        <button
          type="button"
          title="Delete scroll binding"
          className="text-muted-foreground transition-colors hover:text-destructive"
          onClick={() => removeScrollBinding(binding.id)}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {target.type === "animation" && (
        <ParamRow label="Clip">
          {clipList.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/70">no clips yet</span>
          ) : (
            <Dropdown
              button={<>{animations[target.animationId]?.name ?? "pick a clip"}</>}
              items={clipList.map((c) => ({
                label: c.name,
                checked: c.id === target.animationId,
                onSelect: () =>
                  setScrollBindingTarget(binding.id, { type: "animation", animationId: c.id }),
              }))}
            />
          )}
        </ParamRow>
      )}

      {target.type === "state" && (
        <>
          <ParamRow label="Object">
            {statefulNodeIds.length === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">no objects with states yet</span>
            ) : (
              <Dropdown
                button={<>{nodes[target.nodeId]?.name ?? "pick an object"}</>}
                items={statefulNodeIds.map((id) => ({
                  label: nodes[id]?.name ?? id,
                  checked: id === target.nodeId,
                  onSelect: () => {
                    const firstState =
                      stateList.find((s) => s.nodeId === id)?.id ?? BASE_STATE_ID;
                    setScrollBindingTarget(binding.id, {
                      type: "state",
                      nodeId: id,
                      stateId: firstState,
                    });
                  },
                }))}
              />
            )}
          </ParamRow>
          <ParamRow label="To state">
            <Dropdown
              button={<>{states[target.stateId]?.name ?? "missing state"}</>}
              items={stateList
                .filter((s) => s.nodeId === target.nodeId)
                .map((s) => ({
                  label: s.name,
                  checked: s.id === target.stateId,
                  onSelect: () =>
                    setScrollBindingTarget(binding.id, {
                      type: "state",
                      nodeId: target.nodeId,
                      stateId: s.id,
                    }),
                }))}
            />
          </ParamRow>
        </>
      )}

      {rangeRow}
      {easeRow}
    </div>
  );
}
