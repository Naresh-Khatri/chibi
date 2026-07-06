"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
                ? "bg-muted text-foreground"
                : "bg-primary/20 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          onClick={() => {
            if (editingId !== row.id) setActiveState(row.id);
          }}
          onDoubleClick={() => {
            if (row.id !== BASE_STATE_ID) setEditingId(row.id);
          }}
        >
          <span className="grid w-3 place-items-center">
            {row.id === activeHere && (
              <span className="size-1.5 rounded-full bg-primary" />
            )}
          </span>
          {editingId === row.id ? (
            <input
              autoFocus
              defaultValue={row.name}
              className="w-full min-w-0 rounded bg-muted px-1 text-xs text-foreground outline-none ring-1 ring-primary"
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
              className="hidden text-muted-foreground hover:text-destructive group-hover:block"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(row.id);
              }}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        size="xs"
        className="self-start"
        onClick={() => addState(nodeId)}
      >
        <Plus />
        Add state
      </Button>
    </div>
  );
}
