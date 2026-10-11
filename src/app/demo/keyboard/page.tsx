"use client";

import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import {
  ChibiScene,
  loadDocument,
  type ChibiSceneApi,
  type LoadedScene,
  type RuntimeEvent,
} from "@/runtime";

const SCENE_SRC = "/scenes/keyboard.chibi.json";

export default function KeyboardDemoPage() {
  const api = useRef<ChibiSceneApi>(null);
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [orbit, setOrbit] = useState(false);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    let loaded: LoadedScene | null = null;
    loadDocument(SCENE_SRC).then(
      (result) => {
        if (!active) {
          result.dispose();
          return;
        }
        loaded = result;
        setScene(result);
      },
      () => {
        if (active) setError("The keyboard could not load. Refresh the page to try again.");
      },
    );
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, []);

  const doc = scene?.doc;
  const spaceState = doc && Object.values(doc.states).find(
    (state) => doc.nodes[state.nodeId]?.name === "Space",
  );
  const canControl = ready && !error;

  const onEvent = (event: RuntimeEvent) => {
    if (event.type !== "stateChange") return;
    setPressed((previous) => {
      const next = new Set(previous);
      if (event.stateId === "base") next.delete(event.nodeId);
      else next.add(event.nodeId);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <SiteHeader current="keyboard" />

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Interactive keyboard</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">A little character.<br /><span className="text-primary">In every key.</span></h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Sweep your pointer across the pastel keys to press them.
              Watch the face blink, or turn the keyboard around for a closer look.
            </p>
          </div>
          <a href={SCENE_SRC} download="keyboard.chibi.json" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted">
            <Download aria-hidden="true" className="size-4" />
            Download scene
          </a>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-card" aria-label="Interactive 3D pastel keyboard">
          {doc && scene && !error && (
            <ChibiScene
              document={doc}
              resolveAsset={scene.resolveAsset}
              api={api}
              orbit={orbit}
              onEvent={onEvent}
              onLoad={() => setReady(true)}
              onError={() => setError("The 3D view could not load. Refresh the page to try again.")}
              className="h-full w-full"
            />
          )}
          {!ready && !error && (
            <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-card text-sm text-muted-foreground">
              Loading keyboard...
            </div>
          )}
          {error && <div role="alert" className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-muted-foreground">{error}</div>}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canControl || !spaceState || paused}
              onClick={() => {
                if (spaceState) api.current?.transitionTo(spaceState.id, { duration: 0.12, ease: "easeOut" });
              }}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >Press spacebar</button>
            <button
              type="button"
              disabled={!canControl || paused || pressed.size === 0}
              onClick={() => api.current?.transitionTo("base", { duration: 0.18, ease: "easeOut" })}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Release keys
            </button>
            <button
              type="button"
              disabled={!canControl}
              aria-pressed={paused}
              onClick={() => {
                api.current?.setPaused(!paused);
                setPaused(!paused);
              }}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
              {paused ? "Resume motion" : "Pause motion"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={orbit} onChange={(event) => setOrbit(event.target.checked)} disabled={!canControl} className="accent-primary" />
            Drag to rotate
          </label>
        </div>

        <div className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium">Every key moves on its own</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Each key has a pressed state. Hover transitions and the looping blink animation live in the downloadable scene file.</p>
            <p className="mt-3 font-mono text-xs text-primary" role="status">
              {ready ? `${pressed.size} ${pressed.size === 1 ? "key" : "keys"} pressed${paused ? " · motion paused" : ""}` : "Waiting for the scene"}
            </p>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Render it in React</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-6"><code>{`import { ChibiScene } from "@chibi3d/runtime";

<ChibiScene
  src="/scenes/keyboard.chibi.json"
  className="h-[520px]"
/>`}</code></pre>
          </div>
        </div>
      </section>
    </main>
  );
}
