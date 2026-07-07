"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MATERIAL_ANIMATABLES,
  NODE_ANIMATABLES,
  materialAnimatable,
  nodeAnimatable,
  type AnimatableDef,
  type AnimationClip,
  type ChibiDocument,
  type Easing,
  type Track,
  type Vec3,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  addClip,
  addKeyframe,
  addTrack,
  getAnimatableValue,
  moveKeyframe,
  removeClip,
  removeKeyframe,
  removeTrack,
  setClipProp,
  setKeyframe,
} from "../store/animationCommands";
import {
  Checkbox,
  ColorInput,
  DragNumber,
  Dropdown,
  TextInput,
  type MenuItem,
} from "./controls";
import {
  ChevronDown,
  ChevronRight,
  Clapperboard,
  DiamondPlus,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PPS = 120; // fixed pixels per second; horizontal scroll instead of zoom
const LABEL_W = 240;
const SNAP_S = 0.05;
const T_EPSILON = 1e-6;
const RAD2DEG = 180 / Math.PI;
const EASE_OPTIONS: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut"];

// one mergeKey per drag gesture so a whole drag coalesces into one undo entry
let dragSeq = 0;

/** A selected keyframe, identified by time (indices shift on retime). */
type KfSel = {
  targetId: string;
  property: string;
  t: number;
  anchorX: number;
  anchorY: number;
};

function trackKey(t: { targetId: string; property: string }): string {
  return `${t.targetId}:${t.property}`;
}

function useActiveClip(): AnimationClip | null {
  const activeId = useUI((s) => s.activeClipId);
  return useDoc((s) =>
    activeId ? (s.doc?.animations[activeId] ?? null) : null,
  );
}

function trackDef(
  doc: ChibiDocument,
  track: Track,
): { def: AnimatableDef | undefined; targetName: string | null } {
  const node = doc.nodes[track.targetId];
  if (node) return { def: nodeAnimatable(track.property), targetName: node.name };
  const material = doc.materials[track.targetId];
  if (material) {
    return { def: materialAnimatable(track.property), targetName: material.name };
  }
  return { def: undefined, targetName: null };
}

export function Timeline() {
  const open = useUI((s) => s.timelineOpen);
  const toggle = useUI((s) => s.toggleTimeline);
  const clip = useActiveClip();
  const animations = useDoc((s) => s.doc?.animations);

  // keep the active clip valid as clips are created/deleted/undone
  useEffect(() => {
    const ui = useUI.getState();
    const ids = Object.keys(animations ?? {});
    if (ui.activeClipId && !ids.includes(ui.activeClipId)) {
      ui.setActiveClip(ids[0] ?? null);
    } else if (!ui.activeClipId && ids.length) {
      ui.setActiveClip(ids[0]);
    }
  }, [animations]);

  // keep the playhead inside the clip when its duration shrinks
  const duration = clip?.duration;
  useEffect(() => {
    const ui = useUI.getState();
    if (duration !== undefined && ui.playhead > duration) {
      ui.setPlayhead(duration);
    }
  }, [duration]);

  return (
    <div className="border-t border-border bg-card">
      <div className="flex h-8 items-center gap-2 px-2">
        <button
          type="button"
          onClick={toggle}
          title="Toggle timeline (Shift+T)"
          className="flex h-8 items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <Clapperboard className="size-3" />
          Timeline
        </button>
        {open && <Transport clip={clip} />}
        {open && <div className="flex-1" />}
        {open && <ClipControls clip={clip} />}
      </div>
      {open && (
        <div className="h-56 border-t border-border">
          {clip ? (
            <TrackArea clip={clip} />
          ) : (
            <div className="grid h-full place-items-center">
              <Button variant="secondary" size="xs" onClick={() => addClip()}>
                <Plus />
                New clip
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Transport({ clip }: { clip: AnimationClip | null }) {
  const playback = useUI((s) => s.playback);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="secondary"
        size="icon-xs"
        disabled={!clip}
        title="Play/pause (Space)"
        onClick={() => useUI.getState().togglePlay()}
      >
        {playback === "playing" ? <Pause /> : <Play />}
      </Button>
      <Button
        variant="secondary"
        size="icon-xs"
        disabled={!clip || playback === "stopped"}
        title="Stop — restores document values"
        onClick={() => useUI.getState().stopPlayback()}
      >
        <Square />
      </Button>
      <TimeReadout duration={clip?.duration ?? 0} />
    </div>
  );
}

function TimeReadout({ duration }: { duration: number }) {
  const playhead = useUI((s) => s.playhead);
  return (
    <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">
      {playhead.toFixed(2)} / {duration.toFixed(2)}s
    </span>
  );
}

function ClipControls({ clip }: { clip: AnimationClip | null }) {
  const animations = useDoc((s) => s.doc?.animations);
  const clips = Object.values(animations ?? {});
  return (
    <div className="flex items-center gap-2">
      <Dropdown
        title="Switch clip"
        button={<span>{clip ? clip.name : "No clips"}</span>}
        disabled={clips.length === 0}
        align="right"
        items={clips.map(
          (c): MenuItem => ({
            label: c.name,
            checked: c.id === clip?.id,
            onSelect: () => useUI.getState().setActiveClip(c.id),
          }),
        )}
      />
      {clip && (
        <>
          <div className="w-28">
            <TextInput
              value={clip.name}
              onCommit={(name) => setClipProp(clip.id, { name })}
            />
          </div>
          <div className="w-20">
            <DragNumber
              label="s"
              value={clip.duration}
              min={0.1}
              step={0.1}
              onCommit={(v, merge) =>
                setClipProp(
                  clip.id,
                  { duration: v },
                  merge ? { mergeKey: `clipdur:${clip.id}` } : undefined,
                )
              }
            />
          </div>
          <Checkbox
            label="Loop"
            checked={clip.loop}
            onChange={(loop) => setClipProp(clip.id, { loop })}
          />
        </>
      )}
      <Button
        variant="secondary"
        size="icon-xs"
        title="New clip"
        onClick={() => addClip()}
      >
        <Plus />
      </Button>
      {clip && (
        <Button
          variant="secondary"
          size="icon-xs"
          title="Delete clip"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => removeClip(clip.id)}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function TrackArea({ clip }: { clip: AnimationClip }) {
  const [sel, setSel] = useState<KfSel | null>(null);
  const laneW = Math.max(clip.duration * PPS + 48, 320);

  // drop the popover if its keyframe vanished (undo, track deleted, …)
  const selValid =
    sel !== null &&
    clip.tracks.some(
      (t) =>
        t.targetId === sel.targetId &&
        t.property === sel.property &&
        t.keyframes.some((k) => Math.abs(k.t - sel.t) < T_EPSILON),
    );

  return (
    <div className="relative h-full overflow-auto">
      <div className="relative" style={{ width: LABEL_W + laneW }}>
        <div className="sticky top-0 z-30 flex bg-card">
          <div
            className="sticky left-0 z-10 flex h-6 shrink-0 items-center border-b border-r border-border bg-card px-2"
            style={{ width: LABEL_W }}
          >
            <AddTrackMenu clip={clip} />
          </div>
          <Ruler clip={clip} laneW={laneW} />
        </div>
        {clip.tracks.length === 0 && (
          <div className="flex h-10 items-center px-3 text-xs text-muted-foreground">
            Select an object, then add a track with “+ Track”.
          </div>
        )}
        {clip.tracks.map((track) => (
          <TrackRow
            key={trackKey(track)}
            clip={clip}
            track={track}
            sel={selValid ? sel : null}
            setSel={setSel}
          />
        ))}
        <Playhead trackCount={clip.tracks.length} />
      </div>
      {selValid && sel && (
        <KeyframePopover clip={clip} sel={sel} setSel={setSel} />
      )}
    </div>
  );
}

function AddTrackMenu({ clip }: { clip: AnimationClip }) {
  const selectedId = useUI((s) => s.selectedId);
  const node = useDoc((s) => (selectedId ? s.doc?.nodes[selectedId] : undefined));
  const material = useDoc((s) =>
    node?.type === "mesh" || node?.type === "model"
      ? s.doc?.materials[node.materialId ?? ""]
      : undefined,
  );

  const existing = new Set(clip.tracks.map(trackKey));
  const items: MenuItem[] = [];
  if (node) {
    for (const def of NODE_ANIMATABLES) {
      if (existing.has(`${node.id}:${def.property}`)) continue;
      items.push({
        label: def.label,
        onSelect: () => addTrack(clip.id, node.id, def.property),
      });
    }
    if (material) {
      for (const def of MATERIAL_ANIMATABLES) {
        if (existing.has(`${material.id}:${def.property}`)) continue;
        items.push({
          label: `Material · ${def.label}`,
          onSelect: () => addTrack(clip.id, material.id, def.property),
        });
      }
    }
  }

  return (
    <Dropdown
      button={
        <>
          <Plus className="size-3" />
          Track
        </>
      }
      chevron={false}
      disabled={!node || items.length === 0}
      title={node ? "Add a track for the selected object" : "Select an object first"}
      items={items}
    />
  );
}

function Ruler({ clip, laneW }: { clip: AnimationClip; laneW: number }) {
  const ref = useRef<HTMLDivElement>(null);

  const scrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const t = Math.min(
      Math.max((e.clientX - rect.left) / PPS, 0),
      clip.duration,
    );
    useUI.getState().setPlayhead(Number(t.toFixed(3)));
  };

  const ticks: { x: number; label?: string }[] = [];
  for (let s = 0; s <= Math.ceil(clip.duration * 2); s++) {
    const t = s / 2;
    ticks.push({ x: t * PPS, label: t % 1 === 0 ? `${t}` : undefined });
  }

  return (
    <div
      ref={ref}
      className="relative h-6 shrink-0 cursor-col-resize border-b border-border"
      style={{ width: laneW }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrub(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) scrub(e);
      }}
    >
      {ticks.map(({ x, label }) => (
        <div key={x} className="absolute bottom-0" style={{ left: x }}>
          <div className={`w-px bg-border ${label ? "h-3" : "h-1.5"}`} />
          {label && (
            <span className="absolute bottom-3 left-1 text-[9px] text-muted-foreground">
              {label}
            </span>
          )}
        </div>
      ))}
      {/* out-of-clip region */}
      <div
        className="absolute inset-y-0 bg-black/20"
        style={{ left: clip.duration * PPS, right: 0 }}
      />
    </div>
  );
}

function Playhead({ trackCount }: { trackCount: number }) {
  const playhead = useUI((s) => s.playhead);
  return (
    <div
      className="pointer-events-none absolute z-20 w-px bg-primary"
      style={{
        left: LABEL_W + playhead * PPS,
        top: 0,
        height: 24 + Math.max(trackCount, 1) * 28,
      }}
    >
      <div className="absolute -left-[3px] top-0 h-2 w-[7px] rounded-b-sm bg-primary" />
    </div>
  );
}

function TrackRow({
  clip,
  track,
  sel,
  setSel,
}: {
  clip: AnimationClip;
  track: Track;
  sel: KfSel | null;
  setSel: (sel: KfSel | null) => void;
}) {
  const doc = useDoc((s) => s.doc);
  if (!doc) return null;
  const { def, targetName } = trackDef(doc, track);
  const label = def
    ? `${targetName ?? "(missing)"} · ${def.label}`
    : `(missing) · ${track.property}`;

  const addKeyAtPlayhead = () => {
    const t = Number(useUI.getState().playhead.toFixed(3));
    const v = getAnimatableValue(doc, track.targetId, track.property);
    if (v !== undefined) {
      addKeyframe(clip.id, track.targetId, track.property, t, v);
    }
  };

  const rowBtn =
    "grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

  return (
    <div className="flex h-7">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-b border-r border-border bg-card pl-2 pr-1"
        style={{ width: LABEL_W }}
      >
        <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={label}>
          {label}
        </span>
        <button
          type="button"
          className={rowBtn}
          title="Add key at playhead (captures the current value)"
          disabled={!targetName}
          onClick={addKeyAtPlayhead}
        >
          <DiamondPlus className="size-3.5" />
        </button>
        <button
          type="button"
          className={rowBtn}
          title="Remove track"
          onClick={() => removeTrack(clip.id, track.targetId, track.property)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="relative h-7 border-b border-border/50">
        {/* keyed by index: stable through mid-drag re-sorts (no remount = capture kept) */}
        {track.keyframes.map((kf, i) => (
          <KeyframeDiamond
            key={i}
            clip={clip}
            track={track}
            index={i}
            selected={
              sel !== null &&
              sel.targetId === track.targetId &&
              sel.property === track.property &&
              Math.abs(sel.t - kf.t) < T_EPSILON
            }
            setSel={setSel}
          />
        ))}
      </div>
    </div>
  );
}

function KeyframeDiamond({
  clip,
  track,
  index,
  selected,
  setSel,
}: {
  clip: AnimationClip;
  track: Track;
  index: number;
  selected: boolean;
  setSel: (sel: KfSel | null) => void;
}) {
  const kf = track.keyframes[index];
  const drag = useRef<{
    startX: number;
    startT: number;
    curT: number;
    moved: boolean;
    mergeKey: string;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startX: e.clientX,
      startT: kf.t,
      curT: kf.t,
      moved: false,
      mergeKey: `kfdrag:${dragSeq++}`,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 3) return;
    if (!d.moved) {
      d.moved = true;
      setSel(null); // retiming invalidates a time-keyed selection
    }
    let t = Math.min(Math.max(d.startT + dx / PPS, 0), clip.duration);
    if (e.ctrlKey || e.metaKey) t = Math.round(t / SNAP_S) * SNAP_S;
    t = Number(t.toFixed(3));
    if (t === d.curT) return;
    // the array re-sorts on every move; locate the dragged key by its time
    const i = track.keyframes.findIndex(
      (k) => Math.abs(k.t - d.curT) < T_EPSILON,
    );
    if (i < 0) return;
    moveKeyframe(clip.id, track.targetId, track.property, i, t, {
      mergeKey: d.mergeKey,
    });
    d.curT = t;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSel({
      targetId: track.targetId,
      property: track.property,
      t: kf.t,
      anchorX: rect.left + rect.width / 2,
      anchorY: rect.top,
    });
  };

  return (
    <button
      type="button"
      className="absolute top-1/2 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center"
      style={{ left: kf.t * PPS }}
      title={`t = ${kf.t}s`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span
        className={`h-2 w-2 rotate-45 ${
          selected ? "bg-primary" : "bg-muted-foreground hover:bg-foreground"
        }`}
      />
    </button>
  );
}

function KeyframePopover({
  clip,
  sel,
  setSel,
}: {
  clip: AnimationClip;
  sel: KfSel;
  setSel: (sel: KfSel | null) => void;
}) {
  const doc = useDoc((s) => s.doc);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setSel(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [setSel]);

  const track = clip.tracks.find(
    (t) => t.targetId === sel.targetId && t.property === sel.property,
  );
  const index =
    track?.keyframes.findIndex((k) => Math.abs(k.t - sel.t) < T_EPSILON) ?? -1;
  if (!doc || !track || index < 0) return null;
  const kf = track.keyframes[index];
  const { def } = trackDef(doc, track);

  const key = trackKey(track);
  const commitValue = (v: typeof kf.v, merge: boolean) =>
    setKeyframe(
      clip.id,
      track.targetId,
      track.property,
      index,
      { v },
      merge ? { mergeKey: `kfv:${clip.id}:${key}` } : undefined,
    );

  const left = Math.min(Math.max(sel.anchorX, 130), window.innerWidth - 130);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-60 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover p-2 shadow-xl"
      style={{ left, top: sel.anchorY - 8 }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="w-24">
            <DragNumber
              label="T"
              value={kf.t}
              min={0}
              max={clip.duration}
              step={0.05}
              onCommit={(v, merge) => {
                const t = Number(v.toFixed(3));
                moveKeyframe(
                  clip.id,
                  track.targetId,
                  track.property,
                  index,
                  t,
                  merge ? { mergeKey: `kft:${clip.id}:${key}` } : undefined,
                );
                setSel({ ...sel, t });
              }}
            />
          </div>
          <Select
            value={kf.ease ?? "easeInOut"}
            onValueChange={(v) =>
              setKeyframe(clip.id, track.targetId, track.property, index, {
                ease: v as Easing,
              })
            }
          >
            <SelectTrigger
              size="sm"
              className="h-6! min-w-0 flex-1 px-1.5 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EASE_OPTIONS.map((ease) => (
                <SelectItem key={ease} value={ease} className="text-xs">
                  {ease}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            title="Delete keyframe"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onClick={() => {
              removeKeyframe(clip.id, track.targetId, track.property, index);
              setSel(null);
            }}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
        <KeyframeValueEditor
          kind={def?.kind}
          property={track.property}
          value={kf.v}
          min={def?.min}
          max={def?.max}
          onCommit={commitValue}
        />
      </div>
    </div>
  );
}

function KeyframeValueEditor({
  kind,
  property,
  value,
  min,
  max,
  onCommit,
}: {
  kind: AnimatableDef["kind"] | undefined;
  property: string;
  value: number | string | boolean | Vec3;
  min?: number;
  max?: number;
  onCommit: (v: number | string | boolean | Vec3, merge: boolean) => void;
}) {
  if (kind === "vec3" && Array.isArray(value)) {
    // rotation is radians in the document, degrees in the UI
    const degrees = property === "transform.rotation";
    const shown = degrees ? (value.map((v) => v * RAD2DEG) as Vec3) : value;
    return (
      <div className="flex gap-1">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <DragNumber
            key={axis}
            label={axis}
            value={Number(shown[i].toFixed(degrees ? 1 : 3))}
            step={degrees ? 1 : 0.1}
            onCommit={(v, merge) => {
              const next = [...value] as Vec3;
              next[i] = degrees ? v / RAD2DEG : v;
              onCommit(next, merge);
            }}
          />
        ))}
      </div>
    );
  }
  if (kind === "color" && typeof value === "string") {
    return <ColorInput value={value} onCommit={onCommit} />;
  }
  if (kind === "scalar" && typeof value === "number") {
    return (
      <DragNumber
        label="V"
        value={value}
        min={min}
        max={max}
        step={0.01}
        onCommit={onCommit}
      />
    );
  }
  if (kind === "step" && typeof value === "boolean") {
    return <Checkbox label="Visible" checked={value} onChange={(v) => onCommit(v, false)} />;
  }
  return null;
}
