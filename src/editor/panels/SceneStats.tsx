"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { BufferGeometry, InstancedMesh, Mesh } from "three";
import { useDoc } from "../store/document";
import { WARN_ASSET_BYTES } from "../store/assets";
import { getSceneObject } from "../viewport/objectRegistry";
import { Section } from "./inspectorShared";

// beyond this, mid-range phones start dropping frames
const WARN_TRIANGLES = 500_000;
const WARN_DRAW_CALLS = 300;
const POLL_MS = 1000;

type RenderStats = { triangles: number; drawCalls: number };

function triangleCount(geometry: BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
  return Math.floor(count / 3);
}

// walks the editor's live objects (glb contents included) — what the runtime will draw
function measure(): RenderStats {
  const stats: RenderStats = { triangles: 0, drawCalls: 0 };
  for (const id of useDoc.getState().doc?.root ?? []) {
    getSceneObject(id)?.traverseVisible((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const instances = (obj as InstancedMesh).isInstancedMesh ? (obj as InstancedMesh).count : 1;
      stats.triangles += triangleCount(mesh.geometry) * instances;
      stats.drawCalls += Math.max(1, mesh.geometry.groups.length);
    });
  }
  return stats;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${warn ? "text-amber-500" : ""}`}>{value}</span>
    </div>
  );
}

export function SceneStatsSection() {
  const nodes = useDoc((s) => (s.doc ? Object.keys(s.doc.nodes).length : 0));
  const materials = useDoc((s) => (s.doc ? Object.keys(s.doc.materials).length : 0));
  const assetBytes = useDoc((s) =>
    s.doc ? Object.values(s.doc.assets).reduce((sum, a) => sum + a.size, 0) : 0,
  );
  const [render, setRender] = useState<RenderStats>(measure);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = measure();
      setRender((prev) =>
        prev.triangles === next.triangles && prev.drawCalls === next.drawCalls ? prev : next,
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const heavyTris = render.triangles > WARN_TRIANGLES;
  const heavyCalls = render.drawCalls > WARN_DRAW_CALLS;
  const heavyAssets = assetBytes > WARN_ASSET_BYTES;

  return (
    <Section title="Stats">
      <Stat label="Triangles" value={render.triangles.toLocaleString()} warn={heavyTris} />
      <Stat label="Draw calls" value={`~${render.drawCalls}`} warn={heavyCalls} />
      <Stat label="Objects" value={String(nodes)} />
      <Stat label="Materials" value={String(materials)} />
      <Stat label="Assets" value={formatBytes(assetBytes)} warn={heavyAssets} />
      {(heavyTris || heavyCalls || heavyAssets) && (
        <p className="mt-1 flex gap-1.5 text-[11px] leading-snug text-amber-500">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          Heavy scene — may load slowly or stutter on phones. Decimate models, merge
          objects or compress textures.
        </p>
      )}
    </Section>
  );
}
