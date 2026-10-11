import type { Object3D } from "three";
import type { ChibiDocument, PropertyValue, Transform, Vec3 } from "../schema";

export type NodeTransformPatch = Partial<Transform>;
type NodePatch = NodeTransformPatch & { visible?: boolean };

/** Per-mount overrides win over engine samples until explicitly cleared. */
export class SceneNodes {
  private overrides = new Map<string, NodePatch>();
  private samples = new Map<string, NodePatch>();
  private hostChanged = false;

  constructor(
    private doc: ChibiDocument,
    private registry: Map<string, Object3D>,
    private invalidate: () => void,
  ) {}

  setTransform(id: string, patch: NodeTransformPatch): boolean {
    if (!this.doc.nodes[id]) return false;
    const next: NodeTransformPatch = {};
    for (const field of ["position", "rotation", "scale"] as const) {
      const value = patch[field];
      if (value === undefined) continue;
      if (value.length !== 3 || !value.every(Number.isFinite)) {
        throw new TypeError(`${field} must contain three finite numbers`);
      }
      next[field] = [...value];
    }
    this.overrides.set(id, { ...this.overrides.get(id), ...next });
    this.apply(id);
    this.hostChanged = true;
    this.invalidate();
    return true;
  }

  setVisible(id: string, visible: boolean): boolean {
    if (!this.doc.nodes[id]) return false;
    this.overrides.set(id, { ...this.overrides.get(id), visible });
    this.apply(id);
    this.hostChanged = true;
    this.invalidate();
    return true;
  }

  clear(id: string): boolean {
    if (!this.doc.nodes[id]) return false;
    this.overrides.delete(id);
    this.apply(id);
    this.hostChanged = true;
    this.invalidate();
    return true;
  }

  /** Keep demand rendering awake for the next external animation tick. */
  consumeHostChange(): boolean {
    const changed = this.hostChanged;
    this.hostChanged = false;
    return changed;
  }

  /** Remember engine values even while an override owns their rendered value. */
  sample(id: string, property: string, value: PropertyValue): void {
    let patch: NodePatch;
    if (property === "visible") patch = { visible: Boolean(value) };
    else {
      const field = property.slice("transform.".length);
      if (!Array.isArray(value) || !["position", "rotation", "scale"].includes(field)) return;
      patch = { [field]: [...value] as Vec3 };
    }
    this.samples.set(id, { ...this.samples.get(id), ...patch });
    this.apply(id);
  }

  /** Also used when a suspended node finally mounts. */
  apply(id: string): void {
    const node = this.doc.nodes[id];
    const object = this.registry.get(id);
    if (!node || !object) return;
    const pose = { ...node.transform, visible: node.visible, ...this.samples.get(id), ...this.overrides.get(id) };
    object.position.fromArray(pose.position);
    object.rotation.set(...pose.rotation);
    object.scale.fromArray(pose.scale);
    object.visible = pose.visible;
  }
}
