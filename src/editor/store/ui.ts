import { create } from "zustand";

export type Tool = "select" | "move" | "rotate" | "scale";

type UIState = {
  tool: Tool;
  selectedId: string | null;
  snap: boolean;
  timelineOpen: boolean;
  toast: string | null;
  setTool: (tool: Tool) => void;
  select: (id: string | null) => void;
  toggleSnap: () => void;
  toggleTimeline: () => void;
  showToast: (message: string) => void;
};

const TOAST_MS = 4000;

export const useUI = create<UIState>()((set, get) => ({
  tool: "move",
  selectedId: null,
  snap: false,
  timelineOpen: false,
  toast: null,
  setTool: (tool) => set({ tool }),
  select: (selectedId) => set({ selectedId }),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),
  toggleTimeline: () => set((s) => ({ timelineOpen: !s.timelineOpen })),
  showToast: (message) => {
    set({ toast: message });
    setTimeout(() => {
      if (get().toast === message) set({ toast: null });
    }, TOAST_MS);
  },
}));
