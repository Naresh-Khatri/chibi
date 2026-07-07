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
function NodeSelectionBox({ id }: { id: string }) {
  const isLight = useDoc((s) => s.doc?.nodes[id]?.type === "light");
  const object = useSceneObject(id);
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

// one box per selected node (the AI's select_nodes can select many)
export function SelectionBox() {
  const selectedIds = useUI((s) => s.selectedIds);
  return (
    <>
      {selectedIds.map((id) => (
        <NodeSelectionBox key={id} id={id} />
      ))}
    </>
  );
}
