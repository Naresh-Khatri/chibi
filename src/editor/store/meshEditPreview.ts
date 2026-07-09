import { create } from "zustand";

// live-drag preview positions for the mesh-edit gizmo, isolated from ui.ts —
// dragging writes here at ~60fps and only NodeRenderer/CageOverlay subscribe,
// so it doesn't fan out to every ui.ts consumer (inspector, hierarchy, etc).
export type MeshPreview = { nodeId: string; positions: number[] } | null;

type MeshPreviewState = {
  preview: MeshPreview;
  setPreview: (preview: MeshPreview) => void;
};

export const useMeshPreview = create<MeshPreviewState>()((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
}));
