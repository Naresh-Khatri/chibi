import { describe, expect, it } from "vitest";
import { Color, MeshPhysicalMaterial } from "three";
import { createDocument, InteractionRuntime, validateDocument } from "@/runtime";
import { interactiveNodeIds } from "@/runtime/engine";
import { pointerOccluderIds } from "@/runtime/react/pointerOcclusion";
import { createOverrideStore, setMaterialOverride } from "@/runtime/react/materialOverrides";
import { buildKeyboard, defaultConfig, defaultKey, keyMaterialPatch, KIT, parseConfig, resolveLogoUrl, resize } from "./keyboard";

const kit = () => {
  const doc = createDocument();
  doc.assets[KIT.assetId] = { id: KIT.assetId, kind: "glb", name: "kit.glb", hash: "h", size: 1 };
  return doc;
};

describe("keyboard builder", () => {
  it("builds a valid doc for every size extreme", () => {
    for (const [rows, cols] of [[1, 1], [4, 6], [8, 12], [2, 9]]) {
      const doc = validateDocument(buildKeyboard(kit(), defaultConfig(rows, cols)));
      const keys = Object.values(doc.nodes).filter((n) => /^Key \d/.test(n.name));
      expect(keys).toHaveLength(rows * cols);
      expect(Object.values(doc.materials).filter((m) => m.name.startsWith("key:"))).toHaveLength(rows * cols);
      expect(doc.interactions).toHaveLength(rows * cols * 3);
    }
  });

  it("default 6 × 4 leaves the case untouched", () => {
    const doc = buildKeyboard(kit(), defaultConfig());
    for (const n of Object.values(doc.nodes).filter((n) => n.name.startsWith("Case "))) {
      expect(n.transform.scale.every((s) => Math.abs(s - 1) < 1e-4)).toBe(true);
      expect(n.transform.position.every((p) => Math.abs(p) < 1e-4)).toBe(true);
    }
    expect(doc.nodes.kb.transform.scale[0]).toBe(1);
  });

  it("enables bloom and reports each 3D key click to the host", () => {
    const doc = validateDocument(buildKeyboard(kit(), defaultConfig(1, 2)));
    expect(doc.environment.bloom).toBe(true);
    const occluders = pointerOccluderIds(doc, interactiveNodeIds(doc));
    expect(occluders).toEqual(new Set(Object.keys(doc.nodes).filter((id) => id.startsWith("case_"))));
    expect(occluders.size).toBe(9);
    const runtime = new InteractionRuntime(doc);
    const clicked: string[] = [];
    runtime.onEvent = (event) => {
      if (event.type === "interaction" && event.trigger.type === "click") clicked.push(event.trigger.nodeId);
    };
    expect(runtime.pointer("click", "key_1")).toBe(true);
    expect(runtime.pointer("click", "key_2")).toBe(true);
    const positionAt = (delta: number) => runtime.advance(delta).get("key_2:transform.position") as number[];
    const restY = doc.nodes.key_2.transform.position[1];
    expect(positionAt(0)[1]).toBe(restY);
    const earlyY = positionAt(0.025)[1];
    const halfwayY = positionAt(0.025)[1];
    const pressed = positionAt(0.05);
    expect(earlyY).toBeLessThan(restY);
    expect(earlyY).toBeGreaterThan(halfwayY);
    expect(halfwayY).toBeCloseTo((restY + pressed[1]) / 2, 5);
    expect(pressed[1]).toBeCloseTo(0.83343, 5);
    expect(doc.nodes.key_2.transform.position[1] - pressed[1]).toBeCloseTo(KIT.keyHeight * 0.6, 5);
    expect(clicked).toEqual(["key_1", "key_2"]);
    for (const interaction of doc.interactions) {
      expect(interaction.action).toMatchObject({ type: "transition", duration: 0.1, ease: "easeInOut" });
    }
  });

  it("keeps glow colors and limits emission so dark caps do not wash out", () => {
    for (const key of defaultConfig().keys) {
      const patch = keyMaterialPatch(key, true);
      const color = new Color(patch.emissive);
      const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      expect(patch.emissive).toBe(key.color);
      const emittedLuminance = luminance * patch.emissiveIntensity!;
      expect(patch.emissiveIntensity).toBeLessThanOrEqual(4);
      if (luminance < 0.08) expect(emittedLuminance).toBeLessThan(0.32);
      expect(emittedLuminance).toBeLessThan(1.2);
      expect(keyMaterialPatch(key, false).emissiveIntensity).toBe(0);
    }
  });

  it("clears live emission on release after clicks, rapid re-entry, and color edits", () => {
    const config = defaultConfig(1, 2);
    const doc = buildKeyboard(kit(), config);
    const runtime = new InteractionRuntime(doc);
    const materials = new Map([1, 2].map((n) => [`mt_key_${n}`, new MeshPhysicalMaterial()]));
    const host = { doc, materials, overrides: createOverrideStore(), invalidate: () => {} };
    runtime.onEvent = (event) => {
      if (event.type !== "stateChange") return;
      const n = Number(event.nodeId.slice("key_".length));
      setMaterialOverride(host, `key:${n}`, keyMaterialPatch(config.keys[n - 1], event.stateId === `st_key_${n}`));
    };
    const material = (n: number) => materials.get(`mt_key_${n}`)!;

    for (let cycle = 0; cycle < 4; cycle++) {
      runtime.pointer("hoverEnter", "key_1");
      runtime.pointer("click", "key_1");
      expect(material(1).emissiveIntensity).toBeGreaterThan(0);
      runtime.advance(0.025);
      runtime.pointer("hoverExit", "key_1");
      runtime.pointer("hoverEnter", "key_2");
      expect(material(1).emissiveIntensity).toBe(0);
      expect(material(1).emissive.getHex()).toBe(0);
      expect(material(2).emissiveIntensity).toBeGreaterThan(0);

      config.keys[0].color = "#2f8333";
      setMaterialOverride(host, "key:1", keyMaterialPatch(config.keys[0], runtime.getState().key_1 === "st_key_1"));
      expect(material(1).emissiveIntensity).toBe(0);
      runtime.pointer("click", "key_2");
      runtime.pointer("hoverExit", "key_2");
      runtime.advance(0.1);
      expect(material(2).emissiveIntensity).toBe(0);
      expect(runtime.getState()).toMatchObject({ key_1: "base", key_2: "base" });
    }
    for (const mat of materials.values()) mat.dispose();
  });

  it("case mid slices never invert at 1 × 1", () => {
    const doc = buildKeyboard(kit(), defaultConfig(1, 1));
    expect(doc.nodes.case_11.transform.scale[0]).toBeGreaterThan(0);
    expect(doc.nodes.case_11.transform.scale[2]).toBeGreaterThan(0);
  });

  it("resize keeps keys at their row/col", () => {
    const base = defaultConfig(2, 2);
    base.keys[3] = { color: "#123456", logo: null };
    const grown = resize(base, 3, 3);
    expect(grown.keys[4]).toEqual({ color: "#123456", logo: null });
    expect(resize(grown, 2, 2).keys[3]).toEqual({ color: "#123456", logo: null });
  });

  it("parseConfig clamps and repairs pasted json", () => {
    expect(parseConfig({ rows: 2 })).toBeNull();
    const parsed = parseConfig({ rows: 99, cols: 2, keys: [{ color: "nope", logo: 5 }, { color: "#ABCDEF", logo: null }] })!;
    expect(parsed.rows).toBe(8);
    expect(parsed.keys).toHaveLength(16);
    expect(parsed.keys[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(parsed.keys[1]).toEqual({ color: "#abcdef", logo: null });
  });

  it("round-trips absolute logo URLs and repairs unsupported URLs", () => {
    const urls = [
      "https://images.example.com/logo.svg?color=blue&v=2#logo",
      "http://localhost:3000/custom-logo.svg",
    ];
    const config = defaultConfig(1, 2);
    config.keys.forEach((key, i) => { key.logo = ` ${urls[i]} `; });
    const parsed = parseConfig(JSON.parse(JSON.stringify(config)))!;
    expect(parsed.keys.map((key) => key.logo)).toEqual(urls);
    expect(resize(parsed, 2, 2).keys.map((key) => key.logo)).toEqual([...urls, defaultKey(2).logo, defaultKey(3).logo]);

    for (const logo of ["https:logo.svg", "data:image/svg+xml,test", "", null]) {
      expect(parseConfig({ rows: 1, cols: 1, keys: [{ logo }] })!.keys[0].logo).toBeNull();
    }
  });

  it("keeps logo names in config and resolves their images through theSVG", () => {
    const config = parseConfig({
      rows: 1,
      cols: 3,
      keys: [{ logo: " React " }, { logo: "google cloud" }, { logo: "aws-lambda" }],
    })!;
    expect(config.keys.map((key) => key.logo)).toEqual(["React", "google cloud", "aws-lambda"]);
    expect(config.keys.map((key) => resolveLogoUrl(key.logo))).toEqual([
      "https://thesvg.org/icons/react/mono.svg",
      "https://thesvg.org/icons/google-cloud/mono.svg",
      "https://thesvg.org/icons/aws-lambda/mono.svg",
    ]);
    expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });
});
