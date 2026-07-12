"use client";

import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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
import { SceneHost } from "./SceneHost";

/** imperative bridge for the host app (`api` prop). methods are safe to call
 * before the scene mounts — they no-op until the engine is live. */
export type ChibiSceneApi = {
  transitionTo(stateId: string, opts?: TransitionOpts): void;
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
  className?: string;
  style?: CSSProperties;
  /** shown while the scene file loads */
  fallback?: ReactNode;
  onEvent?: (event: RuntimeEvent) => void;
  api?: Ref<ChibiSceneApi>;
};

type Loaded = { doc: ChibiDocument; resolveAsset: ResolveAssetUrl | undefined };

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
  className,
  style,
  fallback = null,
  onEvent,
  api,
}: ChibiSceneProps) {
  // keyed by src so a stale load never renders; no sync setState in effects
  const [remote, setRemote] = useState<{
    src: string;
    scene?: LoadedScene;
    error?: string;
  } | null>(null);
  const runtimeRef = useRef<InteractionRuntime | null>(null);

  useImperativeHandle(
    api,
    () => ({
      transitionTo: (stateId, opts) =>
        runtimeRef.current?.transitionTo(stateId, opts),
      play: (id) => runtimeRef.current?.play(id),
      pause: (id) => runtimeRef.current?.pause(id),
      stop: (id) => runtimeRef.current?.stop(id),
      getState: () => runtimeRef.current?.getState() ?? {},
      setPaused: (paused) => runtimeRef.current?.setPaused(paused),
      getScrollProgress: () => runtimeRef.current?.getScrollProgress() ?? 0,
      getPointer: () => runtimeRef.current?.getPointer() ?? { x: 0.5, y: 0.5 },
    }),
    [],
  );

  // document prop: validate whatever the host handed us (raw JSON is fine)
  const local = useMemo<Loaded | { error: string } | null>(() => {
    if (!docProp) return null;
    try {
      return { doc: validateDocument(docProp), resolveAsset: undefined };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [docProp]);

  useEffect(() => {
    if (!src || docProp) return;
    let active = true;
    let scene: LoadedScene | null = null;
    loadDocument(src)
      .then((loaded) => {
        scene = loaded;
        if (active) setRemote({ src, scene: loaded });
      })
      .catch((err) => {
        console.error("chibi: failed to load scene", err);
        if (active)
          setRemote({
            src,
            error: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      active = false;
      scene?.dispose();
    };
  }, [src, docProp]);

  const current = remote && remote.src === src ? remote : null;
  const errorMsg = local && "error" in local ? local.error : current?.error;
  if (errorMsg) {
    return <SceneError message={errorMsg} className={className} style={style} />;
  }

  const loaded: Loaded | null =
    local && !("error" in local) ? local : (current?.scene ?? null);
  if (!loaded) {
    return (
      <div className={className} style={style}>
        {fallback}
      </div>
    );
  }

  const resolve =
    resolveAsset ??
    loaded.resolveAsset ??
    (Object.keys(loaded.doc.assets).length > 0
      ? missingAssetResolver("pass resolveAsset or load from a .chibi.zip")
      : undefined);

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <SceneHost
        doc={loaded.doc}
        resolveAsset={resolve}
        interactive={interactive}
        orbit={orbit}
        autoStart={autoStart}
        scrollProgress={scrollProgress}
        onEvent={onEvent}
        onRuntime={(runtime) => {
          runtimeRef.current = runtime;
        }}
      />
    </div>
  );
}

function SceneError({
  message,
  className,
  style,
}: {
  message: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        placeItems: "center",
        fontFamily: "monospace",
        fontSize: 12,
        opacity: 0.7,
        padding: 16,
        ...style,
      }}
      role="alert"
    >
      chibi scene failed to load: {message}
    </div>
  );
}
