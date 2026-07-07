"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import type { Material, Mesh } from "three";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { SceneNodes } from "./NodeRenderer";
import { AnimationPlayback } from "./AnimationPlayback";
import { Gizmo } from "./Gizmo";
import { SelectionBox } from "./SelectionBox";
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

export function Viewport() {
  const background = useDoc((s) => s.doc?.environment.background ?? "#0b0b0f");
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
          if (isGizmoActive()) return;
          if (isClick(e.clientX, e.clientY)) {
            useUI.getState().select(null);
          }
        }}
      >
        <color attach="background" args={[background]} />
        {fog && <fog attach="fog" args={[fog.color, fog.near, fog.far]} />}
        <ShadowsManager enabled={shadows} />
        <hemisphereLight intensity={0.5} color="#c8d4ff" groundColor="#3a3230" />
        <ambientLight intensity={0.15} />
        {preset && (
          <EnvironmentBoundary key={preset}>
            <Suspense fallback={null}>
              <Environment preset={preset} />
            </Suspense>
          </EnvironmentBoundary>
        )}
        <Suspense fallback={null}>
          <SceneNodes />
        </Suspense>
        <AnimationPlayback />
        <SelectionBox />
        <Gizmo />
        {grid && (
          <Grid
            infiniteGrid
            cellSize={0.5}
            sectionSize={2.5}
            fadeDistance={45}
            fadeStrength={1.5}
            cellColor="#2a2a32"
            sectionColor="#3d3d48"
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
