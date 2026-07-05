"use client";

import { useEffect, useState } from "react";
import { TransformControls } from "@react-three/drei";
import type { Vec3 } from "@/runtime/schema";
import { setTransform } from "../store/commands";
import { useUI } from "../store/ui";
import {
  setGizmoControls,
  useSceneObject,
  type GizmoControlsLike,
} from "./objectRegistry";

function useCtrlHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === "Control" && setHeld(true);
    const up = (e: KeyboardEvent) => e.key === "Control" && setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setHeld(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return held;
}

export function Gizmo() {
  const tool = useUI((s) => s.tool);
  const selectedId = useUI((s) => s.selectedId);
  const snapEnabled = useUI((s) => s.snap);
  const ctrlHeld = useCtrlHeld();
  const object = useSceneObject(selectedId);

  if (!object || !selectedId || tool === "select") return null;

  const snapping = snapEnabled || ctrlHeld;
  return (
    <TransformControls
      object={object}
      ref={(controls) => {
        setGizmoControls(controls as unknown as GizmoControlsLike | null);
        return () => setGizmoControls(null);
      }}
      mode={tool === "move" ? "translate" : tool}
      translationSnap={snapping ? 0.5 : null}
      rotationSnap={snapping ? Math.PI / 12 : null}
      scaleSnap={snapping ? 0.1 : null}
      onMouseUp={() => {
        setTransform(selectedId, {
          position: object.position.toArray() as Vec3,
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: object.scale.toArray() as Vec3,
        });
      }}
    />
  );
}
