"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { MeshPhysicalMaterial, SphereGeometry } from "three";
import type { ChibiMaterial } from "@/runtime/schema";
import { BaseLights, SceneEnvironment } from "@/runtime/react/EnvironmentExtras";
import { applyMaterialDef, syncMaps } from "../viewport/materials";

// shared across previews, never mutated
const sphereGeo = new SphereGeometry(1, 32, 32);

function PreviewSphere({ material }: { material: ChibiMaterial }) {
  const mat = useMemo(() => new MeshPhysicalMaterial(), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    applyMaterialDef(mat, material);
    syncMaps(mat, material, invalidate); // repaint when async textures resolve
    invalidate();
  }, [material, mat, invalidate]);
  useEffect(() => () => mat.dispose(), [mat]); // dispose mat only — maps belong to shared texture cache
  return (
    <mesh geometry={sphereGeo}>
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/**
 * Live preview of BASE values only (overrides skipped -> comparable across
 * states), always the "soft" env preset. private material instance — never
 * getSharedMaterial: viewport mutates that cached instance in place with
 * override-merged values -> cross-renderer stomping/flicker
 */
export function MaterialPreviewSphere({ material }: { material: ChibiMaterial }) {
  return (
    <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/20">
      <Canvas dpr={[1, 2]} frameloop="demand" camera={{ position: [0, 0, 2.6], fov: 32 }}>
        <BaseLights hasEnvironment />
        <SceneEnvironment preset="soft" />
        <PreviewSphere material={material} />
      </Canvas>
    </div>
  );
}
