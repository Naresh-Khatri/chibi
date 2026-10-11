"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Check, Copy } from "lucide-react";
import {
  ChibiScene,
  loadDocument,
  type ChibiSceneApi,
  type LoadedScene,
  type RuntimeEvent,
} from "@/runtime";

// the real artifact is the editor export dropped at /scenes/hero.chibi.zip;
// until one exists we fall back to the hand-authored placeholder json
const SCENE_SOURCES = ["/scenes/hero.chibi.zip", "/scenes/hero.chibi.json"];

type LogEntry = { id: number; at: string; json: string };

export default function DemoPage() {
  const api = useRef<ChibiSceneApi>(null);
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [sceneSrc, setSceneSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [debug, setDebug] = useState(false);
  const [orbit, setOrbit] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const logSeq = useRef(0);

  useEffect(() => {
    let active = true;
    let loaded: LoadedScene | null = null;
    (async () => {
      for (const src of SCENE_SOURCES) {
        try {
          loaded = await loadDocument(src);
          if (active) setSceneSrc(src);
          break;
        } catch {
          // try the next source
        }
      }
      if (!active) {
        loaded?.dispose();
        return;
      }
      if (loaded) setScene(loaded);
      else setFailed(true);
    })();
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, []);

  const pushEvent = (e: RuntimeEvent) => {
    const entry: LogEntry = {
      id: logSeq.current++,
      at: new Date().toLocaleTimeString(undefined, { hour12: false }),
      json: JSON.stringify(e),
    };
    setLog((prev) => [entry, ...prev].slice(0, 50));
  };

  const doc = scene?.doc;

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30">
      <SiteHeader current="demo" />

      <div className="mx-auto max-w-6xl px-6 pt-6">
        <Link href="/demo/keyboard" className="text-sm text-primary underline underline-offset-4">
          Try the interactive keyboard
        </Link>
      </div>

      {/* min-w-0 on both columns: long log lines must scroll, not blow out the grid */}
      <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-12 lg:grid-cols-[1fr_1.5fr] lg:items-start">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl">
            A scene you can
            <br />
            <span className="text-primary">play with.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Hover the cube to change its look. Click it to start an animation,
            or click the ring to lift it. Try the controls below to change the
            scene yourself.
          </p>

          {doc && (
            <>
              <SectionLabel className="mt-8">Try an action</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.values(doc.states).map((s) => (
                  <ApiButton
                    key={s.id}
                    call={`api.transitionTo("${s.id}")`}
                    hint={`${doc.nodes[s.nodeId]?.name ?? "Object"}: ${s.name}`}
                    onClick={() => api.current?.transitionTo(s.id)}
                  />
                ))}
                <ApiButton
                  call={`api.transitionTo("base")`}
                  hint="Reset states"
                  onClick={() => api.current?.transitionTo("base")}
                />
                {Object.values(doc.animations).map((a) => (
                  <ApiButton
                    key={a.id}
                    call={`api.play("${a.id}")`}
                    hint={`play ${a.name}`}
                    onClick={() => api.current?.play(a.id)}
                  />
                ))}
                {Object.values(doc.animations).map((a) => (
                  <ApiButton
                    key={`stop-${a.id}`}
                    call={`api.stop("${a.id}")`}
                    hint={`stop ${a.name}`}
                    onClick={() => api.current?.stop(a.id)}
                  />
                ))}
                <ApiButton
                  call={`api.setPaused(${!paused})`}
                  hint={paused ? "Resume motion" : "Pause motion"}
                  onClick={() => {
                    api.current?.setPaused(!paused);
                    setPaused(!paused);
                  }}
                />
              </div>
            </>
          )}

          <details className="mt-8 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">Inspect scene events</summary>
            <p className="mt-3 text-xs text-muted-foreground">Events sent from the scene to the page as you interact.</p>
            <div className="mt-3 h-44 overflow-x-auto overflow-y-auto rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-5">
              {log.length === 0 && (
                <div className="text-muted-foreground">waiting for events…</div>
              )}
              {log.map((entry) => (
                <div key={entry.id} className="whitespace-nowrap">
                  <span className="text-muted-foreground">{entry.at}</span>{" "}
                  <span className="text-foreground">{entry.json}</span>
                </div>
              ))}
            </div>
          </details>
          <Link href="/docs#interactions" className="mt-5 inline-block text-sm text-primary underline underline-offset-4">Learn how interactions work</Link>
        </div>

        <div className="min-w-0 lg:sticky lg:top-6">
          <div className="h-[420px] overflow-hidden rounded-2xl border border-border bg-card lg:h-[480px]">
            {doc && (
              <ChibiScene
                document={doc}
                debug={debug}
                resolveAsset={scene?.resolveAsset}
                api={api}
                onEvent={pushEvent}
                className="h-full w-full"
                fallback={<LoadingHint />}
              />
            )}
            {!doc && !failed && <LoadingHint />}
            {failed && (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-muted-foreground">
                No scene found. Export your scene from the editor as{" "}
                <code>hero.chibi.zip</code> and drop it in{" "}
                <code>public/scenes/</code>.
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} className="accent-primary" />
              Show performance
            </label>
            {sceneSrc && <a href={sceneSrc} target="_blank" rel="noreferrer" className="underline underline-offset-4">Open scene file</a>}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-12 sm:grid-cols-2">
        <Link href="/demo/keycaps" className="rounded-xl border border-border bg-card p-6 transition-colors hover:bg-muted">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next demo</p>
          <h2 className="mt-3 text-xl font-semibold">Make a keyboard your own</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Choose colors, add logos, and resize the layout. Every change appears in 3D.</p>
        </Link>
        <Link href="/docs" className="rounded-xl border border-border bg-card p-6 transition-colors hover:bg-muted">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Documentation</p>
          <h2 className="mt-3 text-xl font-semibold">Put a scene on your site</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Export from the editor, render in React, and connect interactions to your app.</p>
        </Link>
      </section>

      {/* second instance: proves multi-instance independence + prop toggles */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 md:grid-cols-[1fr_320px] md:items-center">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              Same file, second instance
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              A separate{" "}
              <code className="text-foreground">&lt;ChibiScene&gt;</code> with its
              own engine — its state doesn&apos;t bleed into the hero above.
              Toggle its props and watch the JSX:
            </p>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={orbit}
                  onChange={(e) => setOrbit(e.target.checked)}
                  className="accent-primary"
                />
                <code>orbit</code>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={interactive}
                  onChange={(e) => setInteractive(e.target.checked)}
                  className="accent-primary"
                />
                <code>interactive</code>
              </label>
            </div>
            <CodeBlock
              className="mt-4"
              code={secondInstanceSnippet(sceneSrc, orbit, interactive)}
            />
          </div>
          <div className="h-64 overflow-hidden rounded-xl border border-border bg-card">
            {doc && (
              <ChibiScene
                document={doc}
                resolveAsset={scene?.resolveAsset}
                orbit={orbit}
                interactive={interactive}
                className="h-full w-full"
                fallback={<LoadingHint />}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function secondInstanceSnippet(
  src: string | null,
  orbit: boolean,
  interactive: boolean,
): string {
  const lines = [
    `<ChibiScene`,
    `  src="${src ?? "/scenes/hero.chibi.zip"}"`,
    ...(orbit ? [`  orbit`] : []),
    ...(interactive ? [] : [`  interactive={false}`]),
    `  className="h-64"`,
    `/>`,
  ];
  return lines.join("\n");
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[11px] font-semibold uppercase tracking-widest text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
}

function ApiButton({
  call,
  hint,
  onClick,
}: {
  call: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={call}
      className="group rounded-lg border border-border bg-card px-3 py-1.5 text-left font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      {hint}
      <span className="mt-1 block text-[10px] text-muted-foreground transition-colors group-hover:text-primary">
        {call}
      </span>
    </button>
  );
}

function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`relative rounded-xl border border-border bg-card ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "copied" : "copy"}
      </button>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-5 text-foreground">
        {code}
      </pre>
    </div>
  );
}

function LoadingHint() {
  return (
    <div className="grid h-full place-items-center text-xs text-muted-foreground">
      loading scene…
    </div>
  );
}
