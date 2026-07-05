"use client";

import { GEOMETRY_DEFS, GEOMETRY_KINDS } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI, type Tool } from "../store/ui";
import { addGroupNode, addLightNode, addMeshNode } from "../store/commands";
import { Dropdown, type MenuItem } from "./controls";

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: "select", label: "Select", hint: "V" },
  { tool: "move", label: "Move", hint: "W" },
  { tool: "rotate", label: "Rotate", hint: "E" },
  { tool: "scale", label: "Scale", hint: "R" },
];

export function Toolbar() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const snap = useUI((s) => s.snap);
  const toggleSnap = useUI((s) => s.toggleSnap);
  const docName = useDoc((s) => s.doc?.name ?? "");
  const canUndo = useDoc((s) => s.undoStack.length > 0);
  const canRedo = useDoc((s) => s.redoStack.length > 0);
  const undo = useDoc((s) => s.undo);
  const redo = useDoc((s) => s.redo);

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

      <Dropdown button={<>States ▾</>} items={[]} disabled title="States arrive in M5" />
      <button
        type="button"
        disabled
        title="Preview arrives in M5"
        className="h-7 cursor-not-allowed rounded px-2 text-xs text-ink-dim/50"
      >
        ▶ Preview
      </button>
      <Dropdown
        button={<>Export ▾</>}
        items={[]}
        disabled
        title="Export arrives in M3"
        align="right"
      />
    </div>
  );
}
