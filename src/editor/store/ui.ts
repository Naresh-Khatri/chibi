import { create } from "zustand";
import { useMeshPreview } from "./meshEditPreview";

export type Tool = "select" | "move" | "rotate" | "scale";

// "paused" previews the sampled pose at the playhead; "stopped" means the
// viewport shows plain document values (playback restores them on stop).
export type Playback = "stopped" | "playing" | "paused";

// mesh-edit sub-mode (Phase 3): which kind of cage element clicks/drags pick
export type ElementMode = "vertex" | "edge" | "face";

// replaced wholesale on every change, never mutated in place (zustand identity)
export type MeshSelection = {
  vertices: Set<number>;
  edges: Set<string>; // topology edgeKey, "${min}_${max}"
  faces: Set<number>;
};

export type HoveredElement =
  | { mode: "vertex"; index: number }
  | { mode: "edge"; key: string }
  | { mode: "face"; index: number };

function emptyMeshSelection(): MeshSelection {
  return { vertices: new Set(), edges: new Set(), faces: new Set() };
}

// fields that reset mesh-edit mode — shared by exitMeshEdit and by
// select/selectMany when the new selection drops the node being edited
function meshEditExitState() {
  return {
    meshEditNodeId: null,
    meshSelection: emptyMeshSelection(),
    hoveredElement: null,
    meshCutActive: false,
  };
}

type UIState = {
  tool: Tool;
  selectedId: string | null;
  // full selection (AI select_nodes can select many); selectedId is the
  // primary — gizmo/inspector stay single-selection
  selectedIds: string[];
  snap: boolean;
  timelineOpen: boolean;
  hierarchyOpen: boolean;
  inspectorOpen: boolean;
  aiChatOpen: boolean;
  materialCardOpen: boolean;
  materialCardPinnedId: string | null;
  toast: string | null;
  activeClipId: string | null;
  playback: Playback;
  playhead: number;
  // which document state edits record into ("base" = edit the document)
  activeStateId: string;
  previewing: boolean;
  inspectorTab: "design" | "interactions";
  // mesh-edit sub-mode: editing one node's cage in-place (null = not editing)
  meshEditNodeId: string | null;
  elementMode: ElementMode;
  meshSelection: MeshSelection;
  hoveredElement: HoveredElement | null;
  // loop-cut tool active within mesh-edit — hover previews a ring cut, click
  // commits. mutually exclusive with the transform gizmo (it hides).
  meshCutActive: boolean;
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  toggleSnap: () => void;
  toggleTimeline: () => void;
  toggleHierarchy: () => void;
  toggleInspector: () => void;
  toggleAiChat: () => void;
  setActiveClip: (id: string | null) => void;
  setPlayhead: (t: number) => void;
  togglePlay: () => void;
  stopPlayback: () => void;
  setActiveState: (id: string) => void;
  setPreviewing: (on: boolean) => void;
  showToast: (message: string) => void;
  setInspectorTab: (tab: "design" | "interactions") => void;
  openNodeInteractions: (id: string) => void;
  enterMeshEdit: (nodeId: string) => void;
  exitMeshEdit: () => void;
  setElementMode: (mode: ElementMode) => void;
  setMeshSelection: (selection: MeshSelection) => void;
  setHoveredElement: (el: HoveredElement | null) => void;
  setMeshCutActive: (on: boolean) => void;
  openMaterialCard: (materialId?: string) => void;
  closeMaterialCard: () => void;
};

const TOAST_MS = 4000;

export const useUI = create<UIState>()((set, get) => ({
  tool: "move",
  selectedId: null,
  selectedIds: [],
  snap: false,
  timelineOpen: false,
  hierarchyOpen: true,
  inspectorOpen: true,
  aiChatOpen: false,
  materialCardOpen: false,
  materialCardPinnedId: null,
  toast: null,
  activeClipId: null,
  playback: "stopped",
  playhead: 0,
  activeStateId: "base",
  previewing: false,
  inspectorTab: "design",
  meshEditNodeId: null,
  elementMode: "vertex",
  meshSelection: emptyMeshSelection(),
  hoveredElement: null,
  meshCutActive: false,
  setTool: (tool) => set({ tool }),
  select: (selectedId) => {
    const selectedIds = selectedId ? [selectedId] : [];
    // selection moved off the edited node (or was cleared) — exit mesh edit
    // so the cage overlay doesn't outlive the node it was editing
    const { meshEditNodeId } = get();
    const exitingMeshEdit =
      meshEditNodeId !== null && !selectedIds.includes(meshEditNodeId);
    if (exitingMeshEdit) useMeshPreview.getState().setPreview(null);
    set({
      selectedId,
      selectedIds,
      // drop pin so the card follows the new selection (or hides on deselect)
      // vs staying stuck on a material pinned from a prior group/scene list
      materialCardPinnedId: null,
      ...(exitingMeshEdit ? meshEditExitState() : null),
    });
  },
  selectMany: (ids) => {
    const { meshEditNodeId } = get();
    const exitingMeshEdit = meshEditNodeId !== null && !ids.includes(meshEditNodeId);
    if (exitingMeshEdit) useMeshPreview.getState().setPreview(null);
    set({
      selectedIds: ids,
      selectedId: ids[0] ?? null,
      materialCardPinnedId: null,
      ...(exitingMeshEdit ? meshEditExitState() : null),
    });
  },
  // additive toggle; primary = last added (or last remaining)
  toggleSelect: (id) => {
    const { selectedIds, meshEditNodeId } = get();
    const had = selectedIds.includes(id);
    const ids = had ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    const exitingMeshEdit = meshEditNodeId !== null && !ids.includes(meshEditNodeId);
    if (exitingMeshEdit) useMeshPreview.getState().setPreview(null);
    set({
      selectedIds: ids,
      selectedId: had ? (ids[ids.length - 1] ?? null) : id,
      materialCardPinnedId: null,
      ...(exitingMeshEdit ? meshEditExitState() : null),
    });
  },
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleTimeline: () =>
    set((s) =>
      s.timelineOpen
        ? { timelineOpen: false, playback: "stopped", playhead: 0 }
        : { timelineOpen: true },
    ),
  toggleHierarchy: () => set((s) => ({ hierarchyOpen: !s.hierarchyOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleAiChat: () => set((s) => ({ aiChatOpen: !s.aiChatOpen })),
  setActiveClip: (activeClipId) =>
    set({ activeClipId, playback: "stopped", playhead: 0 }),
  // Scrubbing pauses at the new playhead so the sampled pose stays visible.
  setPlayhead: (playhead) =>
    set((s) => ({
      playhead,
      playback: s.playback === "playing" ? "playing" : "paused",
    })),
  togglePlay: () =>
    set((s) => ({ playback: s.playback === "playing" ? "paused" : "playing" })),
  stopPlayback: () => set({ playback: "stopped", playhead: 0 }),
  setActiveState: (activeStateId) => set({ activeStateId }),
  // entering preview parks timeline playback so it can't fight the runtime
  setPreviewing: (previewing) =>
    set(previewing ? { previewing, playback: "stopped", playhead: 0 } : { previewing }),
  showToast: (message) => {
    set({ toast: message });
    setTimeout(() => {
      if (get().toast === message) set({ toast: null });
    }, TOAST_MS);
  },
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  openNodeInteractions: (id) =>
    set({
      selectedId: id,
      selectedIds: [id],
      materialCardPinnedId: null,
      inspectorOpen: true,
      inspectorTab: "interactions",
    }),
  enterMeshEdit: (nodeId) =>
    set({
      meshEditNodeId: nodeId,
      elementMode: "vertex",
      meshSelection: emptyMeshSelection(),
      hoveredElement: null,
      meshCutActive: false,
    }),
  exitMeshEdit: () => {
    // Escape mid-drag unmounts the gizmo before onMouseUp can clear the
    // preview, so clear it here too or the viewport keeps showing the
    // uncommitted drag positions
    useMeshPreview.getState().setPreview(null);
    set(meshEditExitState());
  },
  // element mode change invalidates picks from the other layer — stale
  // cross-mode selection would silently skew the gizmo centroid otherwise
  setElementMode: (elementMode) =>
    // switching element mode drops the cut tool too — they're separate "tools"
    set({ elementMode, meshSelection: emptyMeshSelection(), hoveredElement: null, meshCutActive: false }),
  setMeshSelection: (meshSelection) => set({ meshSelection }),
  setHoveredElement: (hoveredElement) => set({ hoveredElement }),
  // clear hover on toggle so no stale vertex/edge/face tint sits under the cut line
  setMeshCutActive: (meshCutActive) => set({ meshCutActive, hoveredElement: null }),
  openMaterialCard: (materialId) =>
    set((s) => ({
      materialCardOpen: true,
      materialCardPinnedId:
        materialId !== undefined ? materialId : s.materialCardPinnedId,
    })),
  closeMaterialCard: () => set({ materialCardOpen: false, materialCardPinnedId: null }),
}));
