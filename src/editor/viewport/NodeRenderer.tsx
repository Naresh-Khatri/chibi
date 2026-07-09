"use client";

import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Group, Material, Mesh, Object3D } from "three";
import {
  DirectionalLightHelper,
  PointLightHelper,
  SpotLightHelper,
  type DirectionalLight,
  type PointLight,
  type SpotLight,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Clone, Text3D, useGLTF, useHelper } from "@react-three/drei";
import {
  numParam,
  strParam,
  BASE_STATE_ID,
  DEFAULT_MATERIAL_ID,
  type ChibiAsset,
  type ChibiDocument,
  type ChibiNode,
  type EditableMeshGeometry,
  type GroupNode,
  type LightNode,
  type MeshGeometry,
  type MeshNode,
  type ModelNode,
  type PropertyValue,
  type Vec3,
} from "@/runtime/schema";
import { FONT_URL, GeometryElement } from "@/runtime/react/Geometry";
import { GlbPart } from "@/runtime/react/GlbPart";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { useMeshPreview, type MeshPreview } from "../store/meshEditPreview";
import { assetUrl } from "../store/assets";
import { findParentId } from "../store/commands";
import {
  isClick,
  isGizmoActive,
  releaseGltfScene,
  retainGltfScene,
  useRegistry,
} from "./objectRegistry";
import { getSharedMaterial } from "./materials";

const SELECTION_COLOR = "#4d8dff";

export function SceneNodes() {
  const root = useDoc((s) => s.doc?.root);
  if (!root) return null;
  return (
    <>
      {root.map((id) => (
        <NodeView key={id} id={id} />
      ))}
    </>
  );
}

export const NodeView = memo(function NodeView({ id }: { id: string }) {
  const node = useDoc((s) => s.doc?.nodes[id]);
  if (!node) return null;
  switch (node.type) {
    case "mesh":
      return <MeshView node={node} />;
    case "group":
      return <GroupView node={node} />;
    case "light":
      return <LightView node={node} />;
    case "model":
      return <ModelView node={node} />;
  }
});

type OverrideMap = Record<string, PropertyValue> | undefined;

/** active-state overrides for a target (node or material id); undefined in base */
function useOverrides(targetId: string): OverrideMap {
  const activeStateId = useUI((s) => s.activeStateId);
  return useDoc((s) =>
    activeStateId === BASE_STATE_ID
      ? undefined
      : s.doc?.states[activeStateId]?.overrides[targetId],
  );
}

function effectiveView(node: ChibiNode, ov: OverrideMap) {
  return {
    position:
      (ov?.["transform.position"] as Vec3 | undefined) ?? node.transform.position,
    rotation:
      (ov?.["transform.rotation"] as Vec3 | undefined) ?? node.transform.rotation,
    scale: (ov?.["transform.scale"] as Vec3 | undefined) ?? node.transform.scale,
    visible: (ov?.visible as boolean | undefined) ?? node.visible,
  };
}

// live-drag preview substitutes positions and caps subdivisions <=2 so
// dragging a dense cage doesn't tank frame rate (mesh-edit plan risk #1) —
// baseline `subdivisions` is restored the instant the drag preview clears.
// `preview` is already narrowed to this node (or null) by the caller's
// selector, so no nodeId check is needed here — just stay null-safe.
function effectiveGeometry(node: MeshNode, preview: MeshPreview): MeshGeometry {
  const geo = node.geometry;
  if (geo.kind !== "editableMesh" || !preview) return geo;
  const capped: EditableMeshGeometry = {
    ...geo,
    positions: preview.positions,
    subdivisions: Math.min(geo.subdivisions, 2),
  };
  return capped;
}

function useNodeRef<T extends Object3D>(id: string) {
  const held = useRef<T | null>(null);
  return useCallback(
    (obj: T | null) => {
      const { register, unregister } = useRegistry.getState();
      if (obj) {
        held.current = obj;
        register(id, obj);
      } else if (held.current) {
        unregister(id, held.current);
        held.current = null;
      }
    },
    [id],
  );
}

// clicking always hits the deepest node under the cursor (groups have no
// geometry to raycast against); walk that hit up to its root-level ancestor
// and step one level deeper per click so the first click selects the whole
// object and repeated clicks drill down toward the exact part clicked.
function resolveClickSelection(
  doc: ChibiDocument,
  hitId: string,
  currentId: string | null,
): string {
  const chain = [hitId];
  for (let cur = hitId, parent = findParentId(doc, cur); parent; cur = parent, parent = findParentId(doc, cur)) {
    chain.unshift(parent);
  }
  const idx = currentId ? chain.indexOf(currentId) : -1;
  if (idx === -1) return chain[0];
  if (idx === chain.length - 1) return currentId as string;
  return chain[idx + 1];
}

// Selecting on pointerdown alone would select whatever node is under the
// cursor at the start of an orbit/pan drag; wait for pointerup and only
// select if it stayed a click, not a camera drag.
function useSelect(id: string) {
  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Gizmo handles are outside the R3F raycast; don't select through them.
    if (isGizmoActive()) return;
    e.stopPropagation();
  }, []);
  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (isGizmoActive()) return;
      e.stopPropagation();
      if (!isClick(e.clientX, e.clientY)) return;
      const doc = useDoc.getState().doc;
      if (!doc) return;
      const { selectedId, select } = useUI.getState();
      select(resolveClickSelection(doc, id, selectedId));
    },
    [id],
  );
  return { onPointerDown, onPointerUp };
}

function MeshView({ node }: { node: MeshNode }) {
  const materialDef = useDoc(
    (s) =>
      s.doc?.materials[node.materialId] ??
      s.doc?.materials[DEFAULT_MATERIAL_ID],
  );
  const ref = useNodeRef<Mesh | Group>(node.id);
  const meshEditNodeId = useUI((s) => s.meshEditNodeId);
  const beingMeshEdited = meshEditNodeId === node.id;
  // narrow to this node's preview so drag frames (~60fps) only re-render the
  // edited MeshView — every other node's selector stays at a stable `null`.
  const preview = useMeshPreview((s) =>
    s.preview && s.preview.nodeId === node.id ? s.preview : null,
  );
  const selectHandlers = useSelect(node.id);
  const overrides = useOverrides(node.id);
  const materialOverrides = useOverrides(node.materialId);
  const effectiveDef =
    materialDef && materialOverrides
      ? {
          ...materialDef,
          color: (materialOverrides.color as string | undefined) ?? materialDef.color,
          opacity:
            (materialOverrides.opacity as number | undefined) ?? materialDef.opacity,
        }
      : materialDef;
  const material = effectiveDef ? getSharedMaterial(effectiveDef) : undefined;
  const { position, rotation, scale, visible } = effectiveView(node, overrides);

  if (node.geometry.kind === "text3d") {
    const params = node.geometry.params;
    const bevel = numParam(params, "bevel", 0);
    return (
      <group
        ref={ref}
        position={position}
        rotation={rotation}
        scale={scale}
        visible={visible}
        {...selectHandlers}
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
        {node.children.map((cid) => (
          <NodeView key={cid} id={cid} />
        ))}
      </group>
    );
  }

  return (
    <mesh
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
      castShadow={node.castShadow}
      receiveShadow={node.receiveShadow}
      material={material}
      {...(beingMeshEdited ? undefined : selectHandlers)}
    >
      <GeometryElement geometry={effectiveGeometry(node, preview)} />
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </mesh>
  );
}

class ModelBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    useUI.getState().showToast(`Failed to load model "${this.props.name}"`);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ModelView({ node }: { node: ModelNode }) {
  const asset = useDoc((s) => s.doc?.assets[node.assetId]);
  const ref = useNodeRef<Group>(node.id);
  const selectHandlers = useSelect(node.id);
  const { position, rotation, scale, visible } = effectiveView(
    node,
    useOverrides(node.id),
  );
  // split parts may override the embedded material with a chibi material
  const materialDef = useDoc((s) =>
    node.materialId !== undefined ? s.doc?.materials[node.materialId] : undefined,
  );
  const materialOverrides = useOverrides(node.materialId ?? "");
  const effectiveDef =
    materialDef && materialOverrides
      ? {
          ...materialDef,
          color: (materialOverrides.color as string | undefined) ?? materialDef.color,
          opacity:
            (materialOverrides.opacity as number | undefined) ?? materialDef.opacity,
        }
      : materialDef;
  const material = effectiveDef ? getSharedMaterial(effectiveDef) : undefined;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
      {...selectHandlers}
    >
      {asset && (
        <ModelBoundary name={asset.name}>
          <Suspense fallback={null}>
            <GlbContent
              asset={asset}
              path={node.path}
              material={material}
              castShadow={node.castShadow}
              receiveShadow={node.receiveShadow}
            />
          </Suspense>
        </ModelBoundary>
      )}
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </group>
  );
}

function GlbContent({
  asset,
  path,
  material,
  castShadow,
  receiveShadow,
}: {
  asset: ChibiAsset;
  path: string | undefined;
  material: Material | undefined;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    assetUrl(asset)
      .then((u) => active && setUrl(u))
      .catch(() =>
        useUI.getState().showToast(`Asset data missing for "${asset.name}"`),
      );
    return () => {
      active = false;
    };
  }, [asset]);
  if (!url) return null;
  if (path !== undefined) {
    return (
      <GlbPartView
        assetId={asset.id}
        url={url}
        path={path}
        material={material}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      />
    );
  }
  return (
    <GlbScene
      assetId={asset.id}
      url={url}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

// expose the original (uncloned) scene so "Split into objects" can walk it
// and the AI context can read part hints (embedded materials, sizes)
function useRetainGltfScene(assetId: string, scene: Object3D) {
  useEffect(() => {
    retainGltfScene(assetId, scene);
    return () => releaseGltfScene(assetId);
  }, [assetId, scene]);
}

function GlbPartView({
  assetId,
  url,
  path,
  material,
  castShadow,
  receiveShadow,
}: {
  assetId: string;
  url: string;
  path: string;
  material: Material | undefined;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const gltf = useGLTF(url);
  useRetainGltfScene(assetId, gltf.scene);
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

function GlbScene({
  assetId,
  url,
  castShadow,
  receiveShadow,
}: {
  assetId: string;
  url: string;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const gltf = useGLTF(url);
  const group = useRef<Group>(null);
  useEffect(() => {
    group.current?.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });
    // let the hierarchy panel re-read this model's internal tree
    useRegistry.setState((s) => ({ version: s.version + 1 }));
  }, [gltf, castShadow, receiveShadow]);
  useRetainGltfScene(assetId, gltf.scene);
  return (
    <group ref={group}>
      <Clone object={gltf.scene} />
    </group>
  );
}

function GroupView({ node }: { node: GroupNode }) {
  const ref = useNodeRef<Group>(node.id);
  const { position, rotation, scale, visible } = effectiveView(
    node,
    useOverrides(node.id),
  );
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
    >
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </group>
  );
}

function LightView({ node }: { node: LightNode }) {
  const ref = useNodeRef<Group>(node.id);
  const selected = useUI((s) => s.selectedIds.includes(node.id));
  const { position, rotation, scale, visible } = effectiveView(
    node,
    useOverrides(node.id),
  );
  const light = node.light;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
    >
      {light.kind === "directional" && (
        <DirectionalLightElement light={light} selected={selected} />
      )}
      {light.kind === "point" && (
        <PointLightElement light={light} selected={selected} />
      )}
      {light.kind === "spot" && (
        <SpotLightElement light={light} selected={selected} />
      )}
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </group>
  );
}

type LightProps = { light: LightNode["light"]; selected: boolean };

function DirectionalLightElement({ light, selected }: LightProps) {
  const ref = useRef<DirectionalLight>(null!);
  useHelper(selected ? ref : null, DirectionalLightHelper, 0.6, SELECTION_COLOR);
  return (
    <directionalLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      castShadow={light.castShadow}
      shadow-mapSize={[1024, 1024]}
      shadow-normalBias={0.05}
    />
  );
}

function PointLightElement({ light, selected }: LightProps) {
  const ref = useRef<PointLight>(null!);
  useHelper(selected ? ref : null, PointLightHelper, 0.4, SELECTION_COLOR);
  return (
    <pointLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      distance={light.distance ?? 0}
      castShadow={light.castShadow}
      shadow-mapSize={[1024, 1024]}
      shadow-normalBias={0.05}
    />
  );
}

function SpotLightElement({ light, selected }: LightProps) {
  const ref = useRef<SpotLight>(null!);
  useHelper(selected ? ref : null, SpotLightHelper, SELECTION_COLOR);
  return (
    <spotLight
      ref={ref}
      color={light.color}
      intensity={light.intensity}
      distance={light.distance ?? 0}
      angle={light.angle ?? Math.PI / 6}
      penumbra={light.penumbra ?? 0.3}
      castShadow={light.castShadow}
      shadow-mapSize={[1024, 1024]}
      shadow-normalBias={0.05}
    />
  );
}
