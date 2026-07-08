"use client";

import { useMemo, useState, type WheelEvent } from "react";
import { X } from "lucide-react";
import { clampProgress, docUsesScroll } from "@/runtime/engine";
import { SceneHost } from "@/runtime/react/SceneHost";
import { useDoc } from "./store/document";
import { useUI } from "./store/ui";
import { assetUrl } from "./store/assets";

// px of wheel deltaY to cross full [0,1] — ~a few notches, like one page section
const WHEEL_SCROLL_RANGE_PX = 800;

// mounts the runtime SceneHost against a doc snapshot; overlay keeps the
// editor mounted underneath so camera/selection survive exit (Esc or close)
export function PreviewOverlay() {
  const [doc] = useState(() => useDoc.getState().doc);
  // Preview is a fixed full-screen overlay — there's no host-page scroll to
  // auto-track, so scroll scenes get an explicit scrubber instead (feeds the
  // SceneHost `scrollProgress` prop, same escape hatch a host app would use).
  const [scrollProgress, setScrollProgress] = useState(0);
  const usesScroll = useMemo(() => (doc ? docUsesScroll(doc) : false), [doc]);
  if (!doc) return null;
  // scroll scenes: wheel drives scroll, not zoom. enableZoom off below -> Orbit
  // never preventDefaults the wheel, so the event bubbles here for us to consume
  const onWheel = usesScroll
    ? (e: WheelEvent<HTMLDivElement>) => {
        setScrollProgress((p) =>
          clampProgress(p + e.deltaY / WHEEL_SCROLL_RANGE_PX),
        );
      }
    : undefined;
  return (
    <div className="fixed inset-0 z-40 bg-black" onWheel={onWheel}>
      <SceneHost
        doc={doc}
        resolveAsset={assetUrl}
        orbit
        enableZoom={!usesScroll}
        scrollProgress={usesScroll ? scrollProgress : undefined}
      />
      {usesScroll && (
        <div className="absolute inset-x-0 bottom-4 mx-auto flex w-72 items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
            Scroll
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={scrollProgress}
            onChange={(e) => setScrollProgress(Number(e.currentTarget.value))}
            className="h-1 flex-1 accent-white"
          />
        </div>
      )}
      <button
        type="button"
        title="Exit preview (Esc)"
        onClick={() => useUI.getState().setPreviewing(false)}
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
