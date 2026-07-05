"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { BoxHelper } from "three";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { useSceneObject } from "./objectRegistry";

const SELECTION_COLOR = "#4d8dff";

// Lights draw their own helpers when selected; a BoxHelper around a
// geometry-less light group would collapse to a point.
export function SelectionBox() {
  const selectedId = useUI((s) => s.selectedId);
  const isLight = useDoc((s) =>
    selectedId ? s.doc?.nodes[selectedId]?.type === "light" : false,
  );
  const object = useSceneObject(selectedId);
  const ref = useRef<BoxHelper>(null);

  useFrame(() => ref.current?.update());

  if (!object || isLight) return null;
  return (
    <boxHelper
      key={object.uuid}
      ref={ref}
      args={[object, SELECTION_COLOR]}
      raycast={() => null}
    />
  );
}
