"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import type { PerformanceStore } from "./performance";

const serverSnapshot = () => null;
const row: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 26 };

/** Self-contained styles so consuming apps need no Chibi CSS or UI dependencies. */
export function GraphicsDebug({ store, dpr, onDprChange }: {
  store: PerformanceStore;
  dpr: number | undefined;
  onDprChange: (dpr: number | undefined) => void;
}) {
  const sample = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const history = sample?.history ?? [];
  const ceiling = Math.max(33.3, ...history.map((value) => value ?? 0));
  const y = (value: number) => 36 - value / ceiling * 34;
  return (
    <aside
      aria-label="Chibi performance"
      data-lenis-prevent=""
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      style={{
        position: "absolute", bottom: 8, right: 8, zIndex: 10,
        width: 220, maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 16px)", overflow: "auto",
        boxSizing: "border-box", padding: "8px 10px", borderRadius: 6,
        border: "1px solid var(--border, #34343c)", background: "var(--background, #0b0b0f)",
        color: "var(--foreground, #d6d6dc)", font: "12px/1.5 ui-monospace, monospace",
        fontVariantNumeric: "tabular-nums", colorScheme: "dark", pointerEvents: "auto", overscrollBehavior: "contain",
      }}
    >
      <div style={row}><span>FPS</span><span>{sample ? sample.fps.toFixed(1) : "—"}</span></div>
      <div style={row} title="Mean interval between continuous rendered frames, not input or GPU latency. Idle gaps are excluded.">
        <span>Frame time</span><span>{sample?.frameMs == null ? sample?.fps === 0 ? "Idle" : "—" : `${sample.frameMs.toFixed(1)} ms`}</span>
      </div>
      <svg viewBox="0 0 200 40" role="img" aria-label="Frame-time history, with a 16.7 millisecond reference line" style={{ display: "block", width: "100%", height: 40, margin: "4px 0", background: "var(--muted, #1d1d24)" }}>
        <line x1="0" x2="200" y1={y(16.7)} y2={y(16.7)} stroke="var(--muted-foreground, #a1a1aa)" strokeDasharray="3 3" />
        {history.map((value, index) => value === null ? null : <rect key={index} x={(60 - history.length + index) * 200 / 60} y={y(value)} width="2.5" height={Math.max(1, 36 - y(value))} fill="var(--primary, #4d8dff)" />)}
      </svg>
      <div style={row} title="Page-wide JavaScript heap, not GPU memory. Some browsers do not expose this measurement.">
        <span>Memory (JS)</span><span>{sample?.memoryMB == null ? "N/A" : `${sample.memoryMB.toFixed(1)} MB`}</span>
      </div>
      <label style={row}>Resolution
        <select aria-label="Rendering pixel ratio" value={dpr ?? "host"} onChange={(event) => onDprChange(event.target.value === "host" ? undefined : Number(event.target.value))} style={{ font: "inherit", color: "inherit", background: "var(--muted, #1d1d24)", border: "1px solid var(--border, #34343c)", borderRadius: 3, padding: 3 }}>
          <option value="host">Host</option>
          {[0.5, 0.75, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      <div style={{ textAlign: "right", color: "var(--muted-foreground, #a1a1aa)" }}>{sample ? `${sample.width} × ${sample.height} · ${sample.dpr.toFixed(2)}×` : "—"}</div>
    </aside>
  );
}
