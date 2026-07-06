// Shared scene-builder for the generator scripts in this directory.
// Usage: const b = sceneBuilder(); ...; b.write("foo", { camera, environment }).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateDocument } from "@chibi3d/runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** deterministic RNG so regenerating a scene produces the same file */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TAU = Math.PI * 2;

export function sceneBuilder() {
  let seq = 0;
  const id = (prefix) => `${prefix}_${(++seq).toString(36)}`;

  const doc = {
    chibi: 1,
    name: "",
    root: [],
    nodes: {},
    materials: {},
    assets: {},
    animations: {},
    states: {},
    interactions: [],
    environment: { background: "#101014", preset: null, fog: null, shadows: true },
    camera: { position: [0, 5, 10], target: [0, 0, 0], fov: 45 },
    editor: { grid: true },
  };

  const attach = (nodeId, parent) => {
    if (parent) doc.nodes[parent].children.push(nodeId);
    else doc.root.push(nodeId);
  };

  const b = {
    doc,

    material(name, props = {}) {
      const matId = id("mt");
      doc.materials[matId] = {
        id: matId,
        name,
        type: "standard",
        color: "#b8b8c4",
        metalness: 0.1,
        roughness: 0.5,
        emissive: "#000000",
        emissiveIntensity: 0,
        opacity: 1,
        transparent: false,
        flatShading: false,
        maps: { map: null, normalMap: null, roughnessMap: null },
        ...props,
      };
      return matId;
    },

    mesh(name, { geometry, materialId, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], visible = true, castShadow = true, receiveShadow = true, parent = null }) {
      const nodeId = id("nd");
      doc.nodes[nodeId] = {
        id: nodeId,
        name,
        type: "mesh",
        geometry,
        materialId,
        transform: { position, rotation, scale },
        visible,
        castShadow,
        receiveShadow,
        children: [],
      };
      attach(nodeId, parent);
      return nodeId;
    },

    group(name, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], visible = true, parent = null } = {}) {
      const nodeId = id("nd");
      doc.nodes[nodeId] = {
        id: nodeId,
        name,
        type: "group",
        transform: { position, rotation, scale },
        visible,
        children: [],
      };
      attach(nodeId, parent);
      return nodeId;
    },

    light(name, { light, position = [0, 0, 0], rotation = [0, 0, 0], parent = null }) {
      const nodeId = id("nd");
      doc.nodes[nodeId] = {
        id: nodeId,
        name,
        type: "light",
        light,
        transform: { position, rotation, scale: [1, 1, 1] },
        visible: true,
        children: [],
      };
      attach(nodeId, parent);
      return nodeId;
    },

    /** per-node state; overrides keyed by the node id or its material id */
    state(nodeId, name, overrides) {
      const stateId = id("st");
      doc.states[stateId] = { id: stateId, nodeId, name, overrides };
      return stateId;
    },

    animation(name, { duration, loop = true, tracks }) {
      const animId = id("an");
      doc.animations[animId] = { id: animId, name, duration, loop, tracks };
      return animId;
    },

    interaction(trigger, action) {
      doc.interactions.push({ id: id("ix"), trigger, action });
    },

    playOnStart(animationId) {
      b.interaction({ type: "start" }, { type: "playAnimation", animationId });
    },

    hoverState(nodeId, stateId, { inDuration = 0.15, outDuration = 0.25, ease = "easeOut" } = {}) {
      b.interaction(
        { type: "hoverEnter", nodeId },
        { type: "transition", nodeId, to: stateId, duration: inDuration, ease },
      );
      b.interaction(
        { type: "hoverExit", nodeId },
        { type: "transition", nodeId, to: "base", duration: outDuration, ease },
      );
    },

    clickToggle(nodeId, a, bState, { duration = 0.2, ease = "easeInOut" } = {}) {
      b.interaction(
        { type: "click", nodeId },
        { type: "toggleStates", nodeId, a, b: bState, duration, ease },
      );
    },

    write(fileBase, { name, camera, environment, grid = true }) {
      doc.name = name;
      doc.camera = camera;
      doc.environment = { ...doc.environment, ...environment };
      doc.editor = { grid };
      validateDocument(doc);
      const outPath = resolve(__dirname, `../public/scenes/${fileBase}.chibi.json`);
      writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
      console.log(
        `wrote ${outPath}\n  nodes: ${Object.keys(doc.nodes).length}, materials: ${Object.keys(doc.materials).length}, animations: ${Object.keys(doc.animations).length}, states: ${Object.keys(doc.states).length}, interactions: ${doc.interactions.length}`,
      );
    },
  };

  return b;
}
