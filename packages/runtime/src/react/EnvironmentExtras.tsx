"use client";

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CanvasTexture,
  Color,
  NeutralToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type Texture,
  type ToneMapping,
} from "three";
import type { Environment as EnvironmentDef, ChibiDocument } from "../schema";
import { needsPostFx, PostFx } from "./PostFx";

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

const TONE_MAPPINGS: Record<EnvironmentDef["toneMapping"], ToneMapping> = {
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
  agx: AgXToneMapping,
};

/**
 * doc toneMapping -> renderer, used when the effect composer is NOT mounted
 * (the composer forces NoToneMapping and tone-maps in its own final pass).
 * three rebuilds programs on renderer.toneMapping change by itself.
 */
function ToneMappingControl({ mode }: { mode: EnvironmentDef["toneMapping"] }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    const previous = gl.toneMapping;
    gl.toneMapping = TONE_MAPPINGS[mode];
    invalidate();
    return () => {
      gl.toneMapping = previous;
    };
  }, [mode, get]);
  return null;
}

/**
 * screen-space radial gradient baked into a small canvas texture, blue-noise
 * dithered against banding. Spline-style: lighter center, darker edges.
 */
function gradientTexture(center: string, edge: string): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size * 0.72,
  );
  gradient.addColorStop(0, center);
  gradient.addColorStop(1, edge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  // ±1-step dither so the 8-bit ramp doesn't band on large screens
  const image = ctx.getImageData(0, 0, size, size);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const noise = Math.random() * 2 - 1;
    px[i] += noise;
    px[i + 1] += noise;
    px[i + 2] += noise;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * doc background -> scene.background: flat color, or a radial gradient
 * (background at the center -> backgroundGradient at the edges) when set.
 * Replaces `<color attach="background">` in both hosts.
 */
export function SceneBackground({
  color,
  gradient,
}: {
  color: string;
  gradient: string | null;
}) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { scene, invalidate } = get();
    const background: Color | Texture = gradient
      ? gradientTexture(color, gradient)
      : new Color(color);
    scene.background = background;
    invalidate();
    return () => {
      if (scene.background === background) scene.background = null;
      if ("dispose" in background) background.dispose();
    };
  }, [color, gradient, get]);
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
 * the postprocessing EffectComposer (mounted whenever AO/bloom/vignette is
 * on) permanently flips renderer.autoClear to false as a side effect of its
 * own multi-pass compositing (see the `postprocessing` package's internal
 * setup), and @react-three/postprocessing's wrapper re-persists that same
 * false value every frame instead of restoring the pre-composer default.
 * ContactShadows renders its offscreen depth pass at the default useFrame
 * priority (0) with no clear of its own, so with autoClear stuck false, old
 * geometry never gets erased from its shadow texture — moving an object
 * leaves its old silhouette shadowed forever. Force autoClear back on before
 * anything else runs each frame (priority -1 sorts first).
 */
function ContactShadowAutoClearFix() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    gl.autoClear = true;
  }, -1);
  return null;
}

/**
 * per-document look flags: shadow filtering, tone mapping, postprocessing
 * (AO/bloom/vignette) and a blurred contact-shadow plane under the scene.
 * Shared by editor viewport + runtime.
 */
export function EnvironmentFx({
  environment,
}: {
  environment: ChibiDocument["environment"];
}) {
  const post = needsPostFx(environment);
  return (
    <>
      <Exposure value={environment.exposure} />
      <ShadowFilter soft={environment.softShadows} />
      {post ? (
        <PostFx environment={environment} />
      ) : (
        <ToneMappingControl mode={environment.toneMapping} />
      )}
      {environment.contactShadows && (
        <>
          <ContactShadowAutoClearFix />
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={0.6}
            scale={14}
            blur={2.5}
            far={10}
            resolution={512}
          />
        </>
      )}
    </>
  );
}
