"use client";

import { ArrowUpFromLine, Check, Dot, Minus, Scissors, Trash2, Triangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUI, type ElementMode } from "../store/ui";
import { deleteSelectedFaces, extrudeSelectedFaces } from "../store/meshCommands";

// hotkey hints mirror useShortcuts (1/2/3) so the panel doubles as a legend
const ELEMENT_MODES: {
  mode: ElementMode;
  label: string;
  hotkey: string;
  icon: typeof Dot;
}[] = [
  { mode: "vertex", label: "Vertex", hotkey: "1", icon: Dot },
  { mode: "edge", label: "Edge", hotkey: "2", icon: Minus },
  { mode: "face", label: "Face", hotkey: "3", icon: Triangle },
];

// per-mode selection count, so the header reads "3 faces" etc. without the
// panel needing to know which set is authoritative for the active mode
function selectedCount(mode: ElementMode, sel: {
  vertices: Set<number>;
  edges: Set<string>;
  faces: Set<number>;
}) {
  if (mode === "vertex") return sel.vertices.size;
  if (mode === "edge") return sel.edges.size;
  return sel.faces.size;
}

/**
 * Floating helper toolbar shown at the top of the viewport while a node is in
 * mesh-edit mode — surfaces the element-mode toggle and contextual face ops
 * front-and-center instead of burying them in the right-hand Inspector.
 */
export function MeshEditToolbar() {
  const nodeId = useUI((s) => s.meshEditNodeId);
  const elementMode = useUI((s) => s.elementMode);
  const selection = useUI((s) => s.meshSelection);
  const setElementMode = useUI((s) => s.setElementMode);
  const exitMeshEdit = useUI((s) => s.exitMeshEdit);
  const cutActive = useUI((s) => s.meshCutActive);
  const setMeshCutActive = useUI((s) => s.setMeshCutActive);

  if (!nodeId) return null;

  const count = selectedCount(elementMode, selection);
  const showFaceOps = elementMode === "face" && selection.faces.size > 0 && !cutActive;
  const activeMode = ELEMENT_MODES.find((m) => m.mode === elementMode);

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-card/95 px-2 py-1.5 shadow-xl backdrop-blur">
      <span className="pl-1 pr-0.5 text-[11px] font-medium text-muted-foreground">
        Edit Mesh
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        value={elementMode}
        onValueChange={(v) => v && setElementMode(v as ElementMode)}
        className="rounded-lg bg-muted/40 p-0.5"
      >
        {ELEMENT_MODES.map((m) => (
          <ToggleGroupItem
            key={m.mode}
            value={m.mode}
            aria-label={m.label}
            title={`${m.label} (${m.hotkey})`}
            className="h-6 gap-1 px-2 aria-checked:bg-primary/20 aria-checked:text-primary"
          >
            <m.icon className="size-3.5" />
            <span className="text-[11px]">{m.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <span className="min-w-16 text-[11px] tabular-nums text-muted-foreground">
        {cutActive
          ? "Hover an edge · click to slice"
          : count > 0
            ? `${count} ${activeMode?.label.toLowerCase()}${count > 1 ? "s" : ""}`
            : "None selected"}
      </span>

      {/* Cut (loop cut) — always available; hover the mesh to preview a ring
          cut, click to slice. direction follows the nearest edge. */}
      <div className="flex items-center gap-1 border-l pl-2">
        <Button
          variant={cutActive ? "default" : "secondary"}
          size="xs"
          title="Cut tool (C) — hover the mesh, click to slice a loop"
          onClick={() => setMeshCutActive(!cutActive)}
        >
          <Scissors />
          Cut
        </Button>
      </div>

      {showFaceOps && (
        <div className="flex items-center gap-1 border-l pl-2">
          <Button
            variant="secondary"
            size="xs"
            title="Extrude selected faces"
            onClick={() => extrudeSelectedFaces(nodeId)}
          >
            <ArrowUpFromLine />
            Extrude
          </Button>
          <Button
            variant="secondary"
            size="xs"
            title="Delete selected faces (Del)"
            onClick={() => deleteSelectedFaces(nodeId)}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      )}

      <Button
        variant="secondary"
        size="xs"
        className="ml-1"
        title="Finish editing (Esc)"
        onClick={() => exitMeshEdit()}
      >
        <Check />
        Done
      </Button>
    </div>
  );
}
