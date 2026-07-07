import { describe, expect, it, vi } from "vitest";
import { validateDocument } from "@/runtime/schema";
import {
  extractJson,
  generateDocument,
  GENERATION_BUDGETS,
  GenerationError,
  MAX_ATTEMPTS,
  remapGeneratedIds,
  type CompleteFn,
} from "./generate";

const ID = (prefix: string) => new RegExp(`^${prefix}_[\\w-]{8}$`);

const material = (id: string) => ({
  id,
  name: id,
  type: "standard",
  color: "#b8b8c4",
  metalness: 0.1,
  roughness: 0.45,
  emissive: "#000000",
  emissiveIntensity: 0,
  opacity: 1,
  transparent: false,
  flatShading: false,
  maps: { map: null, normalMap: null, roughnessMap: null },
});

const transform = (position = [0, 0, 0]) => ({
  position,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

/** a valid mini-document the way a model would write it: invented ids everywhere */
const modelDoc = () => ({
  chibi: 1,
  name: "Test scene",
  root: ["floor", "hero", "key"],
  nodes: {
    floor: {
      id: "floor",
      name: "Floor",
      type: "mesh",
      visible: true,
      transform: { position: [0, 0, 0], rotation: [-1.5708, 0, 0], scale: [1, 1, 1] },
      children: [],
      geometry: { kind: "plane", params: { width: 10, height: 10, cornerRadius: 0 } },
      materialId: "floorMat",
      castShadow: false,
      receiveShadow: true,
    },
    hero: {
      id: "hero",
      name: "Hero group",
      type: "group",
      visible: true,
      transform: transform(),
      children: ["orb"],
    },
    orb: {
      id: "orb",
      name: "Orb",
      type: "mesh",
      visible: true,
      transform: transform([0, 1.5, 0]),
      children: [],
      geometry: { kind: "sphere", params: { radius: 0.5, widthSegments: 32, heightSegments: 16 } },
      materialId: "glowMat",
      castShadow: true,
      receiveShadow: false,
    },
    key: {
      id: "key",
      name: "Key light",
      type: "light",
      visible: true,
      transform: transform([3, 5, 2]),
      children: [],
      light: { kind: "directional", color: "#ffffff", intensity: 2.5, castShadow: true },
    },
  },
  materials: {
    mt_default: material("mt_default"),
    floorMat: material("floorMat"),
    glowMat: material("glowMat"),
  },
  assets: {},
  animations: {
    idle: {
      id: "idle",
      name: "Idle",
      duration: 2,
      loop: true,
      tracks: [
        { targetId: "orb", property: "transform.position", keyframes: [{ t: 0, v: [0, 1.5, 0] }] },
      ],
    },
  },
  states: {
    lit: {
      id: "lit",
      nodeId: "orb",
      name: "Lit",
      overrides: {
        orb: { "transform.position": [0, 2, 0] },
        glowMat: { color: "#ffffff" },
      },
    },
  },
  interactions: [
    {
      id: "i1",
      trigger: { type: "click", nodeId: "orb" },
      action: { type: "transition", nodeId: "orb", to: "lit", duration: 0.3, ease: "easeOut" },
    },
    {
      id: "i2",
      trigger: { type: "hoverEnter", nodeId: "orb" },
      action: { type: "toggleStates", nodeId: "orb", a: "lit", b: "base", duration: 0.3, ease: "easeInOut" },
    },
  ],
  environment: { background: "#0b0b0f", preset: "studio", fog: null, shadows: true },
  camera: { position: [4, 3, 6], target: [0, 1, 0], fov: 45 },
  editor: { grid: true },
});

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses a prefix continuation (reply missing the leading brace)", () => {
    expect(extractJson('"a": 1}')).toEqual({ a: 1 });
  });

  it("parses a fenced block with surrounding prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```\nEnjoy!')).toEqual({ a: 1 });
  });

  it("throws on non-JSON text", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(/not valid JSON/);
  });
});

describe("remapGeneratedIds", () => {
  const remapped = validateDocument(remapGeneratedIds(modelDoc()));

  it("gives every entity a real prefixed id and keeps mt_default", () => {
    for (const [id, node] of Object.entries(remapped.nodes)) {
      expect(id).toMatch(ID("nd"));
      expect(node.id).toBe(id);
    }
    const materialIds = Object.keys(remapped.materials);
    expect(materialIds).toContain("mt_default");
    for (const id of materialIds) {
      if (id !== "mt_default") expect(id).toMatch(ID("mt"));
    }
    for (const id of Object.keys(remapped.animations)) expect(id).toMatch(ID("an"));
    for (const id of Object.keys(remapped.states)) expect(id).toMatch(ID("st"));
    for (const ix of remapped.interactions) expect(ix.id).toMatch(ID("ix"));
  });

  it("fixes cross-references through the remap table", () => {
    const byName = (name: string) =>
      Object.values(remapped.nodes).find((n) => n.name === name)!;
    const floor = byName("Floor");
    const hero = byName("Hero group");
    const orb = byName("Orb");

    expect(remapped.root).toEqual([floor.id, hero.id, byName("Key light").id]);
    expect(hero.children).toEqual([orb.id]);
    expect(floor.type === "mesh" && floor.materialId in remapped.materials).toBe(true);

    const state = Object.values(remapped.states)[0];
    expect(state.nodeId).toBe(orb.id);
    const overrideTargets = Object.keys(state.overrides);
    expect(overrideTargets).toContain(orb.id);
    expect(overrideTargets.some((t) => t in remapped.materials)).toBe(true);

    const anim = Object.values(remapped.animations)[0];
    expect(anim.tracks[0].targetId).toBe(orb.id);

    const [transition, toggle] = remapped.interactions;
    expect(transition.trigger).toMatchObject({ type: "click", nodeId: orb.id });
    expect(transition.action).toMatchObject({ nodeId: orb.id, to: state.id });
    expect(toggle.action).toMatchObject({ a: state.id, b: "base" });
  });

  it("drops root/children entries pointing at nonexistent nodes", () => {
    const doc = modelDoc();
    doc.root.push("ghost");
    doc.nodes.hero.children.push("phantom");
    const out = validateDocument(remapGeneratedIds(doc));
    expect(out.root).toHaveLength(3);
    const hero = Object.values(out.nodes).find((n) => n.name === "Hero group")!;
    expect(hero.children).toHaveLength(1);
  });
});

describe("generateDocument", () => {
  it("returns a validated document on the first good reply", async () => {
    const complete = vi.fn(async () => JSON.stringify(modelDoc()));
    const doc = await generateDocument("an orb scene", complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(doc.chibi).toBe(1);
    expect(Object.keys(doc.nodes).every((id) => ID("nd").test(id))).toBe(true);
    // round-trips like an import
    expect(() => validateDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("fills top-level defaults the model omitted", async () => {
    const partial = modelDoc() as Record<string, unknown>;
    delete partial.assets;
    delete partial.animations;
    delete partial.states;
    partial.interactions = [];
    delete partial.editor;
    delete partial.name;
    const doc = await generateDocument("a floating glass torus", async () =>
      JSON.stringify(partial),
    );
    expect(doc.name).toBe("a floating glass torus");
    expect(doc.editor).toEqual({ grid: true });
    expect(doc.assets).toEqual({});
  });

  it("feeds zod error paths back and recovers on retry", async () => {
    const broken = modelDoc() as { camera?: unknown };
    delete broken.camera;
    const complete = vi
      .fn<CompleteFn>()
      .mockResolvedValueOnce(JSON.stringify(broken))
      .mockResolvedValueOnce(JSON.stringify(modelDoc()));

    const doc = await generateDocument("an orb scene", complete);
    expect(doc.name).toBe("Test scene");
    expect(complete).toHaveBeenCalledTimes(2);
    const retryMessages = complete.mock.calls[1][0];
    const feedback = retryMessages[retryMessages.length - 1];
    expect(feedback.role).toBe("user");
    expect(String(feedback.content)).toContain("failed validation");
    expect(String(feedback.content)).toContain("camera");
  });

  it("fails readably with the raw output after exhausting retries", async () => {
    const complete = vi.fn(async () => "I would love to, but no JSON today.");
    const promise = generateDocument("an orb scene", complete);
    await expect(promise).rejects.toBeInstanceOf(GenerationError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining(`after ${MAX_ATTEMPTS} attempts`),
      rawText: "I would love to, but no JSON today.",
    });
    expect(complete).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("hard-fails a scene more than 2x over the node budget", async () => {
    const bloated = modelDoc();
    const nodes = bloated.nodes as Record<string, unknown>;
    const extras = GENERATION_BUDGETS.nodes * 2 + 10;
    for (let i = 0; i < extras; i++) {
      nodes[`extra${i}`] = { ...bloated.nodes.orb, id: `extra${i}`, name: `Extra ${i}` };
    }
    const complete = vi.fn(async () => JSON.stringify(bloated));
    await expect(generateDocument("orbs", complete)).rejects.toThrow(/over budget/);
    expect(complete).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("warns but succeeds between 1x and 2x budget", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const chunky = modelDoc();
      const nodes = chunky.nodes as Record<string, unknown>;
      const base = Object.keys(nodes).length;
      const extras = GENERATION_BUDGETS.nodes + 5 - base;
      for (let i = 0; i < extras; i++) {
        nodes[`extra${i}`] = { ...chunky.nodes.orb, id: `extra${i}`, name: `Extra ${i}` };
      }
      const doc = await generateDocument("orbs", async () => JSON.stringify(chunky));
      expect(Object.keys(doc.nodes).length).toBe(GENERATION_BUDGETS.nodes + 5);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("nodes budget"));
    } finally {
      warn.mockRestore();
    }
  });

  it("injects mt_default when the model forgot it", async () => {
    const doc = modelDoc();
    const materials = doc.materials as Record<string, unknown>;
    delete materials.mt_default;
    const out = await generateDocument("orb", async () => JSON.stringify(doc));
    expect(out.materials.mt_default).toBeDefined();
  });
});
