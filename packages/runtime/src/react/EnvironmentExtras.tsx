"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { PCFShadowMap, PCFSoftShadowMap, type Material, type Mesh } from "three";
import type { Environment as EnvironmentDef, ChibiDocument } from "../schema";

type PresetName = NonNullable<EnvironmentDef["preset"]>;

/** applies doc exposure to the renderer's tone mapping */
export function Exposure({ value }: { value: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    gl.toneMappingExposure = value;
    invalidate();
  }, [value, get]);
  return null;
}

/**
 * built-in "soft" studio: a Lightformer rig baked into the environment map —
 * big overhead softbox, warm side fills, cool rim, floor bounce. No CDN fetch.
 */
function SoftStudioEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3}
        color="#ffffff"
        position={[0, 5, 0]}
        rotation-x={Math.PI / 2}
        scale={[10, 10, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.5}
        color="#ffe4c8"
        position={[-6, 2, 1]}
        rotation-y={Math.PI / 2}
        scale={[8, 4, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.2}
        color="#ffd9c2"
        position={[6, 2, 1]}
        rotation-y={-Math.PI / 2}
        scale={[8, 4, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1}
        color="#dce6ff"
        position={[0, 3, -8]}
        scale={[10, 5, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.8}
        color="#ffffff"
        position={[0, -4, 0]}
        rotation-x={-Math.PI / 2}
        scale={[10, 10, 1]}
      />
    </Environment>
  );
}

/** doc environment preset: chibi's built-in soft studio or a drei HDRI */
export function SceneEnvironment({ preset }: { preset: PresetName }) {
  if (preset === "soft") return <SoftStudioEnvironment />;
  return <Environment preset={preset} />;
}

/**
 * always-on base fill so an unlit doc is never black. When an environment
 * preset supplies image-based light, drop to a whisper — full strength on
 * top of an env map flattens scene colors into pastel.
 */
export function BaseLights({ hasEnvironment }: { hasEnvironment: boolean }) {
  return (
    <>
      <hemisphereLight
        intensity={hasEnvironment ? 0.18 : 0.5}
        color="#c8d4ff"
        groundColor="#3a3230"
      />
      <ambientLight intensity={hasEnvironment ? 0.05 : 0.15} />
    </>
  );
}

/**
 * doc softShadows flag -> renderer shadow filtering. Built-in PCF filtering
 * only: drei's <SoftShadows> PCSS injection is incompatible with three r168+
 * (shadow maps are sampler2DShadow now, no RGBA-packed depth) and mutates the
 * global ShaderChunk, which breaks when two canvases mount it.
 */
function ShadowFilter({ soft }: { soft: boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene, invalidate } = get();
    const type = soft ? PCFSoftShadowMap : PCFShadowMap;
    if (gl.shadowMap.type === type) return;
    gl.shadowMap.type = type;
    // shadowmap type is compiled into programs — force a rebuild
    scene.traverse((obj) => {
      const material = (obj as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        m.needsUpdate = true;
      }
    });
    invalidate();
  }, [soft, get]);
  return null;
}

/**
 * per-document look flags: shadow filtering and a blurred contact-shadow
 * plane under the scene. Shared by editor viewport + runtime.
 */
export function EnvironmentFx({
  environment,
}: {
  environment: ChibiDocument["environment"];
}) {
  return (
    <>
      <Exposure value={environment.exposure} />
      <ShadowFilter soft={environment.softShadows} />
      {environment.contactShadows && (
        <ContactShadows
          position={[0, 0.001, 0]}
          opacity={0.6}
          scale={14}
          blur={2.5}
          far={10}
          resolution={512}
        />
      )}
    </>
  );
}
