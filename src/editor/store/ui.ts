import { create } from "zustand";

export type Tool = "select" | "move" | "rotate" | "scale";

// "paused" previews the sampled pose at the playhead; "stopped" means the
// viewport shows plain document values (playback restores them on stop).
export type Playback = "stopped" | "playing" | "paused";

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
  toast: string | null;
  activeClipId: string | null;
  playback: Playback;
  playhead: number;
  // which document state edits record into ("base" = edit the document)
  activeStateId: string;
  previewing: boolean;
  inspectorTab: "design" | "interactions";
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
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
  toast: null,
  activeClipId: null,
  playback: "stopped",
  playhead: 0,
  activeStateId: "base",
  previewing: false,
  inspectorTab: "design",
  setTool: (tool) => set({ tool }),
  select: (selectedId) =>
    set({ selectedId, selectedIds: selectedId ? [selectedId] : [] }),
  selectMany: (ids) => set({ selectedIds: ids, selectedId: ids[0] ?? null }),
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
      inspectorOpen: true,
      inspectorTab: "interactions",
    }),
}));
