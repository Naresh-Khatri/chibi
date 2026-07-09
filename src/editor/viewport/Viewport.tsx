"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import type { Material, Mesh } from "three";
import { Color } from "three";
import {
  BaseLights,
  EnvironmentFx,
  SceneBackground,
  SceneEnvironment,
} from "@/runtime/react/EnvironmentExtras";
import { needsPostFx } from "@/runtime/react/PostFx";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { SceneNodes } from "./NodeRenderer";
import { AnimationPlayback } from "./AnimationPlayback";
import { Gizmo } from "./Gizmo";
import { SelectionBox } from "./SelectionBox";
import { CageOverlay } from "./CageOverlay";
import { MeshEditGizmo } from "./MeshEditGizmo";
import { handleDroppedFiles } from "./dropImport";
import {
  isClick,
  isGizmoActive,
  setOrbitControls,
  setPointerDownAt,
  type OrbitLike,
} from "./objectRegistry";

// Keep the axes gizmo clear of the floating inspector panel
// (right-3 inset = 12px + w-64 = 256px) when it is open.
const GIZMO_MARGIN = 64;
const INSPECTOR_WIDTH = 12 + 256;

// Preset HDRIs are fetched from a CDN at runtime; if that fails (offline),
// drop the environment instead of crashing the canvas.
class EnvironmentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
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

function ShadowsManager({ enabled }: { enabled: boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    gl.shadowMap.enabled = enabled;
    scene.traverse((obj) => {
      const material = (obj as Mesh).material as Material | Material[] | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        m.needsUpdate = true;
      }
    });
  }, [enabled, get]);
  return null;
}

// grid lines legible on any background: darkened tints of a light background,
// lightened tints of a dark one
function gridColors(background: string): { cell: string; section: string } {
  const bg = new Color(background);
  const luminance = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722;
  const shift = luminance > 0.3 ? -1 : 1;
  const cell = bg.clone().offsetHSL(0, 0, shift * 0.07);
  const section = bg.clone().offsetHSL(0, 0, shift * 0.13);
  return {
    cell: `#${cell.getHexString()}`,
    section: `#${section.getHexString()}`,
  };
}

export function Viewport() {
  const background = useDoc((s) => s.doc?.environment.background ?? "#0b0b0f");
  const environment = useDoc((s) => s.doc?.environment);
  const preset = useDoc((s) => s.doc?.environment.preset ?? null);
  const fog = useDoc((s) => s.doc?.environment.fog ?? null);
  const shadows = useDoc((s) => s.doc?.environment.shadows ?? true);
  const grid = useDoc((s) => s.doc?.editor.grid ?? true);
  const [initialCamera] = useState(() => {
    const cam = useDoc.getState().doc?.camera;
    return (
      cam ?? { position: [4, 3, 6] as const, target: [0, 0.5, 0] as const, fov: 45 }
    );
  });
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const previewing = useUI((s) => s.previewing);
  const meshEditNodeId = useUI((s) => s.meshEditNodeId);
  const dragDepth = useRef(0);
  const [dropping, setDropping] = useState(false);

  return (
    <div
      className={`relative h-full min-h-0 min-w-0 ${
        dropping ? "ring-2 ring-inset ring-primary" : ""
      }`}
      onPointerDown={(e) => {
        setPointerDownAt({ x: e.clientX, y: e.clientY });
      }}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        handleDroppedFiles(e.dataTransfer.files);
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: initialCamera.position,
          fov: initialCamera.fov,
          near: 0.1,
          far: 500,
        }}
        onPointerMissed={(e) => {
          // right/middle button = orbit-pan/dolly, never a deselect — a short
          // pan under click-slop would otherwise read as click-on-empty
          if (e.button !== 0) return;
          if (isGizmoActive()) return;
          if (!isClick(e.clientX, e.clientY)) return;
          if (useUI.getState().meshEditNodeId) {
            useUI.getState().setMeshSelection({ vertices: new Set(), edges: new Set(), faces: new Set() });
          } else {
            useUI.getState().select(null);
          }
        }}
      >
        <SceneBackground
          color={background}
          gradient={environment?.backgroundGradient ?? null}
        />
        {fog && <fog attach="fog" args={[fog.color, fog.near, fog.far]} />}
        <ShadowsManager enabled={shadows} />
        <BaseLights hasEnvironment={Boolean(preset)} />
        {environment && !previewing && <EnvironmentFx environment={environment} />}
        {preset && (
          <EnvironmentBoundary key={preset}>
            <Suspense fallback={null}>
              <SceneEnvironment preset={preset} />
            </Suspense>
          </EnvironmentBoundary>
        )}
        <Suspense fallback={null}>
          <SceneNodes />
        </Suspense>
        <AnimationPlayback />
        {meshEditNodeId ? (
          <>
            <CageOverlay />
            <MeshEditGizmo />
          </>
        ) : (
          <>
            <SelectionBox />
            <Gizmo />
          </>
        )}
        {grid && (
          <Grid
            infiniteGrid
            cellSize={0.5}
            sectionSize={2.5}
            fadeDistance={45}
            fadeStrength={1.5}
            cellColor={gridColors(background).cell}
            sectionColor={gridColors(background).section}
            position={[0, -0.002, 0]}
            raycast={() => null}
          />
        )}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          target={initialCamera.target as [number, number, number]}
          ref={(controls) => {
            setOrbitControls(controls as unknown as OrbitLike | null);
            return () => setOrbitControls(null);
          }}
        />
        <GizmoHelper
          alignment="bottom-right"
          margin={[
            inspectorOpen ? GIZMO_MARGIN + INSPECTOR_WIDTH : GIZMO_MARGIN,
            GIZMO_MARGIN,
          ]}
          // at priority 1 the gizmo's Hud renders the main scene raw, which
          // would overwrite the effect composer's output — bump it above the
          // composer whenever postprocessing is active
          renderPriority={environment && !previewing && needsPostFx(environment) ? 2 : 1}
        >
          <GizmoViewport
            axisColors={["#e56", "#8c4", "#48f"]}
            labelColor="#ddd"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
