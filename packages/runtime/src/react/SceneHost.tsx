"use client";

import {
  Component,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type RootState,
  type ThreeEvent,
} from "@react-three/fiber";
import { Clone, OrbitControls, Text3D, useGLTF } from "@react-three/drei";
import {
  DoubleSide,
  MeshPhysicalMaterial,
  NoColorSpace,
  OrthographicCamera,
  Spherical,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Camera,
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
  CAMERA_PARALLAX_VERTICAL,
  docUsesPointer,
  docUsesScroll,
  elementScrollProgress,
  InteractionRuntime,
  interactiveNodeIds,
  parseTargetKey,
  type RuntimeEvent,
} from "../engine";
import type { ResolveAssetUrl } from "../assets";
import { FONT_URL, GeometryElement } from "./Geometry";
import { GlbPart } from "./GlbPart";
import {
  BaseLights,
  EnvironmentFx,
  SceneBackground,
  SceneEnvironment,
} from "./EnvironmentExtras";
import {
  applyOverrides,
  createOverrideStore,
  disposeOverrideStore,
  setMaterialOverride,
  type MaterialOverrideStore,
  type MaterialPatch,
} from "./materialOverrides";
import { createLoadTracker, type LoadTracker } from "./loadTracker";
import { SceneNodes } from "./nodeOverrides";
import { PointerPresses, type ScenePointerEvent } from "./pointerEvents";
import { orthographicZoom } from "./cameraProjection";
import { isOpaquePointerHit, pointerOccluderIds, pointerRemainsWithinNode } from "./pointerOcclusion";

export type { ResolveAssetUrl } from "../assets";
export type { ScenePointerEvent } from "./pointerEvents";

/** host-side material tweaks on the mounted scene (see MaterialPatch) */
export type SceneMaterials = {
  set(target: string, patch: MaterialPatch): boolean;
};

export type ScreenshotOpts = {
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** jpeg/webp quality in [0, 1] */
  quality?: number;
  /** drop the scene background (png/webp). post fx may not keep alpha */
  transparent?: boolean;
};

/** renders a fresh frame and encodes the canvas at its current pixel size */
export type SceneCapture = (opts?: ScreenshotOpts) => Promise<Blob | null>;

function OrthographicFraming({ doc }: { doc: ChibiDocument }) {
  const camera = useThree((state) => state.camera);
  const height = useThree((state) => state.size.height);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    // R3F owns a mutable Three camera; resize must update its projection.
    // eslint-disable-next-line react-hooks/immutability
    camera.zoom = orthographicZoom(doc.camera, height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, height, doc.camera, invalidate]);
  return null;
}

export type SceneHostProps = {
  doc: ChibiDocument;
  /** Live rendering environment; defaults to the document's environment. */
  environment?: ChibiDocument["environment"];
  /** asset record -> URL. editor: IndexedDB; runtime: zip / host callback */
  resolveAsset?: ResolveAssetUrl;
  /** pointer triggers active (default true) */
  interactive?: boolean;
  /** user orbit around the scene camera (default false) */
  orbit?: boolean;
  /** Parallel projection, framed to match the document camera at its target. */
  orthographic?: boolean;
  /** wheel-zoom on `orbit`'s OrbitControls (default true). false frees the
   * wheel (rotate/pan stay) — Preview scrubs scroll with it instead of zoom */
  enableZoom?: boolean;
  /** fire `start` triggers on mount (default true) */
  autoStart?: boolean;
  /** explicit scroll progress [0,1] for `scroll` triggers + bindings; bypasses
   * auto-tracking. use when host owns scroll or none exists (e.g. Preview's
   * scrubber). omit -> auto-track this canvas vs viewport on scroll/resize */
  scrollProgress?: number;
  /** pointer bindings + camera parallax follow the cursor (default true) */
  pointerTracking?: boolean;
  /** stop rendering entirely (offscreen); motion resumes where it left off */
  suspended?: boolean;
  /** device pixel ratio, or a [min, max] clamp (default [1, 2]) */
  dpr?: number | [number, number];
  /** engine events + "ready" surface here */
  onEvent?: (event: RuntimeEvent) => void;
  /** every asset (glbs, textures, font, env map) settled, loaded or failed */
  onLoad?: () => void;
  /** Asset failures are reported even when a local boundary keeps the scene mounted. */
  onError?: (error: Error) => void;
  /** frame grabber — <ChibiScene> binds api.screenshot to it */
  onCapture?: (capture: SceneCapture | null) => void;
  /** the live engine instance — <ChibiScene> binds its api ref to it */
  onRuntime?: (runtime: InteractionRuntime | null) => void;
  /** live material overrides — <ChibiScene> binds api.setMaterial to it */
  onMaterials?: (materials: SceneMaterials | null) => void;
  onNodes?: (nodes: SceneNodes | null) => void;
  /** Host-interactive node ids, independent of document-authored actions. */
  pointerTargets?: readonly string[];
  onPointerEvent?: (event: ScenePointerEvent) => void;
  /** Composite the scene over the host page instead of its document background. */
  transparent?: boolean;
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
  environment = doc.environment,
  resolveAsset,
  interactive = true,
  orbit = false,
  orthographic = false,
  enableZoom = true,
  autoStart = true,
  scrollProgress,
  pointerTracking = true,
  suspended = false,
  dpr = DEFAULT_DPR,
  onEvent,
  onLoad,
  onError,
  onCapture,
  onRuntime,
  onMaterials,
  onNodes,
  pointerTargets,
  onPointerEvent,
  transparent = false,
}: SceneHostProps) {
  const loads = useMemo(
    () => createLoadTracker(),
    // one tracker per document: a new doc is a new load
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc],
  );
  return (
    <Canvas
      key={orthographic ? "orthographic" : "perspective"}
      orthographic={orthographic}
      shadows={environment.shadows}
      dpr={dpr}
      frameloop={suspended ? "never" : "demand"}
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
      {orthographic && <OrthographicFraming doc={doc} />}
      {!transparent && <SceneBackground
        color={environment.background}
        gradient={environment.backgroundGradient}
      />}
      {environment.fog && (
        <fog
          attach="fog"
          args={[
            environment.fog.color,
            environment.fog.near,
            environment.fog.far,
          ]}
        />
      )}
      <BaseLights hasEnvironment={Boolean(environment.preset)} />
      <EnvironmentFx environment={environment} />
      {environment.preset && (
        <PresetBoundary key={environment.preset}>
          <Suspense fallback={<Pending loads={loads} />}>
            <SceneEnvironment preset={environment.preset} />
          </Suspense>
        </PresetBoundary>
      )}
      {orbit && (
        <OrbitControls
          target={doc.camera.target}
          enableZoom={enableZoom}
          makeDefault
        />
      )}
      <Suspense fallback={null}>
        <InteractiveScene
          doc={doc}
          resolveAsset={resolveAsset}
          interactive={interactive}
          autoStart={autoStart}
          scrollProgress={scrollProgress}
          pointerTracking={pointerTracking}
          onEvent={onEvent}
          onLoad={onLoad}
          onError={onError}
          onCapture={onCapture}
          onRuntime={onRuntime}
          onMaterials={onMaterials}
          onNodes={onNodes}
          pointerTargets={pointerTargets}
          onPointerEvent={onPointerEvent}
          loads={loads}
        />
      </Suspense>
    </Canvas>
  );
}

const DEFAULT_DPR: [number, number] = [1, 2];

// holds a load token while mounted — as a Suspense fallback it spans exactly
// the time the boundary is suspended
function Pending({ loads }: { loads: LoadTracker }) {
  useEffect(() => loads.begin(), [loads]);
  return null;
}

function captureFrame(
  get: () => RootState,
  opts: ScreenshotOpts = {},
): Promise<Blob | null> {
  const { gl, scene, advance, clock, invalidate } = get();
  const background = scene.background;
  if (opts.transparent) scene.background = null;
  // sync frames through the full pipeline (post fx incl.); twice because
  // contact shadows bake from the previous frame's scene state
  advance(clock.elapsedTime);
  advance(clock.elapsedTime);
  // toBlob snapshots the drawing buffer now, before the browser clears it
  const blob = new Promise<Blob | null>((resolve) =>
    gl.domElement.toBlob(resolve, opts.type ?? "image/png", opts.quality),
  );
  if (opts.transparent) {
    scene.background = background;
    invalidate();
  }
  return blob;
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
  overrides: MaterialOverrideStore;
  nodes: SceneNodes;
  emitPointer: (event: ScenePointerEvent) => void;
  reportError: (error: unknown) => void;
  presses: PointerPresses;
  interactive: { click: Set<string>; hover: Set<string> };
  pointerOccluders: Set<string>;
  hoveredNodes: Set<string>;
  resolveAsset?: ResolveAssetUrl;
  loads: LoadTracker;
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
  scrollProgress,
  pointerTracking = true,
  onEvent,
  onLoad,
  onError,
  onCapture,
  onRuntime,
  onMaterials,
  onNodes,
  pointerTargets,
  onPointerEvent,
  loads,
}: SceneHostProps & { loads: LoadTracker }) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const frameloop = useThree((s) => s.frameloop);
  const domElement = useThree((s) => s.gl.domElement);
  const camera = useThree((s) => s.camera);
  // latest-callback refs so a new handler identity doesn't remount the engine
  const onEventRef = useRef(onEvent);
  const onLoadRef = useRef(onLoad);
  const onPointerRef = useRef(onPointerEvent);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onEventRef.current = onEvent;
    onLoadRef.current = onLoad;
    onPointerRef.current = onPointerEvent;
    onErrorRef.current = onError;
  }, [onEvent, onLoad, onPointerEvent, onError]);

  const ctx = useMemo<SceneCtx>(() => {
    // engine hooks wired at construction — the memoized value is never
    // mutated afterwards (react-hooks/immutability)
    const runtime = new InteractionRuntime(doc);
    runtime.onWake = () => invalidate();
    runtime.onEvent = (e) => onEventRef.current?.(e);
    const targets = interactive
      ? interactiveNodeIds(doc)
      : { click: new Set<string>(), hover: new Set<string>() };
    if (interactive) for (const id of pointerTargets ?? []) {
      if (!doc.nodes[id]) continue;
      targets.click.add(id);
      targets.hover.add(id);
    }
    const registry = new Map<string, Object3D>();
    const presses = new PointerPresses();
    presses.onEvent = (event) => onPointerRef.current?.(event);
    return {
      doc,
      runtime,
      registry,
      nodes: new SceneNodes(doc, registry, invalidate),
      emitPointer: (event) => onPointerRef.current?.(event),
      reportError: (error) => onErrorRef.current?.(error instanceof Error ? error : new Error(String(error))),
      presses,
      materials: new Map(),
      overrides: createOverrideStore(),
      interactive: targets,
      pointerOccluders: interactive ? pointerOccluderIds(doc, targets) : new Set(),
      hoveredNodes: new Set(),
      resolveAsset,
      loads,
      invalidate: () => invalidate(),
    };
  }, [doc, resolveAsset, interactive, invalidate, loads, pointerTargets]);

  useEffect(() => {
    onRuntime?.(ctx.runtime);
    onNodes?.(ctx.nodes);
    onMaterials?.({ set: (target, patch) => setMaterialOverride(ctx, target, patch) });
    onCapture?.((opts) => captureFrame(get, opts));
    if (autoStart) ctx.runtime.start();
    onEventRef.current?.({ type: "ready" });
    ctx.loads.arm(() => {
      ctx.invalidate();
      onLoadRef.current?.();
    });
    ctx.invalidate();
    const materials = ctx.materials;
    const overrides = ctx.overrides;
    const tracker = ctx.loads;
    return () => {
      tracker.disarm();
      onRuntime?.(null);
      onNodes?.(null);
      onMaterials?.(null);
      onCapture?.(null);
      // dispose without clearing: StrictMode replays this effect on the same
      // ctx with no re-render, and applyValue/setMaterial look materials up here
      for (const mat of materials.values()) mat.dispose();
      disposeOverrideStore(overrides);
    };
    // autoStart/onRuntime/onMaterials/onCapture are mount-time concerns; ctx is the real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // scroll wiring: explicit prop (controlled) always wins. Otherwise, only
  // attach a window scroll listener when the doc actually uses scroll —
  // ambient page scrolling must not wake scenes that don't (frameloop="demand"
  // idle-renders-zero-frames guarantee; see packages/runtime/README.md)
  useEffect(() => {
    if (scrollProgress !== undefined) {
      ctx.runtime.scroll(scrollProgress);
      return;
    }
    if (!docUsesScroll(ctx.doc)) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = domElement.getBoundingClientRect();
      ctx.runtime.scroll(
        elementScrollProgress(rect.top, rect.height, window.innerHeight),
      );
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update(); // establish progress from the current scroll position at mount
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ctx, domElement, scrollProgress]);

  // pointer wiring: canvas-local, so auto-tracking always works (no controlled
  // prop like scroll's). listener gated on docUsesPointer — same "cursor never
  // wakes scenes that don't use it" guarantee as the scroll listener above
  useEffect(() => {
    if (!pointerTracking || !docUsesPointer(ctx.doc)) return;
    const onMove = (e: PointerEvent) => {
      const rect = domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      ctx.runtime.pointerMove(
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      );
    };
    const onLeave = () => ctx.runtime.pointerLeave();
    domElement.addEventListener("pointermove", onMove, { passive: true });
    domElement.addEventListener("pointerleave", onLeave);
    return () => {
      domElement.removeEventListener("pointermove", onMove);
      domElement.removeEventListener("pointerleave", onLeave);
    };
  }, [ctx, domElement, pointerTracking]);

  useEffect(() => {
    if (!interactive) return;
    const clearHover = (event: Event) => {
      // Clear R3F's cache too, so returning after blur can fire pointerover again.
      get().events.handlers?.onPointerLeave(event);
      for (const id of [...ctx.hoveredNodes]) {
        ctx.hoveredNodes.delete(id);
        ctx.runtime.pointer("hoverExit", id);
        ctx.emitPointer({ type: "hoverExit", nodeId: id, pointerId: -1, pointerType: "mouse" });
      }
      domElement.style.cursor = "";
    };
    const onBlur = (event: Event) => { clearHover(event); ctx.presses.cancelAll(); };
    const onRelease = (event: PointerEvent) => ctx.presses.release(event.pointerId);
    const onCancel = (event: PointerEvent) => {
      clearHover(event);
      ctx.presses.release(event.pointerId, "pointerCancel");
    };
    const onVisibility = (event: Event) => {
      if (document.hidden) onBlur(event);
    };
    domElement.addEventListener("pointerleave", clearHover);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("pointerup", onRelease, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      domElement.removeEventListener("pointerleave", clearHover);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("pointerup", onRelease, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ctx, domElement, get, interactive]);

  // gpu reset / tab eviction: three restores its own state, but a demand
  // frameloop draws nothing until woken — the canvas would stay blank
  useEffect(() => {
    const onLost = (e: Event) => {
      e.preventDefault(); // required for the browser to attempt a restore
      onEventRef.current?.({ type: "contextLost" });
    };
    const onRestored = () => {
      onEventRef.current?.({ type: "contextRestored" });
      ctx.invalidate();
    };
    domElement.addEventListener("webglcontextlost", onLost);
    domElement.addEventListener("webglcontextrestored", onRestored);
    return () => {
      domElement.removeEventListener("webglcontextlost", onLost);
      domElement.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [ctx, domElement]);

  // "never" drops invalidations — redraw once rendering resumes
  useEffect(() => {
    if (frameloop !== "never") ctx.invalidate();
  }, [ctx, frameloop]);

  const wasActiveRef = useRef(false);
  const parallaxRef = useRef({ yaw: 0, pitch: 0 });
  useFrame((_, delta) => {
    // The first demand frame includes idle time, not elapsed animation time.
    const waking = ctx.runtime.isActive() && !wasActiveRef.current;
    for (const [key, value] of ctx.runtime.advance(waking ? 0 : Math.min(delta, 0.1))) {
      applyValue(ctx, key, value);
    }
    const amount = ctx.doc.camera.parallax;
    if (amount > 0) {
      const { x, y } = ctx.runtime.getPointer();
      const yaw = (x - 0.5) * 2 * amount;
      const pitch = (y - 0.5) * 2 * amount * CAMERA_PARALLAX_VERTICAL;
      const prev = parallaxRef.current;
      if (yaw !== prev.yaw || pitch !== prev.pitch) {
        applyCameraParallax(
          camera,
          ctx.doc.camera.target,
          yaw - prev.yaw,
          pitch - prev.pitch,
        );
        parallaxRef.current = { yaw, pitch };
      }
    }
    const active = ctx.runtime.isActive();
    // one extra settle frame once motion stops: siblings mounted earlier in
    // the tree (e.g. ContactShadows) bake from scene state *before* this
    // frame's applyValue mutations, so the frame a transition completes on
    // renders their effect one tick stale. Without a follow-up frame under
    // frameloop="demand" that staleness never gets a chance to clear.
    const hostChanged = ctx.nodes.consumeHostChange();
    if (active || wasActiveRef.current || hostChanged) ctx.invalidate();
    wasActiveRef.current = active;
  });

  return (
    <Ctx.Provider value={ctx}>
      {doc.root.map((id) => (
        <RNode key={id} id={id} />
      ))}
    </Ctx.Provider>
  );
}

const P_TARGET = new Vector3();
const P_OFFSET = new Vector3();
const P_SPHERICAL = new Spherical();

// camera parallax: rotate the camera around the scene target by the *change*
// in pointer-driven yaw/pitch since last frame. Delta-applied so it composes
// with OrbitControls (Preview) instead of fighting it — orbiting just re-bases
// where the drift happens from. Radius preserved; makeSafe clamps the poles.
function applyCameraParallax(
  camera: Camera,
  target: readonly [number, number, number],
  dYaw: number,
  dPitch: number,
) {
  P_TARGET.set(target[0], target[1], target[2]);
  P_OFFSET.copy(camera.position).sub(P_TARGET);
  P_SPHERICAL.setFromVector3(P_OFFSET);
  P_SPHERICAL.theta += dYaw; // cursor right -> camera orbits right
  P_SPHERICAL.phi += dPitch; // cursor up (y->0, pitch<0) -> phi shrinks -> camera rises
  P_SPHERICAL.makeSafe();
  camera.position.copy(P_TARGET).add(P_OFFSET.setFromSpherical(P_SPHERICAL));
  camera.lookAt(P_TARGET);
}

function applyValue(ctx: SceneCtx, key: string, value: PropertyValue) {
  const { targetId, property } = parseTargetKey(key);
  if (ctx.doc.nodes[targetId]) {
    ctx.nodes.sample(targetId, property, value);
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
    applyOverrides(ctx.overrides, def.id, mat, def.transparent);
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
    const done = ctx.loads.begin();
    resolveAsset(asset)
      .then((url) => loader.loadAsync(url))
      .then((texture) => {
        // host override owns the albedo slot — late doc map must not clobber it
        if (slot === "map" && ctx.overrides.maps.has(def.id)) {
          texture.dispose();
          return;
        }
        texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        mat[slot] = texture;
        mat.needsUpdate = true;
        ctx.invalidate();
      })
      .catch((err) => {
        console.warn(`chibi: texture "${asset.name}" failed to load`, err);
        ctx.reportError(err);
      })
      .finally(done);
  }
}

function useRegister(ctx: SceneCtx, id: string) {
  return useCallback(
    (obj: Object3D | null) => {
      if (obj) { ctx.registry.set(id, obj); ctx.nodes.apply(id); }
      else ctx.registry.delete(id);
    },
    [ctx, id],
  );
}

// Hits bubble to interactive ancestors. Opaque geometry outside those
// branches blocks farther hits and releases occluded hover targets.
function usePointerHandlers(ctx: SceneCtx, id: string) {
  const isClick = ctx.interactive.click.has(id);
  const isHover = ctx.interactive.hover.has(id);
  if (!isClick && !isHover) {
    if (!ctx.pointerOccluders.has(id)) return {};
    const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
      if (isOpaquePointerHit(e)) e.stopPropagation();
    };
    return { onPointerOver: block, onPointerMove: block, onPointerDown: block, onPointerUp: block, onClick: block };
  }
  const setCursor = (e: ThreeEvent<PointerEvent>, cursor: string) => {
    const canvas = e.nativeEvent.target;
    if (canvas instanceof HTMLElement) canvas.style.cursor = cursor;
  };
  const emit = (type: ScenePointerEvent["type"], e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const native = e.nativeEvent;
    ctx.emitPointer({ type, nodeId: id, pointerId: "pointerId" in native ? native.pointerId : -1,
      pointerType: "pointerType" in native ? native.pointerType : "mouse" });
  };
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      ctx.presses.press(e.pointerId, id, e.pointerType);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      ctx.runtime.pointer("click", id);
      emit("click", e);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (isClick) setCursor(e, "pointer");
      if (!ctx.hoveredNodes.has(id)) {
        ctx.hoveredNodes.add(id);
        ctx.runtime.pointer("hoverEnter", id);
        emit("hoverEnter", e);
      }
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      const interactiveObjects = new Set<Object3D>();
      for (const target of [...ctx.interactive.click, ...ctx.interactive.hover]) {
        const object = ctx.registry.get(target);
        if (object) interactiveObjects.add(object);
      }
      if (pointerRemainsWithinNode(ctx.registry.get(id), e.intersections, interactiveObjects)) return;
      if (!ctx.hoveredNodes.delete(id)) return;
      if (isClick) setCursor(e, "");
      ctx.runtime.pointer("hoverExit", id);
      emit("hoverExit", e);
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
    const params = node.geometry.params;
    const bevel = numParam(params, "bevel", 0);
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
          size={numParam(params, "size", 0.5)}
          height={numParam(params, "depth", 0.2)}
          bevelEnabled={bevel > 0}
          bevelSize={bevel}
          bevelThickness={bevel}
          bevelSegments={4}
          castShadow={node.castShadow}
          receiveShadow={node.receiveShadow}
          material={material}
        >
          {strParam(params, "text", "chibi")}
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
      <GeometryElement geometry={node.geometry} />
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

class ModelBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("chibi: model failed to load", error);
    this.props.onError(error);
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
  const material =
    node.materialId !== undefined
      ? runtimeMaterial(ctx, node.materialId)
      : undefined;
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
        <ModelBoundary onError={ctx.reportError}>
          <Suspense fallback={<Pending loads={ctx.loads} />}>
            <RGlb
              asset={asset}
              loads={ctx.loads}
              path={node.path}
              material={material}
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
  path,
  material,
  resolveAsset,
  loads,
  castShadow,
  receiveShadow,
}: {
  asset: ChibiAsset;
  loads: LoadTracker;
  path: string | undefined;
  material: MeshPhysicalMaterial | undefined;
  resolveAsset: ResolveAssetUrl;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    resolveAsset(asset)
      .then((u) => active && setUrl(u))
      .catch((err) => {
        console.warn(`chibi: asset data missing for "${asset.name}"`, err);
        if (active) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      active = false;
    };
  }, [asset, resolveAsset]);
  if (error) throw error;
  if (!url) return <Pending loads={loads} />;
  if (path !== undefined) {
    return (
      <GlbPart
        url={url}
        path={path}
        material={material}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      />
    );
  }
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
