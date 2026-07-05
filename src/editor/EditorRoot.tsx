"use client";

import { useEffect } from "react";
import { useDoc } from "./store/document";
import { loadOrCreate, startAutosave } from "./store/persistence";
import { useShortcuts } from "./useShortcuts";
import { EditorLayout } from "./EditorLayout";

export function EditorRoot({ docId }: { docId: string }) {
  const ready = useDoc((s) => s.docId === docId && s.doc !== null);

  useEffect(() => {
    if (useDoc.getState().docId === docId) return;
    let active = true;
    loadOrCreate(docId).then((doc) => {
      if (!active) return;
      useDoc.getState().loadDocument(docId, doc);
    });
    return () => {
      active = false;
    };
  }, [docId]);

  useEffect(() => {
    if (!ready) return;
    return startAutosave(docId);
  }, [ready, docId]);

  useShortcuts();

  if (!ready) {
    return (
      <div className="grid h-dvh place-items-center bg-bg text-sm text-ink-dim">
        Loading scene…
      </div>
    );
  }
  return <EditorLayout />;
}
