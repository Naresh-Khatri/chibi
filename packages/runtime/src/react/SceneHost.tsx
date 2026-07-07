"use client";

import {
  Component,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Clone, OrbitControls, Text3D, useGLTF } from "@react-three/drei";
import {
  DoubleSide,
  MeshPhysicalMaterial,
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Mesh,
  type Object3D,
} from "three";
import {
  DEFAULT_MATERIAL_ID,
  numParam,
  strParam,
  type ChibiAsset,
  type ChibiDocument,
  type ChibiMaterial,
  type GroupNode,
  type LightNode,
  type MeshNode,
  type ModelNode,
  type PropertyValue,
} from "../schema";
import {
  InteractionRuntime,
  interactiveNodeIds,
  parseTargetKey,
  type RuntimeEvent,
} from "../engine";
import type { ResolveAssetUrl } from "../assets";
import { FONT_URL, GeometryElement } from "./Geometry";
import {
  BaseLights,
  EnvironmentFx,
  SceneBackground,
  SceneEnvironment,
} from "./EnvironmentExtras";

export type { ResolveAssetUrl } from "../assets";

export type SceneHostProps = {
  doc: ChibiDocument;
  /** asset record -> URL. editor: IndexedDB; runtime: zip / host callback */
  resolveAsset?: ResolveAssetUrl;
  /** pointer triggers active (default true) */
  interactive?: boolean;
  /** user orbit around the scene camera (default false) */
  orbit?: boolean;
  /** fire `start` triggers on mount (default true) */
  autoStart?: boolean;
  /** engine events + "ready" surface here */
  onEvent?: (event: RuntimeEvent) => void;
  /** the live engine instance — <ChibiScene> binds its api ref to it */
  onRuntime?: (runtime: InteractionRuntime | null) => void;
};

/**
 * chrome-less interactive render from the doc's scene camera; engine values
 * (transitions, clips) applied imperatively each frame. core of the runtime
 * <ChibiScene> — M6 wraps it, the editor's Preview mounts it directly.
 * frameloop is demand-driven: the engine wakes it, useFrame re-invalidates
 * while motion is in flight, so an idle scene renders zero frames.
 */
export function SceneHost({
  doc,
  resolveAsset,
  interactive = true,
  orbit = false,
  autoStart = true,
  onEvent,
  onRuntime,
}: SceneHostProps) {
  return (
    <Canvas
      shadows={doc.environment.shadows}
      dpr={[1, 2]}
      frameloop="demand"
      camera={{
        position: doc.camera.position,
        fov: doc.camera.fov,
        near: 0.1,
        far: 500,
      }}
      onCreated={({ camera }) => {
        camera.lookAt(...doc.camera.target);
      }}
    >
      <SceneBackground
        color={doc.environment.background}
        gradient={doc.environment.backgroundGradient}
      />
      {doc.environment.fog && (
        <fog
          attach="fog"
          args={[
            doc.environment.fog.color,
            doc.environment.fog.near,
            doc.environment.fog.far,
          ]}
        />
      )}
      <BaseLights hasEnvironment={Boolean(doc.environment.preset)} />
      <EnvironmentFx environment={doc.environment} />
      {doc.environment.preset && (
        <PresetBoundary key={doc.environment.preset}>
          <Suspense fallback={null}>
            <SceneEnvironment preset={doc.environment.preset} />
          </Suspense>
        </PresetBoundary>
      )}
      {orbit && <OrbitControls target={doc.camera.target} makeDefault />}
      <Suspense fallback={null}>
        <InteractiveScene
          doc={doc}
          resolveAsset={resolveAsset}
          interactive={interactive}
          autoStart={autoStart}
          onEvent={onEvent}
          onRuntime={onRuntime}
        />
      </Suspense>
    </Canvas>
  );
}

// preset HDRIs come from a CDN; offline failure drops the env, not the canvas
class PresetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.warn("chibi: environment preset failed to load (offline?)");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type SceneCtx = {
  doc: ChibiDocument;
  runtime: InteractionRuntime;
  registry: Map<string, Object3D>;
  materials: Map<string, MeshPhysicalMaterial>;
  interactive: { click: Set<string>; hover: Set<string> };
  resolveAsset?: ResolveAssetUrl;
  /** re-render request for out-of-band loads (textures) under frameloop="demand" */
  invalidate: () => void;
};

const Ctx = createContext<SceneCtx | null>(null);

function useSceneCtx(): SceneCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SceneHost context missing");
  return ctx;
}

function InteractiveScene({
  doc,
  resolveAsset,
  interactive = true,
  autoStart = true,
  onEvent,
  onRuntime,
}: SceneHostProps) {
  const invalidate = useThree((s) => s.invalidate);
  // latest-callback ref so a new onEvent identity doesn't remount the engine
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const ctx = useMemo<SceneCtx>(() => {
    // engine hooks wired at construction — the memoized value is never
    // mutated afterwards (react-hooks/immutability)
    const runtime = new InteractionRuntime(doc);
    runtime.onWake = () => invalidate();
    runtime.onEvent = (e) => onEventRef.current?.(e);
    return {
      doc,
      runtime,
      registry: new Map(),
      materials: new Map(),
      interactive: interactive
        ? interactiveNodeIds(doc)
        : { click: new Set<string>(), hover: new Set<string>() },
      resolveAsset,
      invalidate: () => invalidate(),
    };
  }, [doc, resolveAsset, interactive, invalidate]);

  useEffect(() => {
    onRuntime?.(ctx.runtime);
    if (autoStart) ctx.runtime.start();
    onEventRef.current?.({ type: "ready" });
    ctx.invalidate();
    const materials = ctx.materials;
    return () => {
      onRuntime?.(null);
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
    };
    // autoStart/onRuntime are mount-time concerns; ctx is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useFrame((_, delta) => {
    // demand frames after an idle stretch arrive with a huge delta — clamp
    // so a transition doesn't jump straight to its end
    for (const [key, value] of ctx.runtime.advance(Math.min(delta, 0.1))) {
      applyValue(ctx, key, value);
    }
    if (ctx.runtime.isActive()) ctx.invalidate();
  });

  return (
    <Ctx.Provider value={ctx}>
      {doc.root.map((id) => (
        <RNode key={id} id={id} />
      ))}
    </Ctx.Provider>
  );
}

function applyValue(ctx: SceneCtx, key: string, value: PropertyValue) {
  const { targetId, property } = parseTargetKey(key);
  if (ctx.doc.nodes[targetId]) {
    const obj = ctx.registry.get(targetId);
    if (!obj) return;
    if (property === "visible") {
      obj.visible = Boolean(value);
      return;
    }
    if (!Array.isArray(value)) return;
    switch (property) {
      case "transform.position":
        obj.position.set(value[0], value[1], value[2]);
        break;
      case "transform.rotation":
        obj.rotation.set(value[0], value[1], value[2]);
        break;
      case "transform.scale":
        obj.scale.set(value[0], value[1], value[2]);
        break;
    }
    return;
  }
  const def = ctx.doc.materials[targetId];
  const mat = ctx.materials.get(targetId);
  if (!def || !mat) return;
  if (property === "color" && typeof value === "string") mat.color.set(value);
  if (property === "opacity" && typeof value === "number") {
    mat.opacity = value;
    mat.transparent = def.transparent || value < 1;
  }
}

const MAP_SLOTS = [
  ["map", true],
  ["normalMap", false],
  ["roughnessMap", false],
] as const;

function runtimeMaterial(
  ctx: SceneCtx,
  materialId: string,
): MeshPhysicalMaterial | undefined {
  const def =
    ctx.doc.materials[materialId] ?? ctx.doc.materials[DEFAULT_MATERIAL_ID];
  if (!def) return undefined;
  let mat = ctx.materials.get(def.id);
  if (!mat) {
    mat = new MeshPhysicalMaterial();
    mat.side = DoubleSide;
    mat.color.set(def.color);
    mat.metalness = def.metalness;
    mat.roughness = def.roughness;
    mat.emissive.set(def.emissive);
    mat.emissiveIntensity = def.emissiveIntensity;
    mat.opacity = def.opacity;
    mat.transparent = def.transparent || def.opacity < 1;
    mat.flatShading = def.flatShading;
    mat.clearcoat = def.clearcoat;
    mat.clearcoatRoughness = def.clearcoatRoughness;
    mat.sheen = def.sheen;
    mat.sheenColor.set(def.sheenColor);
    loadMaps(ctx, def, mat);
    ctx.materials.set(def.id, mat);
  }
  return mat;
}

function loadMaps(ctx: SceneCtx, def: ChibiMaterial, mat: MeshPhysicalMaterial) {
  const resolveAsset = ctx.resolveAsset;
  if (!resolveAsset) return;
  const loader = new TextureLoader();
  for (const [slot, srgb] of MAP_SLOTS) {
    const assetId = def.maps[slot];
    const asset = assetId ? ctx.doc.assets[assetId] : undefined;
    if (!asset) continue;
    resolveAsset(asset)
      .then((url) => loader.loadAsync(url))
      .then((texture) => {
        texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        mat[slot] = texture;
        mat.needsUpdate = true;
        ctx.invalidate();
      })
      .catch((err) =>
        console.warn(`chibi: texture "${asset.name}" failed to load`, err),
      );
  }
}

function useRegister(ctx: SceneCtx, id: string) {
  return useCallback(
    (obj: Object3D | null) => {
      if (obj) ctx.registry.set(id, obj);
      else ctx.registry.delete(id);
    },
    [ctx, id],
  );
}

// events bubble up the three hierarchy — a child hit triggers interactive
// ancestors; nodes without interactions attach nothing, stay transparent
function usePointerHandlers(ctx: SceneCtx, id: string) {
  const isClick = ctx.interactive.click.has(id);
  const isHover = ctx.interactive.hover.has(id);
  if (!isClick && !isHover) return {};
  const setCursor = (e: ThreeEvent<PointerEvent>, cursor: string) => {
    const canvas = e.nativeEvent.target;
    if (canvas instanceof HTMLElement) canvas.style.cursor = cursor;
  };
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      ctx.runtime.pointer("click", id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (isClick) setCursor(e, "pointer");
      ctx.runtime.pointer("hoverEnter", id);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (isClick) setCursor(e, "");
      ctx.runtime.pointer("hoverExit", id);
    },
  };
}

function RNode({ id }: { id: string }) {
  const ctx = useSceneCtx();
  const node = ctx.doc.nodes[id];
  if (!node) return null;
  switch (node.type) {
    case "mesh":
      return <RMesh node={node} />;
    case "group":
      return <RGroup node={node} />;
    case "light":
      return <RLight node={node} />;
    case "model":
      return <RModel node={node} />;
  }
}

function RChildren({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((cid) => (
        <RNode key={cid} id={cid} />
      ))}
    </>
  );
}

function RMesh({ node }: { node: MeshNode }) {
  const ctx = useSceneCtx();
  const material = runtimeMaterial(ctx, node.materialId);
  const handlers = usePointerHandlers(ctx, node.id);
  const ref = useRegister(ctx, node.id);
  const { position, rotation, scale } = node.transform;

  if (node.geometry.kind === "text3d") {
    const bevel = numParam(node.geometry.params, "bevel", 0);
    return (
      <group
        ref={ref}
        position={position}
        rotation={rotation}
        scale={scale}
        visible={node.visible}
        {...handlers}
      >
        <Text3D
          font={FONT_URL}
          size={numParam(node.geometry.params, "size", 0.5)}
          height={numParam(node.geometry.params, "depth", 0.2)}
          bevelEnabled={bevel > 0}
          bevelSize={bevel}
          bevelThickness={bevel}
          bevelSegments={4}
          castShadow={node.castShadow}
          receiveShadow={node.receiveShadow}
          material={material}
        >
          {strParam(node.geometry.params, "text", "chibi")}
        </Text3D>
        <RChildren ids={node.children} />
      </group>
    );
  }

  return (
    <mesh
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
      castShadow={node.castShadow}
      receiveShadow={node.receiveShadow}
      material={material}
      {...handlers}
    >
      <GeometryElement kind={node.geometry.kind} params={node.geometry.params} />
      <RChildren ids={node.children} />
    </mesh>
  );
}

function RGroup({ node }: { node: GroupNode }) {
  const ctx = useSceneCtx();
  const handlers = usePointerHandlers(ctx, node.id);
  const ref = useRegister(ctx, node.id);
  const { position, rotation, scale } = node.transform;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
      {...handlers}
    >
      <RChildren ids={node.children} />
    </group>
  );
}

function RLight({ node }: { node: LightNode }) {
  const ctx = useSceneCtx();
  const ref = useRegister(ctx, node.id);
  const { position, rotation, scale } = node.transform;
  const light = node.light;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
    >
      {light.kind === "directional" && (
        <directionalLight
          color={light.color}
          intensity={light.intensity}
          castShadow={light.castShadow}
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={0.05}
        />
      )}
      {light.kind === "point" && (
        <pointLight
          color={light.color}
          intensity={light.intensity}
          distance={light.distance ?? 0}
          castShadow={light.castShadow}
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={0.05}
        />
      )}
      {light.kind === "spot" && (
        <spotLight
          color={light.color}
          intensity={light.intensity}
          distance={light.distance ?? 0}
          angle={light.angle ?? Math.PI / 6}
          penumbra={light.penumbra ?? 0.3}
          castShadow={light.castShadow}
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={0.05}
        />
      )}
      <RChildren ids={node.children} />
    </group>
  );
}

class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.warn("chibi: model failed to load");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RModel({ node }: { node: ModelNode }) {
  const ctx = useSceneCtx();
  const asset = ctx.doc.assets[node.assetId];
  const handlers = usePointerHandlers(ctx, node.id);
  const ref = useRegister(ctx, node.id);
  const { position, rotation, scale } = node.transform;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
      {...handlers}
    >
      {asset && ctx.resolveAsset && (
        <ModelBoundary>
          <Suspense fallback={null}>
            <RGlb
              asset={asset}
              resolveAsset={ctx.resolveAsset}
              castShadow={node.castShadow}
              receiveShadow={node.receiveShadow}
            />
          </Suspense>
        </ModelBoundary>
      )}
      <RChildren ids={node.children} />
    </group>
  );
}

function RGlb({
  asset,
  resolveAsset,
  castShadow,
  receiveShadow,
}: {
  asset: ChibiAsset;
  resolveAsset: ResolveAssetUrl;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    resolveAsset(asset)
      .then((u) => active && setUrl(u))
      .catch((err) =>
        console.warn(`chibi: asset data missing for "${asset.name}"`, err),
      );
    return () => {
      active = false;
    };
  }, [asset, resolveAsset]);
  if (!url) return null;
  return <RGlbScene url={url} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

function RGlbScene({
  url,
  castShadow,
  receiveShadow,
}: {
  url: string;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const gltf = useGLTF(url);
  const applyShadows = useCallback(
    (group: Group | null) => {
      group?.traverse((obj) => {
        if ((obj as Mesh).isMesh) {
          obj.castShadow = castShadow;
          obj.receiveShadow = receiveShadow;
        }
      });
    },
    [castShadow, receiveShadow],
  );
  return (
    <group ref={applyShadows}>
      <Clone object={gltf.scene} />
    </group>
  );
}
