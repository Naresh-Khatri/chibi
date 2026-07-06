"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BASE_STATE_ID,
  GEOMETRY_DEFS,
  GEOMETRY_KINDS,
  type Vec3,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI, type Tool } from "../store/ui";
import { addGroupNode, addLightNode, addMeshNode } from "../store/commands";
import { setDocCamera } from "../store/materialCommands";
import { exportCurrentDocument, importDocumentFromFile } from "../store/files";
import { saveImportedDocument } from "../store/persistence";
import { getOrbitControls } from "../viewport/objectRegistry";
import { Dropdown, type MenuItem } from "./controls";

// mode indicator: which object state edits currently record into (states are
// per-object; activate one in the inspector's States section)
function ActiveStateChip() {
  const activeStateId = useUI((s) => s.activeStateId);
  const setActiveState = useUI((s) => s.setActiveState);
  const stateName = useDoc((s) => s.doc?.states[activeStateId]?.name);
  const nodeName = useDoc((s) => {
    const state = s.doc?.states[activeStateId];
    return state ? s.doc?.nodes[state.nodeId]?.name : undefined;
  });
  if (activeStateId === BASE_STATE_ID || !stateName) return null;
  return (
    <button
      type="button"
      title="Edits record into this state — click to return to Base"
      onClick={() => setActiveState(BASE_STATE_ID)}
      className="flex h-7 items-center gap-1.5 rounded bg-accent/25 px-2 text-xs text-accent"
    >
      ● {nodeName} · {stateName}
      <span className="text-accent/70">✕</span>
    </button>
  );
}

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: "select", label: "Select", hint: "V" },
  { tool: "move", label: "Move", hint: "W" },
  { tool: "rotate", label: "Rotate", hint: "E" },
  { tool: "scale", label: "Scale", hint: "R" },
];

export function Toolbar() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const snap = useUI((s) => s.snap);
  const toggleSnap = useUI((s) => s.toggleSnap);
  const docName = useDoc((s) => s.doc?.name ?? "");
  const canUndo = useDoc((s) => s.undoStack.length > 0);
  const canRedo = useDoc((s) => s.redoStack.length > 0);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);

  const fileItems: MenuItem[] = [
    { label: "Export .chibi.zip", onSelect: () => exportCurrentDocument("zip") },
    { label: "Export .chibi.json", onSelect: () => exportCurrentDocument("json") },
    { divider: true },
    { label: "Open file…", onSelect: () => fileInputRef.current?.click() },
  ];

  const addItems: MenuItem[] = [
    ...GEOMETRY_KINDS.map((kind) => ({
      label: GEOMETRY_DEFS[kind].label,
      onSelect: () => addMeshNode(kind),
    })),
    { divider: true },
    { label: "Group", onSelect: addGroupNode },
    { divider: true },
    { label: "Directional light", onSelect: () => addLightNode("directional") },
    { label: "Point light", onSelect: () => addLightNode("point") },
    { label: "Spot light", onSelect: () => addLightNode("spot") },
  ];

  return (
    <div className="flex h-12 items-center gap-2 border-b border-edge bg-panel px-3">
      <span className="text-sm font-semibold tracking-wide text-ink">
        chibi
      </span>
      <span className="max-w-40 truncate text-xs text-ink-dim">{docName}</span>

      <div className="mx-2 h-5 border-l border-edge" />

      <Dropdown button={<>Add ▾</>} items={addItems} title="Add object" />

      <div className="mx-1 flex items-center gap-0.5 rounded bg-panel-2/60 p-0.5">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            title={`${t.label} (${t.hint})`}
            onClick={() => setTool(t.tool)}
            className={`h-6 rounded px-2 text-xs ${
              tool === t.tool
                ? "bg-accent/25 text-accent"
                : "text-ink-dim hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        title="Snap (hold Ctrl while dragging)"
        onClick={toggleSnap}
        className={`h-7 rounded px-2 text-xs ${
          snap ? "bg-accent/25 text-accent" : "text-ink-dim hover:text-ink"
        }`}
      >
        Snap
      </button>

      <div className="mx-1 h-5 border-l border-edge" />

      <button
        type="button"
        title="Undo (Cmd/Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
        className="h-7 rounded px-2 text-sm text-ink hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-ink-dim/40"
      >
        ↺
      </button>
      <button
        type="button"
        title="Redo (Shift+Cmd/Ctrl+Z)"
        disabled={!canRedo}
        onClick={redo}
        className="h-7 rounded px-2 text-sm text-ink hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-ink-dim/40"
      >
        ↻
      </button>

      <div className="flex-1" />

      <ActiveStateChip />
      <button
        type="button"
        title="Save the current view as the scene camera (used by Preview)"
        onClick={() => {
          const controls = getOrbitControls();
          if (!controls) return;
          setDocCamera({
            position: controls.object.position.toArray() as Vec3,
            target: controls.target.toArray() as Vec3,
            fov: controls.object.fov,
          });
          useUI.getState().showToast("Scene camera set from view");
        }}
        className="h-7 rounded px-2 text-xs text-ink-dim hover:bg-panel-2 hover:text-ink"
      >
        ⌖ Set camera
      </button>
      <button
        type="button"
        title="Preview the scene with interactions (Esc exits)"
        onClick={() => useUI.getState().setPreviewing(true)}
        className="h-7 rounded px-2 text-xs text-ink hover:bg-panel-2"
      >
        ▶ Preview
      </button>
      <Dropdown button={<>File ▾</>} items={fileItems} align="right" />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zip"
        className="hidden"
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          try {
            const doc = await importDocumentFromFile(file);
            const docId = await saveImportedDocument(doc);
            router.push(`/editor/${docId}`);
          } catch (err) {
            useUI
              .getState()
              .showToast(
                err instanceof Error ? err.message : "Import failed",
              );
          }
        }}
      />
    </div>
  );
}
