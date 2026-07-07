"use client";

import { useMemo } from "react";
import type { Material, Mesh, Object3D } from "three";
import { useGLTF } from "@react-three/drei";

/**
 * Resolves a child-index path (e.g. "0/2/1") relative to a GLB scene root.
 * "" resolves to the root itself. Paths stay stable because assets are
 * content-hashed and immutable.
 */
export function getObjectAtPath(root: Object3D, path: string): Object3D | null {
  let obj: Object3D | undefined = root;
  if (path === "") return obj;
  for (const seg of path.split("/")) {
    obj = obj?.children[Number(seg)];
    if (!obj) return null;
  }
  return obj;
}

/**
 * Renders a single internal mesh of a GLB, addressed by child-index path.
 * Only the mesh itself is drawn — its transform and children belong to the
 * chibi node tree produced by "Split into objects". Geometry and material
 * are shared with the loader cache, never cloned.
 */
export function GlbPart({
  url,
  path,
  material,
  castShadow,
  receiveShadow,
}: {
  url: string;
  path: string;
  /** chibi material override; undefined renders the GLB's embedded one */
  material?: Material;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const gltf = useGLTF(url);
  const mesh = useMemo(() => {
    const obj = getObjectAtPath(gltf.scene, path);
    return obj && (obj as Mesh).isMesh ? (obj as Mesh) : null;
  }, [gltf, path]);
  if (!mesh) return null;
  return (
    <mesh
      geometry={mesh.geometry}
      material={material ?? mesh.material}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
