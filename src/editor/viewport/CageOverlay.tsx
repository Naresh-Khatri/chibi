"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineSegments as ThreeLineSegments,
  Mesh as ThreeMesh,
  PerspectiveCamera,
  Points as ThreePoints,
  Vector3,
  type Group,
} from "three";
import { buildTopology, triangulate } from "@/runtime/mesh";
import { useDoc } from "../store/document";
import { useUI, type HoveredElement, type MeshSelection } from "../store/ui";
import { useMeshPreview } from "../store/meshEditPreview";
import { isClick, isGizmoActive, useSceneObject } from "./objectRegistry";

const BASE_RGB = new Color("#22d3ee").toArray(); // cyan — idle cage
const SELECTED_RGB = new Color("#f59e0b").toArray(); // amber — picked
const HOVER_RGB = new Color("#ffffff").toArray(); // white — pointer-over

// three.js's raycaster only picks Points/Line hits within these thresholds
// (world units), but the overlay renders points/lines at a constant pixel
// size (7px / 1px, sizeAttenuation off) regardless of camera distance — a
// fixed world-unit threshold is mushy zoomed in and near-impossible zoomed
// out. So instead these are a target pick RADIUS IN PIXELS, converted to
// world units every frame (see useFrame below) from the cage's distance to
// the camera. POINTS_THRESHOLD_FALLBACK/LINE_THRESHOLD_FALLBACK are the
// world-unit values used when the active camera isn't a PerspectiveCamera
// (no well-defined px-per-world-unit to convert with).
const POINTS_PICK_PX = 8;
const LINE_PICK_PX = 5;
const POINTS_THRESHOLD_FALLBACK = 0.08;
const LINE_THRESHOLD_FALLBACK = 0.06;

// reused every frame in the threshold recompute below instead of allocating
// a Vector3 per frame.
const cageWorldPos = new Vector3();

function toggleOrReplace<T>(current: Set<T>, id: T, additive: boolean): Set<T> {
  if (!additive) return new Set([id]);
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function hoveredVertex(h: HoveredElement | null): number | null {
  return h?.mode === "vertex" ? h.index : null;
}
function hoveredEdge(h: HoveredElement | null): string | null {
  return h?.mode === "edge" ? h.key : null;
}
function hoveredFace(h: HoveredElement | null): number | null {
  return h?.mode === "face" ? h.index : null;
}

function pointColors(count: number, selected: Set<number>, hovered: number | null) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const rgb = i === hovered ? HOVER_RGB : selected.has(i) ? SELECTED_RGB : BASE_RGB;
    arr[i * 3] = rgb[0];
    arr[i * 3 + 1] = rgb[1];
    arr[i * 3 + 2] = rgb[2];
  }
  return arr;
}

function edgeColors(keys: string[], selected: Set<string>, hovered: string | null) {
  const arr = new Float32Array(keys.length * 6);
  keys.forEach((key, i) => {
    const rgb = key === hovered ? HOVER_RGB : selected.has(key) ? SELECTED_RGB : BASE_RGB;
    for (let j = 0; j < 2; j++) {
      const o = (i * 2 + j) * 3;
      arr[o] = rgb[0];
      arr[o + 1] = rgb[1];
      arr[o + 2] = rgb[2];
    }
  });
  return arr;
}

// non-indexed triangle soup (own 3 verts per tri, no sharing) so
// computeVertexNormals gives flat per-face shading with sharp face edges —
// an indexed subset would bleed color/normals into unselected neighbors.
function buildFacesGeometry(
  positions: number[],
  faces: number[][],
  indices: Iterable<number>,
): BufferGeometry {
  const verts: number[] = [];
  for (const fi of indices) {
    const face = faces[fi];
    if (!face || face.length < 3) continue;
    for (let i = 1; i < face.length - 1; i++) {
      for (const vi of [face[0], face[i], face[i + 1]]) {
        verts.push(positions[vi * 3], positions[vi * 3 + 1], positions[vi * 3 + 2]);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Mesh-edit sub-mode viewport overlay: cage wireframe + verts + a translucent
 * selected/hovered-face highlight, raycast-gated so only the active
 * elementMode's layer picks. Mounted instead of SelectionBox/Gizmo by
 * Viewport.tsx while a node is being mesh-edited.
 */
export function CageOverlay() {
  const nodeId = useUI((s) => s.meshEditNodeId);
  const elementMode = useUI((s) => s.elementMode);
  const selection = useUI((s) => s.meshSelection);
  const setMeshSelection = useUI((s) => s.setMeshSelection);
  const setHoveredElement = useUI((s) => s.setHoveredElement);
  const hovered = useUI((s) => s.hoveredElement);
  const exitMeshEdit = useUI((s) => s.exitMeshEdit);
  const preview = useMeshPreview((s) => s.preview);
  const geometry = useDoc((s) => {
    const node = nodeId ? s.doc?.nodes[nodeId] : undefined;
    return node?.type === "mesh" && node.geometry.kind === "editableMesh"
      ? node.geometry
      : null;
  });
  const sceneObject = useSceneObject(nodeId);
  const groupRef = useRef<Group>(null);
  // grabbed via a snapshot getter (not the hook's tracked return value) so
  // mutating raycaster.params below doesn't trip the hooks-immutability
  // lint rule — same pattern Viewport.tsx's ShadowsManager uses for `gl`.
  const getThree = useThree((s) => s.get);

  // node deleted (Hierarchy panel) or "convert to editable mesh" undone
  // while editing → geometry goes null out from under us. Rendering null
  // here used to strand the viewport with no gizmo/selection box mounted,
  // so leave mesh-edit mode instead.
  useEffect(() => {
    if (nodeId && !geometry) exitMeshEdit();
  }, [nodeId, geometry, exitMeshEdit]);

  useFrame(() => {
    const group = groupRef.current;
    if (group && sceneObject) {
      group.matrix.copy(sceneObject.matrixWorld);
      group.matrixAutoUpdate = false;
      group.matrixWorldNeedsUpdate = true;

      // pin the pick thresholds to a constant on-screen radius: convert the
      // target pixel radius to world units at the cage's current distance
      // from the camera, so picking stays consistent whether we're zoomed
      // in tight on a small cage or zoomed way out.
      const { camera, size, raycaster } = getThree();
      if (camera instanceof PerspectiveCamera) {
        cageWorldPos.setFromMatrixPosition(sceneObject.matrixWorld);
        const dist = camera.position.distanceTo(cageWorldPos);
        const worldPerPixel = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / size.height;
        raycaster.params.Points = { threshold: worldPerPixel * POINTS_PICK_PX };
        raycaster.params.Line = { threshold: worldPerPixel * LINE_PICK_PX };
      }
      // else: not a perspective camera, no well-defined px-per-world-unit —
      // leave whatever the mount effect below set (the constant fallbacks).
    }
  });

  useEffect(() => {
    if (!nodeId) return;
    const { raycaster } = getThree();
    const prevPoints = raycaster.params.Points
      ? { ...raycaster.params.Points }
      : { threshold: 1 };
    const prevLine = raycaster.params.Line
      ? { ...raycaster.params.Line }
      : { threshold: 1 };
    raycaster.params.Points = { threshold: POINTS_THRESHOLD_FALLBACK };
    raycaster.params.Line = { threshold: LINE_THRESHOLD_FALLBACK };
    return () => {
      raycaster.params.Points = prevPoints;
      raycaster.params.Line = prevLine;
    };
  }, [nodeId, getThree]);

  const positions = preview && nodeId && preview.nodeId === nodeId
    ? preview.positions
    : geometry?.positions;

  const topology = useMemo(
    () => (geometry ? buildTopology({ positions: geometry.positions, faces: geometry.faces }) : null),
    [geometry],
  );
  const edgeKeys = useMemo(
    () => (topology ? Array.from(topology.edgeVerts.keys()) : []),
    [topology],
  );

  const pointsGeo = useMemo(() => {
    if (!positions) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const count = positions.length / 3;
    g.setAttribute(
      "color",
      new Float32BufferAttribute(pointColors(count, selection.vertices, hoveredVertex(hovered)), 3),
    );
    return g;
  }, [positions, selection.vertices, hovered]);
  useEffect(() => () => pointsGeo?.dispose(), [pointsGeo]);

  const linesGeo = useMemo(() => {
    if (!positions || !topology) return null;
    const arr = new Float32Array(edgeKeys.length * 6);
    edgeKeys.forEach((key, i) => {
      const pair = topology.edgeVerts.get(key);
      if (!pair) return;
      const o = i * 6;
      arr[o] = positions[pair[0] * 3];
      arr[o + 1] = positions[pair[0] * 3 + 1];
      arr[o + 2] = positions[pair[0] * 3 + 2];
      arr[o + 3] = positions[pair[1] * 3];
      arr[o + 4] = positions[pair[1] * 3 + 1];
      arr[o + 5] = positions[pair[1] * 3 + 2];
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(arr, 3));
    g.setAttribute("color", new Float32BufferAttribute(edgeColors(edgeKeys, selection.edges, hoveredEdge(hovered)), 3));
    return g;
  }, [positions, topology, edgeKeys, selection.edges, hovered]);
  useEffect(() => () => linesGeo?.dispose(), [linesGeo]);

  const triangulated = useMemo(() => {
    if (!positions || !geometry) return null;
    return triangulate({ positions, faces: geometry.faces });
  }, [positions, geometry]);

  const pickGeo = useMemo(() => {
    if (!triangulated) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(triangulated.positions, 3));
    g.setIndex(triangulated.index);
    return g;
  }, [triangulated]);
  useEffect(() => () => pickGeo?.dispose(), [pickGeo]);

  const highlightFaceIndices = useMemo(() => {
    const set = new Set(selection.faces);
    const hf = hoveredFace(hovered);
    if (hf !== null) set.add(hf);
    return set;
  }, [selection.faces, hovered]);

  const highlightFacesGeo = useMemo(() => {
    if (!geometry || !positions || highlightFaceIndices.size === 0) return null;
    return buildFacesGeometry(positions, geometry.faces, highlightFaceIndices);
  }, [geometry, positions, highlightFaceIndices]);
  useEffect(() => () => highlightFacesGeo?.dispose(), [highlightFacesGeo]);

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (isGizmoActive()) return;
    e.stopPropagation();
  }, []);
  const onPointerOut = useCallback(() => {
    setHoveredElement(null);
  }, [setHoveredElement]);

  const onVertexMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "vertex" || e.index === undefined) return;
      e.stopPropagation();
      setHoveredElement({ mode: "vertex", index: e.index });
    },
    [elementMode, setHoveredElement],
  );
  const onVertexUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "vertex" || e.index === undefined) return;
      e.stopPropagation();
      if (!isClick(e.clientX, e.clientY)) return;
      const sel: MeshSelection = {
        ...selection,
        vertices: toggleOrReplace(selection.vertices, e.index, e.shiftKey),
      };
      setMeshSelection(sel);
    },
    [elementMode, selection, setMeshSelection],
  );

  const onEdgeMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "edge" || e.index === undefined) return;
      const key = edgeKeys[Math.floor(e.index / 2)];
      if (!key) return;
      e.stopPropagation();
      setHoveredElement({ mode: "edge", key });
    },
    [elementMode, edgeKeys, setHoveredElement],
  );
  const onEdgeUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "edge" || e.index === undefined) return;
      const key = edgeKeys[Math.floor(e.index / 2)];
      if (!key) return;
      e.stopPropagation();
      if (!isClick(e.clientX, e.clientY)) return;
      const sel: MeshSelection = { ...selection, edges: toggleOrReplace(selection.edges, key, e.shiftKey) };
      setMeshSelection(sel);
    },
    [elementMode, edgeKeys, selection, setMeshSelection],
  );

  const onFaceMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "face" || e.faceIndex == null || !triangulated) return;
      const fi = triangulated.triangleToFace[e.faceIndex];
      if (fi === undefined) return;
      e.stopPropagation();
      setHoveredElement({ mode: "face", index: fi });
    },
    [elementMode, triangulated, setHoveredElement],
  );
  const onFaceUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive() || elementMode !== "face" || e.faceIndex == null || !triangulated) return;
      const fi = triangulated.triangleToFace[e.faceIndex];
      if (fi === undefined) return;
      e.stopPropagation();
      if (!isClick(e.clientX, e.clientY)) return;
      const sel: MeshSelection = { ...selection, faces: toggleOrReplace(selection.faces, fi, e.shiftKey) };
      setMeshSelection(sel);
    },
    [elementMode, triangulated, selection, setMeshSelection],
  );

  if (!nodeId || !geometry || !pointsGeo || !linesGeo || !pickGeo) return null;

  return (
    <group ref={groupRef}>
      {/* invisible pick surface: only raycastable in face mode */}
      <mesh
        geometry={pickGeo}
        raycast={elementMode === "face" ? ThreeMesh.prototype.raycast : () => null}
        onPointerDown={onPointerDown}
        onPointerMove={onFaceMove}
        onPointerOut={onPointerOut}
        onPointerUp={onFaceUp}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>

      {highlightFacesGeo && (
        <mesh geometry={highlightFacesGeo} raycast={() => null}>
          <meshBasicMaterial
            color="#22d3ee"
            transparent
            opacity={0.35}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}

      <lineSegments
        geometry={linesGeo}
        raycast={elementMode === "edge" ? ThreeLineSegments.prototype.raycast : () => null}
        onPointerDown={onPointerDown}
        onPointerMove={onEdgeMove}
        onPointerOut={onPointerOut}
        onPointerUp={onEdgeUp}
      >
        <lineBasicMaterial vertexColors depthTest={false} transparent opacity={0.9} />
      </lineSegments>

      <points
        geometry={pointsGeo}
        raycast={elementMode === "vertex" ? ThreePoints.prototype.raycast : () => null}
        onPointerDown={onPointerDown}
        onPointerMove={onVertexMove}
        onPointerOut={onPointerOut}
        onPointerUp={onVertexUp}
      >
        <pointsMaterial vertexColors size={7} sizeAttenuation={false} depthTest={false} transparent opacity={0.95} />
      </points>
    </group>
  );
}
