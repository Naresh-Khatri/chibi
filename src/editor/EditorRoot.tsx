"use client";

import { useEffect } from "react";
import { useDoc } from "./store/document";
import { loadOrCreate, startAutosave, upsertRecent } from "./store/persistence";
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
      upsertRecent(docId, doc.name);
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
      <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Loading scene…
      </div>
    );
  }
  return <EditorLayout />;
}
