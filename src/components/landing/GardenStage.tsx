"use client";

import { useMemo, useRef, useState } from "react";
import { Flower2, Rabbit, RotateCcw, Wind } from "lucide-react";
import { ChibiScene, type ChibiSceneApi, type RuntimeEvent } from "@/runtime";
import {
  buildGardenScene,
  GARDEN_BUTTERFLY,
  GARDEN_DISCOVERIES,
  GARDEN_FLIGHT,
  GARDEN_FLOWERS,
  GARDEN_RABBIT,
} from "@/scenes/garden";

export default function GardenStage({ onRemix }: { onRemix: () => void }) {
  const doc = useMemo(() => buildGardenScene(), []);
  const api = useRef<ChibiSceneApi>(null);
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("Tap the flowers, rabbit, or butterfly.");

  const discover = (id: string) => {
    if (!GARDEN_DISCOVERIES.includes(id)) return;
    setFound((previous) => new Set(previous).add(id));
    setMessage(id === GARDEN_RABBIT ? "A little company for your garden." : id === GARDEN_BUTTERFLY ? "Off for a little wander." : "Give it a little room to grow.");
  };
  const onEvent = (event: RuntimeEvent) => {
    if (event.type === "interaction" && event.trigger.type === "click") discover(event.trigger.nodeId);
  };
  const bloom = () => {
    const states = Object.values(doc.states).filter((state) => GARDEN_FLOWERS.some((id) => id === state.nodeId));
    const allBloomed = states.every((state) => api.current?.getState()[state.nodeId] === state.id);
    states.forEach((state) => api.current?.transitionNodeTo(state.nodeId, allBloomed ? "base" : state.id, { duration: 0.65 }));
    setFound((previous) => new Set([...previous, ...GARDEN_FLOWERS]));
    setMessage(allBloomed ? "Even a garden needs a little rest." : "A little color goes a long way.");
  };
  const wake = () => {
    const states = Object.values(doc.states).filter((state) => doc.interactions.some((interaction) =>
      "nodeId" in interaction.trigger && interaction.trigger.nodeId === GARDEN_RABBIT &&
      "nodeId" in interaction.action && interaction.action.nodeId === state.nodeId));
    const awake = api.current?.getState()[GARDEN_RABBIT] !== "base";
    states.forEach((state) => api.current?.transitionNodeTo(state.nodeId, awake ? "base" : state.id, { duration: 0.65 }));
    discover(GARDEN_RABBIT);
  };

  const controlClass = "flex min-h-10 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40";

  return (
    <div className="relative min-w-0" aria-label="Interactive miniature garden">
      <div className="absolute left-6 top-7 z-10 hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        A little garden
      </div>
      <div className="relative h-[350px] sm:h-[470px] lg:h-[600px]" role="group" aria-label="3D garden. Use the buttons below or tap objects in the scene.">
        <ChibiScene
          document={doc} api={api} onEvent={onEvent} orthographic transparent
          dpr={[1, 1.5]} className="h-full w-full"
          poster="/images/garden-poster.webp"
          onLoad={() => setReady(true)} onError={() => setFailed(true)}
          fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Planting a little garden…</div>}
        />
        {failed && <div className="absolute inset-0 grid place-items-center bg-background px-8 text-center text-sm text-muted-foreground" role="status">The garden couldn&apos;t load. You can still create a project.</div>}
      </div>

      <div className="relative -mt-4 flex flex-col items-center gap-3 pb-6 lg:-mt-10">
        <div className="flex flex-wrap justify-center gap-1 rounded-full border border-border bg-card/70 p-1">
          <button type="button" onClick={bloom} disabled={!ready || failed} className={controlClass}><Flower2 className="size-3.5" aria-hidden="true" />Bloom</button>
          <button type="button" onClick={wake} disabled={!ready || failed} className={controlClass}><Rabbit className="size-3.5" aria-hidden="true" />Wake</button>
          <button type="button" onClick={() => { api.current?.play(GARDEN_FLIGHT); discover(GARDEN_BUTTERFLY); }} disabled={!ready || failed} className={controlClass}><Wind className="size-3.5" aria-hidden="true" />Fly</button>
          <button type="button" aria-label="Reset garden" disabled={!ready || failed} className={controlClass} onClick={() => {
            api.current?.transitionTo("base"); api.current?.stop(GARDEN_FLIGHT);
            setFound(new Set()); setMessage("Tap the flowers, rabbit, or butterfly.");
          }}><RotateCcw className="size-3.5" aria-hidden="true" /></button>
        </div>
        <p className="min-h-4 text-center text-xs text-muted-foreground" aria-live="polite">{found.size === GARDEN_DISCOVERIES.length ? "You found every little surprise. Make it yours." : message}</p>
        <div className="flex items-center gap-2" aria-label={`${found.size} of ${GARDEN_DISCOVERIES.length} garden discoveries`}>
          {GARDEN_DISCOVERIES.map((id) => <span key={id} aria-hidden="true" className={`size-1.5 rounded-full transition-colors ${found.has(id) ? "bg-primary" : "bg-border"}`} />)}
          <span aria-hidden="true" className="text-[10px] text-muted-foreground">{found.size}/{GARDEN_DISCOVERIES.length}</span>
          <button type="button" onClick={onRemix} className="ml-2 text-[11px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">Make this garden yours</button>
        </div>
      </div>
    </div>
  );
}
