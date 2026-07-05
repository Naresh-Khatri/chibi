import { get as idbGet, set as idbSet } from "idb-keyval";
import {
  createDocument,
  documentSchema,
  type ChibiDocument,
} from "@/runtime/schema";
import { useDoc } from "./document";

const docKey = (docId: string) => `doc:${docId}`;

export async function loadOrCreate(docId: string): Promise<ChibiDocument> {
  try {
    const raw = await idbGet(docKey(docId));
    if (raw) return documentSchema.parse(raw);
  } catch (err) {
    console.warn("chibi: failed to load saved document, starting fresh", err);
  }
  return createDocument("Untitled");
}

const AUTOSAVE_DEBOUNCE_MS = 1000;

export function startAutosave(docId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useDoc.subscribe((state, prev) => {
    if (!state.doc || state.doc === prev.doc || state.docId !== docId) return;
    const doc = state.doc;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      idbSet(docKey(docId), doc).catch((err) =>
        console.warn("chibi: autosave failed", err),
      );
    }, AUTOSAVE_DEBOUNCE_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
