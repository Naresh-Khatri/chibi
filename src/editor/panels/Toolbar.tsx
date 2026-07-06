"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Camera,
  Circle,
  CircleDot,
  Cone,
  Cylinder,
  Flashlight,
  FolderOpen,
  FileArchive,
  FileJson,
  Group,
  Lightbulb,
  Magnet,
  MousePointer2,
  Move3d,
  Play,
  Redo2,
  Rotate3d,
  Scale3d,
  Square,
  Sun,
  Torus,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  BASE_STATE_ID,
  GEOMETRY_DEFS,
  GEOMETRY_KINDS,
  type GeometryKind,
  type Vec3,
} from "@/runtime/schema";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDoc } from "../store/document";
import { useUI, type Tool } from "../store/ui";
import { addGroupNode, addLightNode, addMeshNode } from "../store/commands";
import { setDocCamera } from "../store/materialCommands";
import { exportCurrentDocument, importDocumentFromFile } from "../store/files";
import { saveImportedDocument } from "../store/persistence";
import { getOrbitControls } from "../viewport/objectRegistry";
import { Dropdown, type MenuItem } from "./controls";

export const GEOMETRY_ICONS: Record<GeometryKind, LucideIcon> = {
  box: Box,
  sphere: Circle,
  cylinder: Cylinder,
  cone: Cone,
  torus: Torus,
  plane: Square,
  text3d: Type,
};

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
      className="flex h-6 items-center gap-1.5 rounded-md bg-primary/20 px-2 text-xs text-primary transition-colors hover:bg-primary/30"
    >
      <CircleDot className="size-3" />
      {nodeName} · {stateName}
      <X className="size-3 opacity-70" />
    </button>
  );
}

const TOOLS: { tool: Tool; label: string; hint: string; icon: LucideIcon }[] = [
  { tool: "select", label: "Select", hint: "V", icon: MousePointer2 },
  { tool: "move", label: "Move", hint: "W", icon: Move3d },
  { tool: "rotate", label: "Rotate", hint: "E", icon: Rotate3d },
  { tool: "scale", label: "Scale", hint: "R", icon: Scale3d },
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
    {
      label: "Export .chibi.zip",
      icon: FileArchive,
      onSelect: () => exportCurrentDocument("zip"),
    },
    {
      label: "Export .chibi.json",
      icon: FileJson,
      onSelect: () => exportCurrentDocument("json"),
    },
    { divider: true },
    {
      label: "Open file…",
      icon: FolderOpen,
      onSelect: () => fileInputRef.current?.click(),
    },
  ];

  const addItems: MenuItem[] = [
    ...GEOMETRY_KINDS.map((kind) => ({
      label: GEOMETRY_DEFS[kind].label,
      icon: GEOMETRY_ICONS[kind],
      onSelect: () => addMeshNode(kind),
    })),
    { divider: true },
    { label: "Group", icon: Group, onSelect: addGroupNode },
    { divider: true },
    {
      label: "Directional light",
      icon: Sun,
      onSelect: () => addLightNode("directional"),
    },
    {
      label: "Point light",
      icon: Lightbulb,
      onSelect: () => addLightNode("point"),
    },
    {
      label: "Spot light",
      icon: Flashlight,
      onSelect: () => addLightNode("spot"),
    },
  ];

  return (
    <div className="flex h-12 items-center gap-1.5 border-b bg-card px-3">
      <div className="flex items-center gap-1.5">
        <Box className="size-4 text-primary" />
        <span className="text-sm font-semibold tracking-wide text-foreground">
          chibi
        </span>
      </div>
      <span className="max-w-40 truncate text-xs text-muted-foreground">
        {docName}
      </span>

      <Separator
        orientation="vertical"
        className="mx-1.5 data-[orientation=vertical]:h-5"
      />

      <Dropdown
        button={<>Add</>}
        items={addItems}
        title="Add object"
        triggerClassName="font-medium"
      />

      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        value={tool}
        onValueChange={(v) => v && setTool(v as Tool)}
        className="rounded-lg bg-muted/40 p-0.5"
      >
        {TOOLS.map((t) => (
          <Tooltip key={t.tool}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={t.tool}
                aria-label={t.label}
                className="h-6 min-w-7 aria-checked:bg-primary/20 aria-checked:text-primary"
              >
                <t.icon />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t.label} · {t.hint}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Toggle
        size="sm"
        pressed={snap}
        onPressedChange={toggleSnap}
        title="Snap (hold Ctrl while dragging)"
        className="h-6 gap-1 px-2 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
      >
        <Magnet className="size-3.5" />
        Snap
      </Toggle>

      <Separator
        orientation="vertical"
        className="mx-1.5 data-[orientation=vertical]:h-5"
      />

      <Button
        variant="ghost"
        size="icon-xs"
        title="Undo (Cmd/Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2 />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        title="Redo (Shift+Cmd/Ctrl+Z)"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2 />
      </Button>

      <div className="flex-1" />

      <ActiveStateChip />
      <Button
        variant="ghost"
        size="xs"
        title="Save the current view as the scene camera (used by Preview)"
        className="text-muted-foreground hover:text-foreground"
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
      >
        <Camera />
        Set camera
      </Button>
      <Button
        variant="secondary"
        size="xs"
        title="Preview the scene with interactions (Esc exits)"
        onClick={() => useUI.getState().setPreviewing(true)}
      >
        <Play />
        Preview
      </Button>
      <Dropdown button={<>File</>} items={fileItems} align="right" />
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
