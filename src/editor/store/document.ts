import { create } from "zustand";
import {
  applyPatches,
  enablePatches,
  produceWithPatches,
  type Patch,
} from "immer";
import type { ChibiDocument } from "@/runtime/schema";

enablePatches();

export type HistoryEntry = {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  mergeKey?: string;
  at: number;
};

export type DispatchOpts = { mergeKey?: string };

type DocState = {
  docId: string | null;
  doc: ChibiDocument | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  loadDocument: (docId: string, doc: ChibiDocument) => void;
  dispatch: (
    label: string,
    recipe: (draft: ChibiDocument) => void,
    opts?: DispatchOpts,
  ) => void;
  undo: () => void;
  redo: () => void;
};

const MERGE_WINDOW_MS = 300;
const MAX_UNDO = 100;

export const useDoc = create<DocState>()((set, get) => ({
  docId: null,
  doc: null,
  undoStack: [],
  redoStack: [],

  loadDocument: (docId, doc) =>
    set({ docId, doc, undoStack: [], redoStack: [] }),

  dispatch: (label, recipe, opts) => {
    const { doc, undoStack } = get();
    if (!doc) return;
    const [next, patches, inversePatches] = produceWithPatches(doc, recipe);
    if (patches.length === 0) return;
    const now = Date.now();
    const top = undoStack[undoStack.length - 1];
    let nextUndo: HistoryEntry[];
    if (
      opts?.mergeKey &&
      top &&
      top.mergeKey === opts.mergeKey &&
      now - top.at < MERGE_WINDOW_MS
    ) {
      nextUndo = [
        ...undoStack.slice(0, -1),
        {
          ...top,
          at: now,
          patches: [...top.patches, ...patches],
          inversePatches: [...inversePatches, ...top.inversePatches],
        },
      ];
    } else {
      nextUndo = [
        ...undoStack,
        { label, patches, inversePatches, mergeKey: opts?.mergeKey, at: now },
      ].slice(-MAX_UNDO);
    }
    set({ doc: next, undoStack: nextUndo, redoStack: [] });
  },

  undo: () => {
    const { doc, undoStack, redoStack } = get();
    const entry = undoStack[undoStack.length - 1];
    if (!doc || !entry) return;
    set({
      doc: applyPatches(doc, entry.inversePatches),
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, entry],
    });
  },

  redo: () => {
    const { doc, undoStack, redoStack } = get();
    const entry = redoStack[redoStack.length - 1];
    if (!doc || !entry) return;
    set({
      doc: applyPatches(doc, entry.patches),
      undoStack: [...undoStack, entry],
      redoStack: redoStack.slice(0, -1),
    });
  },
}));

/** Convenience selector: the loaded document (throws if used before load). */
export function useLoadedDoc(): ChibiDocument {
  const doc = useDoc((s) => s.doc);
  if (!doc) throw new Error("document not loaded");
  return doc;
}
