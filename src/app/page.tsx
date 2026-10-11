"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Sprout,
  Box,
  Clock,
  CookingPot,
  FolderOpen,
  Loader2,
  MousePointer2,
  Palette,
  Plus,
  Rocket,
  Smile,
  Sparkles,
  Tent,
  Terminal,
  TrafficCone,
  Trash2,
  Wind,
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
import { track } from "@/lib/analytics";
import {
  deleteDocument,
  getRecents,
  saveImportedDocument,
  type RecentDoc,
} from "@/editor/store/persistence";
import { importDocumentFromFile } from "@/editor/store/files";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { getApiKey, setApiKey } from "@/editor/ai/client";
import { GenerationError, generateDocument } from "@/editor/ai/generate";
import { EXAMPLE_PROMPTS } from "@/editor/ai/examplePrompts";
import { SCENE_TEMPLATES } from "@/editor/templates";
import { buildGardenScene } from "@/scenes/garden";
import { GardenPoster } from "@/components/landing/GardenPoster";

const GardenStage = dynamic(() => import("@/components/landing/GardenStage"), {
  ssr: false,
  loading: () => <GardenPoster />,
});

// paired by index with EXAMPLE_PROMPTS / SCENE_TEMPLATES (icons are a UI
// concern, the data stays pure)
const EXAMPLE_ICONS = [CookingPot, TrafficCone, Palette, Tent];
const TEMPLATE_ICONS = [Sprout, Terminal, Rocket, Smile, MousePointer2, Wind];

// hand-built scene documents that open in the editor without any AI call
function TemplateCards() {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SCENE_TEMPLATES.map((template, i) => {
        const Icon = TEMPLATE_ICONS[i % TEMPLATE_ICONS.length];
        return (
          <button
            key={template.title}
            type="button"
            disabled={opening !== null}
            onClick={async () => {
              setError(null);
              setOpening(template.title);
              try {
                const docId = await saveImportedDocument(template.build());
                track("scene_created", { source: "template", template: template.title });
                router.push(`/editor/${docId}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not open this template.");
                setOpening(null);
              }
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:bg-muted/40 hover:text-foreground disabled:opacity-60"
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
      {error && <p role="alert" className="col-span-full text-xs text-destructive">{error}</p>}
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
            aria-label="Mistral API key"
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
      track("scene_generated", { promptLength: text.length });
      router.push(`/editor/${docId}`);
      // stay in the running state while the editor route loads
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      if (err instanceof GenerationError) setRawText(err.rawText);
      track("scene_generation_failed");
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
      <h3 className="text-sm font-medium text-foreground">Start from a template</h3>
      <TemplateCards />
      <h3 className="mt-4 text-sm font-medium text-foreground">Start with an idea</h3>
      <p className="mb-1 text-xs text-muted-foreground">Describe a scene or choose a prompt below. Generation uses your own Mistral API key.</p>
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
          aria-label="Describe your scene"
          rows={2}
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
        Prompt ideas
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {EXAMPLE_PROMPTS.map((example, i) => {
          const Icon = EXAMPLE_ICONS[i % EXAMPLE_ICONS.length];
          return (
            <button
              key={example.title}
              type="button"
              disabled={running}
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
  const [createOpen, setCreateOpen] = useState(false);
  const [remixing, setRemixing] = useState(false);

  const refresh = useCallback(() => {
    getRecents().then(setRecents).catch(() => setError("Could not read recent projects. Check that browser storage is available."));
  }, []);
  useEffect(refresh, [refresh]);

  const remix = async () => {
    if (remixing) return;
    setRemixing(true);
    setError(null);
    try {
      const docId = await saveImportedDocument(buildGardenScene());
      track("scene_created", { source: "template", template: "A little garden" });
      router.push(`/editor/${docId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the garden.");
      setRemixing(false);
    }
  };

  return (
    <main className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <Link href="/" aria-label="Chibi home" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Box aria-hidden="true" className="size-5 text-primary" />chibi
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm sm:gap-7">
          <Link href="/demo" className="text-muted-foreground transition-colors hover:text-foreground">Demos</Link>
          <Link href="/docs" className="text-muted-foreground transition-colors hover:text-foreground">Docs</Link>
          <AccountMenu />
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center px-6 pt-8 sm:px-10 lg:min-h-[720px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:pt-0" aria-labelledby="hero-heading">
        <div className="relative z-10 pb-3 lg:pb-16">
          <p className="mb-6 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground"><Sprout className="size-4 text-primary" aria-hidden="true" />A small idea can become a whole world.</p>
          <h1 id="hero-heading" className="text-[clamp(2.7rem,5.3vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.055em]">
            Make a world<br />of your own.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-muted-foreground">
            Shape it, give it life, put it on the web. Chibi is your browser studio for interactive 3D.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button className="h-12 rounded-lg px-5 text-sm" onClick={() => setCreateOpen(true)}>
              Create a project<ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-lg px-5 text-sm">
              <Link href="/demo">Explore demos</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Start free. No account needed.</p>
        </div>
        <div className="-mx-6 min-w-0 sm:-mx-4 lg:-mr-10 lg:ml-0">
          <GardenStage onRemix={() => void remix()} />
          {remixing && <p className="text-center text-xs text-muted-foreground" role="status">Opening your garden…</p>}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12 sm:px-10">
        <div className="flex flex-col justify-between gap-5 border-t border-border pt-7 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">A scene you can take apart and make your own.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">This garden is made with Chibi objects, states, and animation. Try a tap, then open it in the editor.</p>
          </div>
          <button type="button" className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => fileInputRef.current?.click()}>
            <FolderOpen className="size-4" aria-hidden="true" />Open a scene file
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".json,.zip" className="hidden" aria-label="Import a Chibi scene" onChange={async (e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          setError(null);
          try {
            const doc = await importDocumentFromFile(file);
            const docId = await saveImportedDocument(doc);
            track("scene_created", { source: "import" });
            router.push(`/editor/${docId}`);
          } catch (err) { setError(err instanceof Error ? err.message : "Import failed"); }
        }} />
        {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}

        {recents && recents.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-medium"><Clock className="size-4 text-muted-foreground" aria-hidden="true" />Pick up where you left off</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recents.map((recent) => (
                <div key={recent.docId} className="group flex items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                  <Box className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Link href={`/editor/${recent.docId}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{recent.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(recent.updatedAt)}</span>
                  </Link>
                  <button type="button" aria-label={`Delete ${recent.name}`} className="rounded p-2 text-muted-foreground transition-colors hover:text-destructive" onClick={async () => {
                    if (!window.confirm(`Delete "${recent.name}"?`)) return;
                    try { await deleteDocument(recent.docId); refresh(); }
                    catch (err) { setError(err instanceof Error ? err.message : "Could not delete the scene"); }
                  }}><Trash2 className="size-3.5" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">What will you make?</DialogTitle>
            <DialogDescription>Choose a starting point. Your projects save in this browser.</DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="h-12 justify-between px-4" onClick={() => {
            track("scene_created", { source: "blank" });
            router.push(`/editor/${newId("doc")}`);
          }}><span className="flex items-center gap-2"><Plus className="size-4" />Start blank</span><ArrowRight className="size-4" aria-hidden="true" /></Button>
          <ScenePrompt />
        </DialogContent>
      </Dialog>
    </main>
  );
}
