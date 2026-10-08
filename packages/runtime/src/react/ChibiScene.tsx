"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { validateDocument, type ChibiDocument } from "../schema";
import { missingAssetResolver, type ResolveAssetUrl } from "../assets";
import { loadDocument, type LoadedScene } from "../load";
import type {
  InteractionRuntime,
  RuntimeEvent,
  TransitionOpts,
} from "../engine";
import {
  SceneHost,
  type SceneCapture,
  type SceneMaterials,
  type ScenePointerEvent,
  type ScreenshotOpts,
} from "./SceneHost";
import type { SceneNodes, NodeTransformPatch } from "./nodeOverrides";
import type { MaterialPatch } from "./materialOverrides";

/** imperative bridge for the host app (`api` prop). methods are safe to call
 * before the scene mounts — they no-op until the engine is live. */
export type ChibiSceneApi = {
  transitionTo(stateId: string, opts?: TransitionOpts): void;
  transitionNodeTo(nodeId: string, stateId: string, opts?: TransitionOpts): void;
  setNodeTransform(nodeId: string, patch: NodeTransformPatch): boolean;
  setNodeVisible(nodeId: string, visible: boolean): boolean;
  clearNodeOverrides(nodeId: string): boolean;
  play(animationId: string): void;
  pause(animationId: string): void;
  stop(animationId: string): void;
  /** logical state per stateful node id ("base" or a state id) */
  getState(): Record<string, string>;
  setPaused(paused: boolean): void;
  /** current scroll progress in [0, 1] (auto-tracked, or the `scrollProgress` prop) */
  getScrollProgress(): number;
  /** damped pointer progress over the canvas, [0,1] per axis ({0.5, 0.5} = rest/center) */
  getPointer(): { x: number; y: number };
  /** live-tweak a material by id or name (a name hits every material carrying
   * it): colors, pbr scalars, albedo `map` URL. false = no match / not mounted.
   * not persisted; state/clip-driven color + opacity win while they animate */
  setMaterial(target: string, patch: MaterialPatch): boolean;
  /** encode the current frame at the canvas's pixel size. null = not mounted */
  screenshot(opts?: ScreenshotOpts): Promise<Blob | null>;
};

export type ChibiSceneProps = {
  /** parsed scene document (validated on mount) … */
  document?: unknown;
  /** … or a URL to a .chibi.json / .chibi.zip (fetched + validated) */
  src?: string;
  /** override asset resolution; defaults: zip-bundled assets, else error */
  resolveAsset?: ResolveAssetUrl;
  /** pointer triggers active (default true) */
  interactive?: boolean;
  /** user orbit around the scene camera (default false) */
  orbit?: boolean;
  /** fire `start` triggers on mount (default true) */
  autoStart?: boolean;
  /** explicit scroll progress in [0, 1]; omit to auto-track this component's
   * position against the window scroll (see SceneHostProps.scrollProgress) */
  scrollProgress?: number;
  /** defer fetching + mounting until the box nears the viewport (default false) */
  lazy?: boolean;
  /** stop rendering while scrolled out of view (default true) */
  pauseWhenOffscreen?: boolean;
  /** drop cursor-driven motion (parallax, pointer bindings). omit to follow
   * the OS `prefers-reduced-motion` setting */
  reducedMotion?: boolean;
  /** device pixel ratio, or a [min, max] clamp (default [1, 2]) */
  dpr?: number | [number, number];
  className?: string;
  style?: CSSProperties;
  /** image URL covering the canvas until every asset has loaded */
  poster?: string;
  /** shown while the scene file loads */
  fallback?: ReactNode;
  onEvent?: (event: RuntimeEvent) => void;
  pointerTargets?: readonly string[];
  onPointerEvent?: (event: ScenePointerEvent) => void;
  transparent?: boolean;
  /** scene mounted and every asset (models, textures, env) settled */
  onLoad?: () => void;
  /** scene file or asset failed to load, parse or validate */
  onError?: (error: Error) => void;
  api?: Ref<ChibiSceneApi>;
};

type Loaded = { doc: ChibiDocument; resolveAsset: ResolveAssetUrl | undefined };

// within this distance of the viewport counts as visible (lazy + pause)
const VIEWPORT_MARGIN = "200px";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * the developer-facing component: loads/validates a scene and renders it via
 * SceneHost with the interaction engine live. sizing is the host's job — the
 * canvas fills the className/style box.
 */
export function ChibiScene({
  document: docProp,
  src,
  resolveAsset,
  interactive = true,
  orbit = false,
  autoStart = true,
  scrollProgress,
  lazy = false,
  pauseWhenOffscreen = true,
  reducedMotion,
  dpr,
  className,
  style,
  poster,
  fallback = null,
  onEvent,
  pointerTargets,
  onPointerEvent,
  transparent = false,
  onLoad,
  onError,
  api,
}: ChibiSceneProps) {
  // keyed by src so a stale load never renders; no sync setState in effects
  const [remote, setRemote] = useState<{
    src: string;
    scene?: LoadedScene;
    error?: string;
  } | null>(null);
  const runtimeRef = useRef<InteractionRuntime | null>(null);
  const materialsRef = useRef<SceneMaterials | null>(null);
  const nodesRef = useRef<SceneNodes | null>(null);
  const captureRef = useRef<SceneCapture | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!lazy);
  const [onScreen, setOnScreen] = useState(true);
  // doc whose assets have all settled — poster stays up until it matches
  const [settledDoc, setSettledDoc] = useState<ChibiDocument | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onErrorRef.current = onError;
    onLoadRef.current = onLoad;
  }, [onError, onLoad]);

  useImperativeHandle(
    api,
    () => ({
      transitionTo: (stateId, opts) =>
        runtimeRef.current?.transitionTo(stateId, opts),
      transitionNodeTo: (nodeId, stateId, opts) => runtimeRef.current?.transitionNodeTo(nodeId, stateId, opts),
      setNodeTransform: (id, patch) => nodesRef.current?.setTransform(id, patch) ?? false,
      setNodeVisible: (id, visible) => nodesRef.current?.setVisible(id, visible) ?? false,
      clearNodeOverrides: (id) => nodesRef.current?.clear(id) ?? false,
      play: (id) => runtimeRef.current?.play(id),
      pause: (id) => runtimeRef.current?.pause(id),
      stop: (id) => runtimeRef.current?.stop(id),
      getState: () => runtimeRef.current?.getState() ?? {},
      setPaused: (paused) => runtimeRef.current?.setPaused(paused),
      getScrollProgress: () => runtimeRef.current?.getScrollProgress() ?? 0,
      getPointer: () => runtimeRef.current?.getPointer() ?? { x: 0.5, y: 0.5 },
      setMaterial: (target, patch) =>
        materialsRef.current?.set(target, patch) ?? false,
      screenshot: (opts) =>
        captureRef.current?.(opts) ?? Promise.resolve(null),
    }),
    [],
  );

  const watchViewport = (lazy && !near) || pauseWhenOffscreen;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !watchViewport || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
        setOnScreen(entry.isIntersecting);
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [watchViewport]);

  // document prop: validate whatever the host handed us (raw JSON is fine)
  const local = useMemo<Loaded | { error: string } | null>(() => {
    if (!docProp) return null;
    try {
      return { doc: validateDocument(docProp), resolveAsset: undefined };
    } catch (err) {
      return { error: toError(err).message };
    }
  }, [docProp]);

  useEffect(() => {
    if (local && "error" in local) onErrorRef.current?.(new Error(local.error));
  }, [local]);

  useEffect(() => {
    if (!src || docProp || !near) return;
    let active = true;
    let scene: LoadedScene | null = null;
    loadDocument(src)
      .then((loaded) => {
        scene = loaded;
        if (active) setRemote({ src, scene: loaded });
      })
      .catch((err) => {
        console.error("chibi: failed to load scene", err);
        if (!active) return;
        const error = toError(err);
        setRemote({ src, error: error.message });
        onErrorRef.current?.(error);
      });
    return () => {
      active = false;
      scene?.dispose();
    };
  }, [src, docProp, near]);

  const current = remote && remote.src === src ? remote : null;
  const errorMsg = local && "error" in local ? local.error : current?.error;
  const loaded: Loaded | null =
    local && !("error" in local) ? local : (current?.scene ?? null);

  let body: ReactNode;
  if (errorMsg) {
    body = <SceneError message={errorMsg} />;
  } else if (!loaded || !near) {
    body = poster ? null : fallback;
  } else {
    const resolve =
      resolveAsset ??
      loaded.resolveAsset ??
      (Object.keys(loaded.doc.assets).length > 0
        ? missingAssetResolver("pass resolveAsset or load from a .chibi.zip")
        : undefined);
    const doc = loaded.doc;
    body = (
      <SceneHost
        doc={doc}
        resolveAsset={resolve}
        interactive={interactive}
        orbit={orbit}
        autoStart={autoStart}
        scrollProgress={scrollProgress}
        pointerTracking={!(reducedMotion ?? prefersReducedMotion)}
        suspended={pauseWhenOffscreen && !onScreen}
        dpr={dpr}
        onEvent={onEvent}
        pointerTargets={pointerTargets}
        onPointerEvent={onPointerEvent}
        transparent={transparent}
        onNodes={(nodes) => { nodesRef.current = nodes; }}
        onError={(error) => onErrorRef.current?.(error)}
        onLoad={() => {
          setSettledDoc(doc);
          onLoadRef.current?.();
        }}
        onCapture={(capture) => {
          captureRef.current = capture;
        }}
        onRuntime={(runtime) => {
          runtimeRef.current = runtime;
        }}
        onMaterials={(materials) => {
          materialsRef.current = materials;
        }}
      />
    );
  }

  const showPoster = Boolean(poster) && !errorMsg && settledDoc !== loaded?.doc;

  return (
    <div ref={boxRef} className={className} style={{ position: "relative", ...style }}>
      {body}
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element -- runtime is framework-agnostic
        <img
          src={poster}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
            opacity: showPoster ? 1 : 0,
            transition: "opacity 300ms ease-out",
          }}
        />
      )}
    </div>
  );
}

function SceneError({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontFamily: "monospace",
        fontSize: 12,
        opacity: 0.7,
        padding: 16,
      }}
      role="alert"
    >
      chibi scene failed to load: {message}
    </div>
  );
}
