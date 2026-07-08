import { describe, expect, it } from "vitest";
import {
  createDocument,
  defaultGeometryParams,
  validateDocument,
  type MeshNode,
  type ModelNode,
} from "./index";

function identity() {
  return {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  };
}

describe("document round-trip", () => {
  it("serialize → parse → validate yields an identical document", () => {
    const doc = createDocument("Round trip");

    const sphere: MeshNode = {
      id: "nd_sphere",
      name: "Sphere",
      type: "mesh",
      geometry: { kind: "sphere", params: defaultGeometryParams("sphere") },
      materialId: "mt_red",
      transform: identity(),
      visible: true,
      castShadow: true,
      receiveShadow: false,
      children: [],
    };
    doc.nodes[sphere.id] = sphere;
    doc.root.push(sphere.id);

    doc.materials["mt_red"] = {
      id: "mt_red",
      name: "Red",
      type: "standard",
      color: "#ff0000",
      metalness: 1,
      roughness: 0.2,
      emissive: "#000000",
      emissiveIntensity: 0,
      opacity: 0.8,
      transparent: true,
      flatShading: false,
      clearcoat: 0.3,
      clearcoatRoughness: 0.6,
      sheen: 0.2,
      sheenColor: "#ffeedd",
      maps: { map: "as_tex", normalMap: null, roughnessMap: null },
    };

    doc.assets["as_glb"] = {
      id: "as_glb",
      kind: "glb",
      name: "robot.glb",
      hash: "abc123",
      size: 4200,
    };
    doc.assets["as_tex"] = {
      id: "as_tex",
      kind: "texture",
      name: "wood.png",
      hash: "def456",
      size: 1000,
    };

    const model: ModelNode = {
      id: "nd_robot",
      name: "Robot",
      type: "model",
      assetId: "as_glb",
      transform: identity(),
      visible: true,
      castShadow: true,
      receiveShadow: true,
      children: [],
    };
    doc.nodes[model.id] = model;
    doc.root.push(model.id);

    doc.animations["an_float"] = {
      id: "an_float",
      name: "Float",
      duration: 2,
      loop: true,
      tracks: [
        {
          targetId: sphere.id,
          property: "transform.position",
          keyframes: [
            { t: 0, v: [0, 0, 0] },
            { t: 1, v: [0, 1, 0], ease: "easeInOut" },
            { t: 2, v: [0, 0, 0] },
          ],
        },
      ],
    };

    doc.states["st_hot"] = {
      id: "st_hot",
      nodeId: sphere.id,
      name: "Hover",
      overrides: {
        [sphere.id]: { "transform.scale": [1.2, 1.2, 1.2] },
        mt_red: { color: "#ffd24d" },
      },
    };

    doc.interactions.push(
      {
        id: "ix_hover",
        trigger: { type: "hoverEnter", nodeId: sphere.id },
        action: {
          type: "transition",
          nodeId: sphere.id,
          to: "st_hot",
          duration: 0.4,
          ease: "easeOut",
        },
      },
      {
        id: "ix_click",
        trigger: { type: "click", nodeId: sphere.id },
        action: { type: "playAnimation", animationId: "an_float" },
      },
      {
        id: "ix_scroll",
        trigger: { type: "scroll", progress: 0.5 },
        action: { type: "playAnimation", animationId: "an_float" },
      },
    );

    doc.scrollBindings.push(
      {
        id: "sb_float",
        target: { type: "animation", animationId: "an_float" },
        start: 0,
        end: 1,
        ease: "linear",
      },
      {
        id: "sb_hot",
        target: { type: "state", nodeId: sphere.id, stateId: "st_hot" },
        start: 0.2,
        end: 0.8,
        ease: "easeInOut",
      },
    );

    doc.environment.fog = { color: "#0b0b0f", near: 8, far: 40 };

    const parsed = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(parsed).toEqual(doc);
  });

  it("fills look defaults for documents predating clearcoat/exposure fields", () => {
    const doc = JSON.parse(JSON.stringify(createDocument("legacy")));
    delete doc.environment.exposure;
    delete doc.environment.softShadows;
    delete doc.environment.contactShadows;
    delete doc.environment.backgroundGradient;
    delete doc.environment.toneMapping;
    delete doc.environment.ao;
    delete doc.environment.bloom;
    delete doc.environment.vignette;
    const mat = doc.materials["mt_default"];
    delete mat.clearcoat;
    delete mat.clearcoatRoughness;
    delete mat.sheen;
    delete mat.sheenColor;

    const parsed = validateDocument(doc);
    expect(parsed.environment.exposure).toBe(1);
    expect(parsed.environment.softShadows).toBe(false);
    expect(parsed.environment.contactShadows).toBe(false);
    // legacy docs keep the pre-postprocessing look: aces + everything off
    expect(parsed.environment.backgroundGradient).toBe(null);
    expect(parsed.environment.toneMapping).toBe("aces");
    expect(parsed.environment.ao).toBe(false);
    expect(parsed.environment.bloom).toBe(false);
    expect(parsed.environment.vignette).toBe(false);
    expect(parsed.materials["mt_default"].clearcoat).toBe(0);
    expect(parsed.materials["mt_default"].sheenColor).toBe("#ffffff");
  });

  it("defaults scrollBindings to [] for documents predating the field", () => {
    const doc = JSON.parse(JSON.stringify(createDocument("legacy")));
    delete doc.scrollBindings;
    const parsed = validateDocument(doc);
    expect(parsed.scrollBindings).toEqual([]);
  });

  it("rejects unknown format versions with a clear error", () => {
    const doc = JSON.parse(JSON.stringify(createDocument("x")));
    doc.chibi = 2;
    expect(() => validateDocument(doc)).toThrow();
  });

  it("rejects malformed nodes", () => {
    const doc = JSON.parse(JSON.stringify(createDocument("x")));
    doc.nodes["nd_bad"] = { id: "nd_bad", type: "mesh" };
    expect(() => validateDocument(doc)).toThrow();
  });
});
