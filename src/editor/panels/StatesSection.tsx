"use client";

import { useState } from "react";
import { BASE_STATE_ID } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  addState,
  deleteState,
  renameState,
  stateReferenceCount,
} from "../store/stateCommands";

// per-object state list in the inspector. activating a row makes edits to
// this node (and its material) record overrides into that state; Base = edit
// the document. double-click a row renames
export function StatesSection({ nodeId }: { nodeId: string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const states = useDoc((s) => s.doc?.states);
  const activeStateId = useUI((s) => s.activeStateId);
  const setActiveState = useUI((s) => s.setActiveState);
  if (!states) return null;

  const own = Object.values(states).filter((s) => s.nodeId === nodeId);
  // a state of another node being active still renders THIS node at base
  const activeHere =
    states[activeStateId]?.nodeId === nodeId ? activeStateId : BASE_STATE_ID;
  const rows = [{ id: BASE_STATE_ID, name: "Base" }, ...own];

  const onDelete = (id: string) => {
    const refs = stateReferenceCount(id);
    if (
      refs > 0 &&
      !window.confirm(
        `"${states[id]?.name}" is used by ${refs} interaction${refs > 1 ? "s" : ""}. Delete the state and those interactions?`,
      )
    ) {
      return;
    }
    deleteState(id);
  };

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`group flex h-6 cursor-default items-center gap-1.5 rounded px-1.5 text-xs ${
            row.id === activeHere
              ? row.id === BASE_STATE_ID
                ? "bg-panel-2 text-ink"
                : "bg-accent/20 text-ink"
              : "text-ink-dim hover:bg-panel-2 hover:text-ink"
          }`}
          onClick={() => {
            if (editingId !== row.id) setActiveState(row.id);
          }}
          onDoubleClick={() => {
            if (row.id !== BASE_STATE_ID) setEditingId(row.id);
          }}
        >
          <span className="w-3 text-accent">
            {row.id === activeHere ? "●" : ""}
          </span>
          {editingId === row.id ? (
            <input
              autoFocus
              defaultValue={row.name}
              className="w-full min-w-0 rounded bg-panel-2 px-1 text-xs text-ink outline-none ring-1 ring-accent"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameState(row.id, e.currentTarget.value);
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <span
              className="flex-1 truncate"
              title={row.id === BASE_STATE_ID ? undefined : "Double-click to rename"}
            >
              {row.name}
            </span>
          )}
          {row.id !== BASE_STATE_ID && editingId !== row.id && (
            <button
              type="button"
              title="Delete state"
              className="hidden text-ink-dim hover:text-red-400 group-hover:block"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.id);
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => addState(nodeId)}
        className="h-6 self-start rounded bg-panel-2 px-2 text-xs text-ink hover:bg-panel-2/70"
      >
        + Add state
      </button>
    </div>
  );
}
