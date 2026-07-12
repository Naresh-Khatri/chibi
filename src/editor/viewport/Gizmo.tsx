"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Matrix4, Object3D, Vector3 } from "three";
import type { Transform, Vec3 } from "@/runtime/schema";
import { setTransform, setTransforms, topMostIds } from "../store/commands";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  getSceneObject,
  setGizmoControls,
  useRegistry,
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

function useSnapProps() {
  const snapEnabled = useUI((s) => s.snap);
  const ctrlHeld = useCtrlHeld();
  const snapping = snapEnabled || ctrlHeld;
  return {
    translationSnap: snapping ? 0.5 : null,
    rotationSnap: snapping ? Math.PI / 12 : null,
    scaleSnap: snapping ? 0.1 : null,
  } as const;
}

function objectTransform(object: Object3D): Transform {
  return {
    position: object.position.toArray() as Vec3,
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray() as Vec3,
  };
}

export function Gizmo() {
  const tool = useUI((s) => s.tool);
  const selectedIds = useUI((s) => s.selectedIds);
  const doc = useDoc((s) => s.doc);
  // top-most only: a selected parent+child pair would move the child twice
  const targetIds = useMemo(
    () => (doc ? topMostIds(doc, selectedIds) : []),
    [doc, selectedIds],
  );

  if (targetIds.length === 0 || tool === "select") return null;
  return targetIds.length === 1 ? (
    <SingleGizmo id={targetIds[0]} />
  ) : (
    <MultiGizmo ids={targetIds} />
  );
}

function SingleGizmo({ id }: { id: string }) {
  const tool = useUI((s) => s.tool);
  const snapProps = useSnapProps();
  const object = useSceneObject(id);

  if (!object || tool === "select") return null;
  return (
    <TransformControls
      object={object}
      ref={(controls) => {
        setGizmoControls(controls as unknown as GizmoControlsLike | null);
        return () => setGizmoControls(null);
      }}
      mode={tool === "move" ? "translate" : tool}
      {...snapProps}
      onMouseUp={() => {
        setTransform(id, objectTransform(object));
      }}
    />
  );
}

type MultiDrag = {
  entries: {
    id: string;
    object: Object3D;
    startWorld: Matrix4;
    parentWorldInverse: Matrix4;
  }[];
  proxyStartInverse: Matrix4;
};

const deltaMatrix = new Matrix4();
const nextWorld = new Matrix4();

/**
 * Multi-selection: TransformControls on a proxy at the selection's world
 * centroid (MeshEditGizmo pattern). Drag frames write the proxy's world
 * delta straight onto each object (live, no dispatch); mouseup commits all
 * nodes in one setTransforms undo entry. Rotate/scale pivot the centroid.
 */
function MultiGizmo({ ids }: { ids: string[] }) {
  const tool = useUI((s) => s.tool);
  const snapProps = useSnapProps();
  // models mount async; track registry version
  useRegistry((s) => s.version);
  // proxy needs an identity-transform parent (three-stdlib divides by parent
  // scale in translate mode) -> <primitive> mounts it at Canvas root
  const [proxy] = useState(() => new Object3D());
  const dragRef = useRef<MultiDrag | null>(null);

  const objects = ids
    .map((id) => ({ id, object: getSceneObject(id) }))
    .filter((e): e is { id: string; object: Object3D } => e.object !== null);

  // rest proxy on selection centroid when not mid-drag — covers selection
  // changes, undo, playback without extra wiring
  useFrame(() => {
    if (dragRef.current || objects.length === 0) return;
    const centroid = new Vector3();
    const p = new Vector3();
    for (const { object } of objects) centroid.add(object.getWorldPosition(p));
    centroid.divideScalar(objects.length);
    proxy.position.copy(centroid);
    proxy.rotation.set(0, 0, 0);
    proxy.scale.set(1, 1, 1);
    proxy.updateMatrixWorld();
  });

  const onMouseDown = () => {
    proxy.updateMatrixWorld();
    dragRef.current = {
      entries: objects.map(({ id, object }) => {
        object.updateMatrixWorld();
        return {
          id,
          object,
          startWorld: object.matrixWorld.clone(),
          // parents can't move mid-drag (targets top-most) -> start snapshot stays valid
          parentWorldInverse: object.parent
            ? object.parent.matrixWorld.clone().invert()
            : new Matrix4(),
        };
      }),
      proxyStartInverse: proxy.matrixWorld.clone().invert(),
    };
  };

  const applyDelta = () => {
    const drag = dragRef.current;
    if (!drag) return;
    proxy.updateMatrixWorld();
    deltaMatrix.multiplyMatrices(proxy.matrixWorld, drag.proxyStartInverse);
    for (const { object, startWorld, parentWorldInverse } of drag.entries) {
      nextWorld.multiplyMatrices(deltaMatrix, startWorld);
      nextWorld.premultiply(parentWorldInverse);
      nextWorld.decompose(object.position, object.quaternion, object.scale);
    }
  };

  const onMouseUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    applyDelta();
    dragRef.current = null;
    setTransforms(
      drag.entries.map(({ id, object }) => ({ nodeId: id, t: objectTransform(object) })),
    );
  };

  if (objects.length === 0 || tool === "select") return null;

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        object={proxy}
        ref={(controls) => {
          setGizmoControls(controls as unknown as GizmoControlsLike | null);
          return () => setGizmoControls(null);
        }}
        mode={tool === "move" ? "translate" : tool}
        {...snapProps}
        onMouseDown={onMouseDown}
        onObjectChange={applyDelta}
        onMouseUp={onMouseUp}
      />
    </>
  );
}
