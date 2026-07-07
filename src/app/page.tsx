"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Clock,
  CookingPot,
  FolderOpen,
  Loader2,
  Palette,
  Plus,
  Rocket,
  Smile,
  Sparkles,
  Tent,
  Terminal,
  TrafficCone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { newId } from "@/runtime/schema";
import {
  deleteDocument,
  getRecents,
  saveImportedDocument,
  type RecentDoc,
} from "@/editor/store/persistence";
import { importDocumentFromFile } from "@/editor/store/files";
import { getApiKey, setApiKey } from "@/editor/ai/client";
import { GenerationError, generateDocument } from "@/editor/ai/generate";
import { EXAMPLE_PROMPTS } from "@/editor/ai/examplePrompts";
import { SCENE_TEMPLATES } from "@/editor/templates";

// paired by index with EXAMPLE_PROMPTS / SCENE_TEMPLATES (icons are a UI
// concern, the data stays pure)
const EXAMPLE_ICONS = [CookingPot, TrafficCone, Palette, Tent];
const TEMPLATE_ICONS = [Terminal, Rocket, Smile];

// hand-built scene documents that open in the editor without any AI call
function TemplateCards() {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SCENE_TEMPLATES.map((template, i) => {
        const Icon = TEMPLATE_ICONS[i % TEMPLATE_ICONS.length];
        return (
          <button
            key={template.title}
            type="button"
            disabled={opening !== null}
            onClick={async () => {
              setOpening(template.title);
              try {
                const docId = await saveImportedDocument(template.build());
                router.push(`/editor/${docId}`);
              } catch (err) {
                console.error("chibi: template failed to open", err);
                setOpening(null);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:bg-muted/40 hover:text-foreground disabled:opacity-60"
          >
            {opening === template.title ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <Icon className="size-3.5 shrink-0 text-primary" />
            )}
            {template.title}
          </button>
        );
      })}
    </div>
  );
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// prompt-to-scene generation needs a Mistral key; gate the composer behind a
// setup dialog rather than letting the user type into a field that can't submit.
function AiSetupDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState("");

  const save = () => {
    if (!draft.trim()) return;
    setApiKey(draft);
    setDraft("");
    onSaved();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDraft("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            Set up chibi AI
          </DialogTitle>
          <DialogDescription>
            Prompt-to-scene generation runs on Mistral. Add a free API key to
            get started — it stays in this browser (localStorage) and is
            never written to documents or exports.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>
            Create a key at{" "}
            <a
              href="https://console.mistral.ai/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              console.mistral.ai/api-keys
            </a>
          </li>
          <li>Paste it below and save.</li>
        </ol>
        <div className="flex items-center gap-1.5">
          <input
            type="password"
            autoFocus
            placeholder="Mistral API key"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) save();
            }}
            className="h-8 w-full rounded-md border border-input bg-input/30 px-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <Button
            variant="secondary"
            size="xs"
            disabled={!draft.trim()}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// M8: prompt-to-scene from the landing page — single-shot generation, then
// the doc opens in the editor like any other document.
function ScenePrompt() {
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [hasKey, setHasKey] = useState(() => Boolean(getApiKey()));
  const [setupOpen, setSetupOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);

  const run = async (text: string) => {
    setRunning(true);
    setError(null);
    setRawText(null);
    try {
      const doc = await generateDocument(text);
      const docId = await saveImportedDocument(doc);
      router.push(`/editor/${docId}`);
      // stay in the running state while the editor route loads
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      if (err instanceof GenerationError) setRawText(err.rawText);
      setRunning(false);
    }
  };

  const submit = () => {
    if (running) return;
    if (!hasKey) {
      setSetupOpen(true);
      return;
    }
    const text = prompt.trim();
    if (!text) return;
    void run(text);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex items-start gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 ${
          running ? "animate-pulse" : ""
        }`}
      >
        {running ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
        ) : (
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        )}
        <textarea
          ref={promptRef}
          rows={1}
          placeholder="Describe a scene…"
          value={prompt}
          disabled={running}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 w-full resize-none bg-transparent text-sm text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-60"
        />
        <Button
          variant="secondary"
          size="xs"
          disabled={running || !prompt.trim()}
          onClick={submit}
        >
          {running ? "Generating…" : "Generate"}
        </Button>
      </div>

      <AiSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onSaved={() => {
          setHasKey(true);
          setSetupOpen(false);
          promptRef.current?.focus();
        }}
      />

      <p className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Templates
      </p>
      <TemplateCards />

      <p className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Prompt ideas
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {EXAMPLE_PROMPTS.map((example, i) => {
          const Icon = EXAMPLE_ICONS[i % EXAMPLE_ICONS.length];
          return (
            <button
              key={example.title}
              type="button"
              disabled={running || !hasKey}
              onClick={() => {
                setPrompt(example.prompt);
                promptRef.current?.focus();
              }}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:bg-muted/40 hover:text-foreground disabled:opacity-60"
            >
              <Icon className="size-3.5 shrink-0 text-primary" />
              {example.title}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-left">
          <p className="text-xs text-destructive">{error}</p>
          {rawText && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">
                Show raw model output
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 whitespace-pre-wrap break-all">
                {rawText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
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

        <ScenePrompt />

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
