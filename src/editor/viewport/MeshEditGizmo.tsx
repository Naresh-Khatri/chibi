"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import { Matrix4, Object3D } from "three";
import { buildTopology } from "@/runtime/mesh";
import type { Vec3 } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { useMeshPreview } from "../store/meshEditPreview";
import { setElementPositions } from "../store/meshCommands";
import { applyProxyDeltaToLocal, centroidOf, selectedVertexSet } from "./meshEditMath";
import {
  setGizmoControls,
  useSceneObject,
  type GizmoControlsLike,
} from "./objectRegistry";

// duplicated from Gizmo.tsx rather than exported/reused — plan forbids
// touching Gizmo.tsx's internals, even to add an export.
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

type DragStart = {
  vertexIndices: number[];
  localStart: number[]; // flat, parallel to vertexIndices
  basePositions: number[]; // full cage positions snapshot at drag start
  nodeMatrixWorld: Matrix4;
  nodeMatrixWorldInverse: Matrix4;
  proxyMatrixWorldStartInverse: Matrix4;
};

/**
 * Standalone TransformControls mirroring Gizmo.tsx, but bound to a proxy
 * Object3D at the centroid of the selected mesh elements instead of the
 * node itself. Drag frames write to useMeshPreview only (no dispatch); one
 * commit dispatch fires on mouseup. Mounted by Viewport.tsx in place of
 * Gizmo.tsx while a node is in mesh-edit mode.
 */
export function MeshEditGizmo() {
  const nodeId = useUI((s) => s.meshEditNodeId);
  const tool = useUI((s) => s.tool);
  const snapEnabled = useUI((s) => s.snap);
  const selection = useUI((s) => s.meshSelection);
  const setPreview = useMeshPreview((s) => s.setPreview);
  const ctrlHeld = useCtrlHeld();
  const sceneObject = useSceneObject(nodeId);
  const geometry = useDoc((s) => {
    const node = nodeId ? s.doc?.nodes[nodeId] : undefined;
    return node?.type === "mesh" && node.geometry.kind === "editableMesh"
      ? node.geometry
      : null;
  });

  // proxy's parent must be non-null (three-stdlib divides by parentScale in
  // translate mode) — mounted via <primitive> below as a direct Canvas-root
  // child, giving it an identity-transform parent without joining the
  // document's own node hierarchy.
  const [proxy] = useState(() => new Object3D());
  const dragRef = useRef<DragStart | null>(null);

  const topology = useMemo(
    () => (geometry ? buildTopology({ positions: geometry.positions, faces: geometry.faces }) : null),
    [geometry],
  );
  const vertexIndices = useMemo(
    () =>
      topology && geometry
        ? selectedVertexSet(selection, topology, geometry.faces, geometry.positions.length / 3)
        : [],
    [topology, geometry, selection],
  );

  // rest the proxy on the current selection centroid whenever it's not
  // mid-drag — selection changes, mode switches, and post-commit settling
  // all funnel through here instead of each needing their own sync.
  useEffect(() => {
    if (dragRef.current || !sceneObject || !geometry || vertexIndices.length === 0) return;
    const worldCentroid = centroidOf(geometry.positions, vertexIndices).applyMatrix4(
      sceneObject.matrixWorld,
    );
    proxy.position.copy(worldCentroid);
    proxy.rotation.set(0, 0, 0);
    proxy.scale.set(1, 1, 1);
    proxy.updateMatrixWorld();
  }, [proxy, sceneObject, geometry, vertexIndices]);

  const onMouseDown = useCallback(() => {
    if (!sceneObject || !geometry || vertexIndices.length === 0) return;
    const localStart: number[] = [];
    for (const vi of vertexIndices) {
      localStart.push(
        geometry.positions[vi * 3],
        geometry.positions[vi * 3 + 1],
        geometry.positions[vi * 3 + 2],
      );
    }
    proxy.updateMatrixWorld();
    dragRef.current = {
      vertexIndices,
      localStart,
      basePositions: geometry.positions.slice(),
      nodeMatrixWorld: sceneObject.matrixWorld.clone(),
      nodeMatrixWorldInverse: sceneObject.matrixWorld.clone().invert(),
      proxyMatrixWorldStartInverse: proxy.matrixWorld.clone().invert(),
    };
  }, [sceneObject, geometry, vertexIndices, proxy]);

  const onObjectChange = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || !nodeId) return;
    proxy.updateMatrixWorld();
    const newLocal = applyProxyDeltaToLocal(
      drag.localStart,
      drag.nodeMatrixWorld,
      drag.nodeMatrixWorldInverse,
      proxy.matrixWorld,
      drag.proxyMatrixWorldStartInverse,
    );
    const positions = drag.basePositions.slice();
    drag.vertexIndices.forEach((vi, i) => {
      positions[vi * 3] = newLocal[i * 3];
      positions[vi * 3 + 1] = newLocal[i * 3 + 1];
      positions[vi * 3 + 2] = newLocal[i * 3 + 2];
    });
    setPreview({ nodeId, positions });
  }, [nodeId, proxy, setPreview]);

  const onMouseUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPreview(null);
    if (!drag || !nodeId) return;
    proxy.updateMatrixWorld();
    const newLocal = applyProxyDeltaToLocal(
      drag.localStart,
      drag.nodeMatrixWorld,
      drag.nodeMatrixWorldInverse,
      proxy.matrixWorld,
      drag.proxyMatrixWorldStartInverse,
    );
    const newPositions: Vec3[] = [];
    for (let i = 0; i < drag.vertexIndices.length; i++) {
      newPositions.push([newLocal[i * 3], newLocal[i * 3 + 1], newLocal[i * 3 + 2]]);
    }
    setElementPositions(nodeId, drag.vertexIndices, newPositions, {
      mergeKey: `mesh-move:${nodeId}`,
    });
  }, [nodeId, proxy, setPreview]);

  if (!nodeId || !sceneObject || vertexIndices.length === 0 || tool === "select") {
    return null;
  }

  const snapping = snapEnabled || ctrlHeld;

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
        translationSnap={snapping ? 0.5 : null}
        rotationSnap={snapping ? Math.PI / 12 : null}
        scaleSnap={snapping ? 0.1 : null}
        onMouseDown={onMouseDown}
        onObjectChange={onObjectChange}
        onMouseUp={onMouseUp}
      />
    </>
  );
}
