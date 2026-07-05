import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import {
  createDocument,
  documentSchema,
  newId,
  type ChibiDocument,
} from "@/runtime/schema";
import { useDoc } from "./document";
import { gcAssetBlobs } from "./assets";

const docKey = (docId: string) => `doc:${docId}`;
const RECENTS_KEY = "recents";

export type RecentDoc = { docId: string; name: string; updatedAt: number };
type RecentsMap = Record<string, RecentDoc>;

async function getRecentsMap(): Promise<RecentsMap> {
  return ((await idbGet(RECENTS_KEY)) ?? {}) as RecentsMap;
}

export async function getRecents(): Promise<RecentDoc[]> {
  const map = await getRecentsMap();
  return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertRecent(docId: string, name: string) {
  const map = await getRecentsMap();
  map[docId] = { docId, name, updatedAt: Date.now() };
  await idbSet(RECENTS_KEY, map);
}

/** Removes a document + its recents entry, then GCs orphaned asset blobs. */
export async function deleteDocument(docId: string) {
  const map = await getRecentsMap();
  delete map[docId];
  await idbSet(RECENTS_KEY, map);
  await idbDel(docKey(docId));

  const referenced = new Set<string>();
  for (const recent of Object.values(map)) {
    try {
      const raw = await idbGet(docKey(recent.docId));
      if (!raw) continue;
      const doc = documentSchema.parse(raw);
      for (const asset of Object.values(doc.assets)) referenced.add(asset.hash);
    } catch {
      // unreadable doc — keep its key, skip for GC purposes
    }
  }
  await gcAssetBlobs(referenced);
}

export async function saveImportedDocument(doc: ChibiDocument): Promise<string> {
  const docId = newId("doc");
  await idbSet(docKey(docId), doc);
  await upsertRecent(docId, doc.name);
  return docId;
}

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
      Promise.all([idbSet(docKey(docId), doc), upsertRecent(docId, doc.name)]).catch(
        (err) => console.warn("chibi: autosave failed", err),
      );
    }, AUTOSAVE_DEBOUNCE_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
