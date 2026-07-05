import { create } from "zustand";

export type Tool = "select" | "move" | "rotate" | "scale";

type UIState = {
  tool: Tool;
  selectedId: string | null;
  snap: boolean;
  timelineOpen: boolean;
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  toggleSnap: () => void;
  toggleTimeline: () => void;
};

export const useUI = create<UIState>()((set) => ({
  tool: "move",
  selectedId: null,
  snap: false,
  timelineOpen: false,
  setTool: (tool) => set({ tool }),
  select: (selectedId) => set({ selectedId }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleTimeline: () => set((s) => ({ timelineOpen: !s.timelineOpen })),
}));
