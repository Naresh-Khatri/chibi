import { Vector3, type Mesh, type MeshStandardMaterial } from "three";
import type { ChibiDocument, ChibiNode, ModelNode, Vec3 } from "@/runtime/schema";
import { getObjectAtPath } from "@/runtime/react/GlbPart";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { getGltfScene, getOrbitControls } from "../viewport/objectRegistry";

// Above this the per-node detail is dropped for an outline; the model uses
// get_node / get_material to drill in.
const OUTLINE_THRESHOLD = 50;

const round = (n: number) => Number(n.toFixed(3));
const vec = (v: Vec3) => `[${v.map(round).join(", ")}]`;

// Split parts usually keep meaningless names from the source file ("Cube_3").
// Surface what the loaded GLB knows — embedded material name + color and the
// mesh's approximate size — so the model can infer what a part actually is.
export function partHint(node: ModelNode): string | undefined {
  if (node.path === undefined) return undefined;
  const scene = getGltfScene(node.assetId);
  const obj = scene ? getObjectAtPath(scene, node.path) : null;
  if (!obj || !(obj as Mesh).isMesh) return undefined;
  const mesh = obj as Mesh;
  const bits: string[] = [];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const looks = materials
    .slice(0, 2)
    .map((m) => {
      const std = m as MeshStandardMaterial;
      const color = std.color ? `#${std.color.getHexString()}` : "";
      return [m.name && `"${m.name}"`, color].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  if (looks.length > 0) bits.push(`embedded material ${looks.join(", ")}`);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  if (bb) {
    const size = bb.getSize(new Vector3());
    const s = node.transform.scale;
    bits.push(`size ${vec([size.x * s[0], size.y * s[1], size.z * s[2]])}`);
  }
  return bits.length > 0 ? bits.join(" · ") : undefined;
}

/** one node, full detail, without children (nesting shows the tree) */
function nodeDetail(node: ChibiNode): string {
  const t = node.transform;
  const parts = [
    `pos ${vec(t.position)} rot ${vec(t.rotation)} scale ${vec(t.scale)}`,
  ];
  if (!node.visible) parts.push("hidden");
  if (node.type === "mesh") {
    parts.push(
      `geometry ${node.geometry.kind} ${JSON.stringify(node.geometry.params)}`,
      `material ${node.materialId}`,
    );
    if (!node.castShadow) parts.push("no castShadow");
    if (!node.receiveShadow) parts.push("no receiveShadow");
  }
  if (node.type === "light") parts.push(`light ${JSON.stringify(node.light)}`);
  if (node.type === "model") {
    parts.push(`asset ${node.assetId}`);
    if (node.path !== undefined) parts.push(`part ${node.path}`);
    if (node.materialId !== undefined) parts.push(`material ${node.materialId}`);
    const hint = partHint(node);
    if (hint) parts.push(hint);
  }
  return parts.join(" · ");
}

function nodeTree(doc: ChibiDocument, outline: boolean): string {
  const lines: string[] = [];
  const walk = (ids: string[], depth: number) => {
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node) continue;
      const indent = "  ".repeat(depth);
      const head = `${indent}- ${node.id} "${node.name}" (${node.type})`;
      lines.push(outline ? head : `${head} ${nodeDetail(node)}`);
      walk(node.children, depth + 1);
    }
  };
  walk(doc.root, 0);
  return lines.join("\n");
}

/** compact scene snapshot for the system prompt (no asset bytes) */
export function buildSceneContext(): string {
  const doc = useDoc.getState().doc;
  if (!doc) return "No document loaded.";
  const ui = useUI.getState();

  const nodeCount = Object.keys(doc.nodes).length;
  const outline = nodeCount > OUTLINE_THRESHOLD;

  const materials = Object.values(doc.materials).map((m) => {
    const { maps, ...rest } = m;
    const used = Object.entries(maps)
      .filter(([, v]) => v)
      .map(([slot, assetId]) => `${slot}:${assetId}`);
    return `- ${JSON.stringify(rest)}${used.length ? ` maps ${used.join(" ")}` : ""}`;
  });

  const assets = Object.values(doc.assets).map(
    (a) => `- ${a.id} "${a.name}" (${a.kind})`,
  );

  const animations = Object.values(doc.animations).map(
    (a) =>
      `- ${a.id} "${a.name}" ${a.duration}s${a.loop ? " loop" : ""} (${a.tracks.length} tracks)`,
  );

  const states = Object.values(doc.states).map(
    (s) =>
      `- ${s.id} "${s.name}" on ${s.nodeId}, overrides: ${
        Object.entries(s.overrides)
          .map(([target, props]) => `${target}(${Object.keys(props).join(",")})`)
          .join(" ") || "none"
      }`,
  );

  const interactions = doc.interactions.map(
    (ix) => `- ${ix.id} ${JSON.stringify(ix.trigger)} -> ${JSON.stringify(ix.action)}`,
  );

  const orbit = getOrbitControls();
  const camera = orbit
    ? `position ${vec(orbit.object.position.toArray() as Vec3)} target ${vec(orbit.target.toArray() as Vec3)} fov ${round(orbit.object.fov)}`
    : `position ${vec(doc.camera.position)} target ${vec(doc.camera.target)} fov ${doc.camera.fov}`;

  const sections = [
    `# Current scene: "${doc.name}" (${nodeCount} nodes)`,
    outline
      ? "Large scene — node outline only; use get_node/get_material for details."
      : "",
    `Selection: ${ui.selectedIds.length ? ui.selectedIds.join(", ") : "none"}`,
    `Active state: ${ui.activeStateId}`,
    `Viewport camera: ${camera}`,
    `Environment: ${JSON.stringify(doc.environment)}`,
    `\n## Nodes\n${nodeTree(doc, outline) || "(empty)"}`,
    `\n## Materials\n${materials.join("\n")}`,
    assets.length ? `\n## Assets (metadata only)\n${assets.join("\n")}` : "",
    animations.length ? `\n## Animations\n${animations.join("\n")}` : "",
    states.length ? `\n## Object states\n${states.join("\n")}` : "",
    interactions.length ? `\n## Interactions\n${interactions.join("\n")}` : "",
  ];
  return sections.filter(Boolean).join("\n");
}
