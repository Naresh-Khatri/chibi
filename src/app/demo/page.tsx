"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
    <main className="min-h-screen overflow-x-clip bg-[#0b0b0f] text-zinc-200 selection:bg-pink-500/30">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="text-sm font-semibold tracking-widest text-zinc-400">
          chibi <span className="text-pink-400">runtime demo</span>
        </div>
        <nav className="flex items-center gap-4 text-xs text-zinc-500">
          {sceneSrc && (
            <a
              href={sceneSrc}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-zinc-300"
            >
              view scene file
            </a>
          )}
          <Link href="/" className="transition-colors hover:text-zinc-300">
            back to editor
          </Link>
        </nav>
      </header>

      {/* hero: the scene IS the marketing visual */}
      {/* min-w-0 on both columns: long log lines must scroll, not blow out the grid */}
      <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white lg:text-5xl">
            Your scene,
            <br />
            <span className="text-pink-400">their React app.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
            This page is a plain React consumer — no editor code on it. The
            scene on the right is an exported{" "}
            <code className="text-zinc-300">.chibi</code> file rendered by{" "}
            <code className="text-zinc-300">&lt;ChibiScene /&gt;</code>. Hover
            the cube, click it, click the torus: those interactions live in the
            scene file, authored by a designer.
          </p>

          {doc && (
            <>
              <SectionLabel className="mt-8">
                app <Arrow /> scene · every button is the literal call it makes
              </SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.values(doc.states).map((s) => (
                  <ApiButton
                    key={s.id}
                    call={`api.transitionTo("${s.id}")`}
                    hint={s.name}
                    onClick={() => api.current?.transitionTo(s.id)}
                  />
                ))}
                <ApiButton
                  call={`api.transitionTo("base")`}
                  hint="reset all"
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
                  hint={paused ? "resume" : "freeze"}
                  onClick={() => {
                    api.current?.setPaused(!paused);
                    setPaused(!paused);
                  }}
                />
                <ApiButton
                  call="api.getState()"
                  hint="log to console"
                  onClick={() =>
                    console.log("api.getState() →", api.current?.getState())
                  }
                />
              </div>
            </>
          )}

          <SectionLabel className="mt-8">
            scene <Arrow /> app · raw{" "}
            <code className="normal-case">onEvent</code> payloads
          </SectionLabel>
          <div className="mt-3 h-44 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-[11px] leading-5">
            {log.length === 0 && (
              <div className="text-zinc-600">waiting for events…</div>
            )}
            {log.map((entry) => (
              <div key={entry.id} className="whitespace-nowrap">
                <span className="text-zinc-600">{entry.at}</span>{" "}
                <span className="text-zinc-300">{entry.json}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-6">
          <div className="h-[420px] overflow-hidden rounded-2xl border border-zinc-800 bg-black/40 lg:h-[480px]">
            {doc && (
              <ChibiScene
                document={doc}
                resolveAsset={scene?.resolveAsset}
                api={api}
                onEvent={pushEvent}
                className="h-full w-full"
                fallback={<LoadingHint />}
              />
            )}
            {!doc && !failed && <LoadingHint />}
            {failed && (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-zinc-500">
                No scene found. Export your scene from the editor as{" "}
                <code>hero.chibi.zip</code> and drop it in{" "}
                <code>public/scenes/</code>.
              </div>
            )}
          </div>
          <div className="mt-2 text-right font-mono text-[10px] text-zinc-600">
            {sceneSrc && <>src: {sceneSrc} · idles at 0 fps (frameloop=&quot;demand&quot;)</>}
          </div>
        </div>
      </section>

      {/* integration snippet */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-lg font-semibold text-white">Use it in your app</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          One component, one file in your repo. The scene JSON is open and
          diffable — commit it next to your code. Full props table in{" "}
          <code className="text-zinc-300">src/runtime/README.md</code>.
        </p>
        <CodeBlock className="mt-4" code={INTEGRATION_SNIPPET} />
      </section>

      {/* second instance: proves multi-instance independence + prop toggles */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 md:grid-cols-[1fr_320px] md:items-center">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">
              Same file, second instance
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              A separate{" "}
              <code className="text-zinc-300">&lt;ChibiScene&gt;</code> with its
              own engine — its state doesn&apos;t bleed into the hero above.
              Toggle its props and watch the JSX:
            </p>
            <div className="mt-4 flex gap-4 text-xs text-zinc-400">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={orbit}
                  onChange={(e) => setOrbit(e.target.checked)}
                  className="accent-pink-500"
                />
                <code>orbit</code>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={interactive}
                  onChange={(e) => setInteractive(e.target.checked)}
                  className="accent-pink-500"
                />
                <code>interactive</code>
              </label>
            </div>
            <CodeBlock
              className="mt-4"
              code={secondInstanceSnippet(sceneSrc, orbit, interactive)}
            />
          </div>
          <div className="h-64 overflow-hidden rounded-xl border border-zinc-800 bg-black/40">
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

const INTEGRATION_SNIPPET = `import { useRef } from "react";
import { ChibiScene, type ChibiSceneApi, type RuntimeEvent } from "@ochibi/runtime";

export function Hero() {
  const api = useRef<ChibiSceneApi>(null);

  return (
    <>
      <ChibiScene
        src="/scenes/hero.chibi.zip"        // or document={parsedJson}
        api={api}
        onEvent={(e: RuntimeEvent) => console.log(e)}
        className="h-[600px]"               // sizing is yours; canvas fills the box
      />
      <button onClick={() => api.current?.transitionTo("st_hot")}>Hot</button>
      <button onClick={() => api.current?.play("an_float")}>Float</button>
    </>
  );
}`;

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

// section labels are uppercase + letter-spaced; the arrow opts back out of
// both so it renders as a clean glyph instead of a spaced-out artifact
function Arrow() {
  return (
    <span aria-hidden className="font-sans normal-case tracking-normal text-pink-400/80">
      {"→"}
    </span>
  );
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
      className={`text-[11px] font-semibold uppercase tracking-widest text-zinc-500 ${className}`}
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
      title={hint}
      className="group rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-pink-500/60 hover:text-white"
    >
      {call}
      <span className="ml-2 text-[10px] text-zinc-600 transition-colors group-hover:text-pink-400/80">
        {hint}
      </span>
    </button>
  );
}

function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={`relative rounded-xl border border-zinc-800 bg-black/50 ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-3 top-3 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:text-white"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-5 text-zinc-300">
        {code}
      </pre>
    </div>
  );
}

function LoadingHint() {
  return (
    <div className="grid h-full place-items-center text-xs text-zinc-600">
      loading scene…
    </div>
  );
}
