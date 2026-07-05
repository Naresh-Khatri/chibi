"use client";

import { useUI } from "../store/ui";

export function Timeline() {
  const open = useUI((s) => s.timelineOpen);
  const toggle = useUI((s) => s.toggleTimeline);
  return (
    <div className="border-t border-edge bg-panel">
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-full items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-dim hover:text-ink"
      >
        <span>{open ? "▾" : "▸"}</span>
        Timeline
        <span className="font-normal normal-case tracking-normal">
          — keyframe animation arrives in M4
        </span>
      </button>
      {open && (
        <div className="grid h-40 place-items-center border-t border-edge text-xs text-ink-dim">
          Dope-sheet timeline lands in M4 (specs/05-animation.md)
        </div>
      )}
    </div>
  );
}
