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
import type { Group, Mesh, Object3D } from "three";
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
  DEFAULT_MATERIAL_ID,
  type ChibiAsset,
  type GeometryParams,
  type GroupNode,
  type LightNode,
  type MeshNode,
  type ModelNode,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { assetUrl } from "../store/assets";
import { useRegistry } from "./objectRegistry";
import { getSharedMaterial } from "./materials";

const SELECTION_COLOR = "#4d8dff";
const FONT_URL = "/fonts/helvetiker_regular.typeface.json";

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

function useSelect(id: string) {
  return useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      useUI.getState().select(id);
    },
    [id],
  );
}

function MeshView({ node }: { node: MeshNode }) {
  const materialDef = useDoc(
    (s) =>
      s.doc?.materials[node.materialId] ??
      s.doc?.materials[DEFAULT_MATERIAL_ID],
  );
  const ref = useNodeRef<Mesh | Group>(node.id);
  const onPointerDown = useSelect(node.id);
  const material = materialDef ? getSharedMaterial(materialDef) : undefined;
  const { position, rotation, scale } = node.transform;
  const params = node.geometry.params;

  if (node.geometry.kind === "text3d") {
    return (
      <group
        ref={ref}
        position={position}
        rotation={rotation}
        scale={scale}
        visible={node.visible}
        onPointerDown={onPointerDown}
      >
        <Text3D
          font={FONT_URL}
          size={numParam(params, "size", 0.5)}
          height={numParam(params, "depth", 0.2)}
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
      visible={node.visible}
      castShadow={node.castShadow}
      receiveShadow={node.receiveShadow}
      material={material}
      onPointerDown={onPointerDown}
    >
      <GeometryElement kind={node.geometry.kind} params={params} />
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </mesh>
  );
}

function GeometryElement({
  kind,
  params,
}: {
  kind: MeshNode["geometry"]["kind"];
  params: GeometryParams;
}) {
  const n = (key: string, fallback: number) => numParam(params, key, fallback);
  switch (kind) {
    case "box":
      return <boxGeometry args={[n("width", 1), n("height", 1), n("depth", 1)]} />;
    case "sphere":
      return (
        <sphereGeometry
          args={[n("radius", 0.5), n("widthSegments", 32), n("heightSegments", 16)]}
        />
      );
    case "cylinder":
      return (
        <cylinderGeometry
          args={[
            n("radiusTop", 0.5),
            n("radiusBottom", 0.5),
            n("height", 1),
            n("radialSegments", 32),
          ]}
        />
      );
    case "cone":
      return (
        <coneGeometry
          args={[n("radius", 0.5), n("height", 1), n("radialSegments", 32)]}
        />
      );
    case "torus":
      return (
        <torusGeometry
          args={[
            n("radius", 0.5),
            n("tube", 0.2),
            n("radialSegments", 16),
            n("tubularSegments", 48),
          ]}
        />
      );
    case "plane":
      return <planeGeometry args={[n("width", 2), n("height", 2)]} />;
    default:
      return null;
  }
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
  const onPointerDown = useSelect(node.id);
  const { position, rotation, scale } = node.transform;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
      onPointerDown={onPointerDown}
    >
      {asset && (
        <ModelBoundary name={asset.name}>
          <Suspense fallback={null}>
            <GlbContent
              asset={asset}
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
  castShadow,
  receiveShadow,
}: {
  asset: ChibiAsset;
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
  return (
    <GlbScene url={url} castShadow={castShadow} receiveShadow={receiveShadow} />
  );
}

function GlbScene({
  url,
  castShadow,
  receiveShadow,
}: {
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
  return (
    <group ref={group}>
      <Clone object={gltf.scene} />
    </group>
  );
}

function GroupView({ node }: { node: GroupNode }) {
  const ref = useNodeRef<Group>(node.id);
  const { position, rotation, scale } = node.transform;
  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={scale}
      visible={node.visible}
    >
      {node.children.map((cid) => (
        <NodeView key={cid} id={cid} />
      ))}
    </group>
  );
}

function LightView({ node }: { node: LightNode }) {
  const ref = useNodeRef<Group>(node.id);
  const selected = useUI((s) => s.selectedId === node.id);
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
