"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Clock, FolderOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newId } from "@/runtime/schema";
import {
  deleteDocument,
  getRecents,
  saveImportedDocument,
  type RecentDoc,
} from "@/editor/store/persistence";
import { importDocumentFromFile } from "@/editor/store/files";

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recents, setRecents] = useState<RecentDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getRecents().then(setRecents);
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background">
      <div className="flex w-full max-w-md flex-col gap-8 px-6">
        <div className="text-center">
          <div className="mb-3 inline-grid size-12 place-items-center rounded-xl bg-primary/15">
            <Box className="size-6 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            chibi
          </h1>
          <p className="mt-2 text-sm text-balance text-muted-foreground">
            A web-native 3D editor. Design interactive scenes in the browser,
            ship them as React components.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <Button onClick={() => router.push(`/editor/${newId("doc")}`)}>
            <Plus />
            New scene
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderOpen />
            Open file…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip"
            className="hidden"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              setError(null);
              try {
                const doc = await importDocumentFromFile(file);
                const docId = await saveImportedDocument(doc);
                router.push(`/editor/${docId}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Import failed");
              }
            }}
          />
        </div>

        {error && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}

        {recents && recents.length > 0 && (
          <div className="rounded-xl border bg-card">
            <div className="flex items-center gap-1.5 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="size-3" />
              Recent scenes
            </div>
            {recents.map((recent) => (
              <div
                key={recent.docId}
                className="group flex cursor-pointer items-center gap-2.5 border-b border-border/50 px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/50"
                onClick={() => router.push(`/editor/${recent.docId}`)}
              >
                <Box className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm text-foreground">
                  {recent.name}
                </span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {timeAgo(recent.updatedAt)}
                </span>
                <button
                  type="button"
                  title="Delete scene"
                  className="hidden text-muted-foreground transition-colors hover:text-destructive group-hover:block"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete "${recent.name}"?`)) return;
                    await deleteDocument(recent.docId);
                    refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
