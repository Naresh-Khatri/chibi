import type { Intersection, Mesh, Object3D } from "three";
import type { ChibiDocument } from "../schema";
import type { interactiveNodeIds } from "../engine";

type PointerHit = Pick<Intersection, "object" | "face"> & { eventObject?: Object3D };

/** Keep decal/cap handoffs, but stop at the first target that blocks events. */
export function pointerRemainsWithinNode(
  node: Object3D | undefined,
  hits: ReadonlyArray<PointerHit>,
  interactiveObjects: ReadonlySet<Object3D> = new Set(),
): boolean {
  if (!node) return false;
  for (const hit of hits) {
    // Interactive groups stop propagation even when their hit is a transparent logo.
    if (hit.eventObject && interactiveObjects.has(hit.eventObject)) {
      return hit.eventObject === node;
    }
    if (!isOpaquePointerHit(hit)) continue;
    for (let object: Object3D | null = hit.object; object; object = object.parent) {
      if (object === node) return true;
    }
    // R3F's initial pointerout includes hits behind this blocker. That hover
    // record is already removed, so ignoring the exit can leave it stuck forever.
    return false;
  }
  return false;
}

/** Geometry outside interactive branches must block hits on objects behind it. */
export function pointerOccluderIds(
  doc: ChibiDocument,
  targets: ReturnType<typeof interactiveNodeIds>,
): Set<string> {
  const result = new Set<string>();
  const visit = (id: string, interactiveParent: boolean) => {
    const node = doc.nodes[id];
    if (!node?.visible) return;
    const interactive = interactiveParent || targets.click.has(id) || targets.hover.has(id);
    if (!interactive && (node.type === "mesh" || node.type === "model")) result.add(id);
    for (const child of node.children) visit(child, interactive);
  };
  for (const id of doc.root) visit(id, false);
  return result;
}

export function isOpaquePointerHit(hit: Pick<Intersection, "object" | "face">): boolean {
  for (let object: Object3D | null = hit.object; object; object = object.parent) {
    if (!object.visible) return false;
  }
  const mesh = hit.object as Mesh;
  if (!mesh.isMesh) return false;
  const material = Array.isArray(mesh.material)
    ? mesh.material[hit.face?.materialIndex ?? 0]
    : mesh.material;
  return Boolean(material?.visible && !material.transparent && material.opacity >= 1);
}
