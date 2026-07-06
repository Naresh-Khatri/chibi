"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_STATE_ID } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  addState,
  deleteState,
  renameState,
  stateReferenceCount,
} from "../store/stateCommands";

// non-base active = edits record overrides, not document edits, so the
// trigger button is accented as a mode indicator. double-click a row renames
export function StatesMenu() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const states = useDoc((s) => s.doc?.states);
  const activeStateId = useUI((s) => s.activeStateId);
  const setActiveState = useUI((s) => s.setActiveState);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!states) return null;
  const activeName = states[activeStateId]?.name ?? "Base";
  const editingBase = activeStateId === BASE_STATE_ID;

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="States — edits record into the active state"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1 rounded px-2 text-xs ${
          editingBase
            ? open
              ? "bg-panel-2 text-ink"
              : "text-ink hover:bg-panel-2"
            : "bg-accent/25 text-accent"
        }`}
      >
        State: {activeName} ▾
      </button>
      {open && (
        <div className="absolute top-8 left-0 z-50 min-w-48 rounded-md border border-edge bg-panel py-1 shadow-xl">
          {Object.values(states).map((state) => (
            <div
              key={state.id}
              className={`group flex h-7 cursor-default items-center gap-1.5 px-2 text-xs ${
                state.id === activeStateId
                  ? "bg-accent/20 text-ink"
                  : "text-ink hover:bg-panel-2"
              }`}
              onClick={() => {
                if (editingId !== state.id) {
                  setActiveState(state.id);
                  setOpen(false);
                }
              }}
              onDoubleClick={() => {
                if (state.id !== BASE_STATE_ID) setEditingId(state.id);
              }}
            >
              <span className="w-3 text-accent">
                {state.id === activeStateId ? "✓" : ""}
              </span>
              {editingId === state.id ? (
                <input
                  autoFocus
                  defaultValue={state.name}
                  className="w-full min-w-0 rounded bg-panel-2 px-1 text-xs text-ink outline-none ring-1 ring-accent"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    renameState(state.id, e.currentTarget.value);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <span className="flex-1 truncate" title="Double-click to rename">
                  {state.name}
                </span>
              )}
              {state.id !== BASE_STATE_ID && editingId !== state.id && (
                <button
                  type="button"
                  title="Delete state"
                  className="hidden text-ink-dim hover:text-red-400 group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(state.id);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="my-1 border-t border-edge" />
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-panel-2"
            onClick={() => {
              addState();
              setOpen(false);
            }}
          >
            + Add state
          </button>
        </div>
      )}
    </div>
  );
}
