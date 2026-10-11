// runtime keyboard layout: any rows × cols grid from the keycaps kit
// (public/scenes/keycaps.chibi.zip). shared with
// packages/rt-npm-test/scripts/generate-keycaps-scene.mjs (node strips the
// types) -> only `import type` + erasable syntax here.
import type {
  ChibiDocument,
  ChibiMaterial,
  ChibiNode,
  MaterialPatch,
  Vec3,
} from "@/runtime";

export type KeyConfig = {
  color: string;
  /** theSVG logo name or absolute HTTP(S) image URL; null = blank cap. */
  logo: string | null;
};

export type KeyboardConfig = {
  rows: number;
  cols: number;
  /** row-major, rows * cols long */
  keys: KeyConfig[];
};

export const MIN_SIZE = 1;
export const MAX_ROWS = 8;
export const MAX_COLS = 12;

// kit geometry (keycap footprint = 1); the generator asserts these against
// its source measurements
export const KIT = {
  assetId: "as_keyboard",
  pitch: 1.04468,
  keyY: 1.29117,
  keyHeight: 0.7629,
  logoY: 0.13985,
  logoSize: 0.52,
  pressFraction: 0.6,
  // case 9-slice cut planes: all corner/rim curvature lies outside them
  cutX: 3.189,
  cutZ: 2.053,
  halfW: 3.67448,
  halfD: 2.57744,
  // the case was modelled around a 6 × 4 grid
  cols: 6,
  rows: 4,
} as const;

/** glb child index of case slice (xi, zi), each in 0..2 = -, mid, + */
export const caseSlicePath = (xi: number, zi: number) => String(1 + zi * 3 + xi);

export const DEFAULT_COLORS = [
  "#ff9408", "#008fd5", "#ff480a", "#633595", "#00cce8", "#00b880",
  "#333537", "#00bfd8", "#00952c", "#343638", "#146888", "#00c51b",
  "#ff4622", "#343638", "#18333e", "#f50032", "#efbe00", "#007d9f",
  "#333537", "#009fe8", "#00a20b", "#ff9208", "#009f18", "#303234",
];

export const LOGOS = [
  "javascript", "typescript", "supabase", "trpc", "react", "vuedotjs",
  "nextdotjs", "tailwind-css", "nodedotjs", "express", "postgresql", "mongodb",
  "hono", "turborepo", "prisma", "redis", "firebase", "cloudflare",
  "socketdotio", "docker", "drizzle", "gsap", "python", "vercel",
];

/** Resolve a logo name through theSVG; keep absolute HTTP(S) URLs intact. */
export function resolveLogoUrl(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const value = input.trim();
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && (url.protocol === "http:" || url.protocol === "https:")
      ? value
      : null;
  } catch {
    const slug = value.toLowerCase().replace(/\s+/g, "-");
    return `https://thesvg.org/icons/${encodeURIComponent(slug)}/mono.svg`;
  }
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const HEX = /^#[0-9a-f]{6}$/i;

/** Default key for slot i: palette color and logo cycle. */
export function defaultKey(i: number): KeyConfig {
  return {
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    logo: LOGOS[i % LOGOS.length],
  };
}

export function defaultConfig(rows: number = KIT.rows, cols: number = KIT.cols): KeyboardConfig {
  return resize({ rows: 0, cols: 0, keys: [] }, rows, cols);
}

export function keyMaterialPatch(key: KeyConfig, glowing: boolean): MaterialPatch {
  if (!glowing) return { color: key.color, emissive: "#000000", emissiveIntensity: 0 };
  const linear = (offset: number) => {
    const channel = parseInt(key.color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
  return {
    color: key.color,
    emissive: key.color,
    // Cap the boost so dark colors stay dark instead of washing out to white.
    emissiveIntensity: Math.min(4, 1.1 / Math.max(luminance, 0.005)),
  };
}

/** keeps each key at its (row, col); new cells get defaults */
export function resize(config: KeyboardConfig, rows: number, cols: number): KeyboardConfig {
  rows = clampInt(rows, MIN_SIZE, MAX_ROWS, config.rows);
  cols = clampInt(cols, MIN_SIZE, MAX_COLS, config.cols);
  const keys: KeyConfig[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const old = r < config.rows && c < config.cols ? config.keys[r * config.cols + c] : undefined;
      keys.push(old ?? defaultKey(r * cols + c));
    }
  return { rows, cols, keys };
}

/** lenient parse of pasted/stored json -> valid config, or null */
export function parseConfig(input: unknown): KeyboardConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.keys)) return null;
  const rows = clampInt(raw.rows, MIN_SIZE, MAX_ROWS, 0);
  const cols = clampInt(raw.cols, MIN_SIZE, MAX_COLS, 0);
  if (!rows || !cols) return null;
  const keys = raw.keys.map((k, i): KeyConfig => {
    const key = (k ?? {}) as Record<string, unknown>;
    const fallback = defaultKey(i);
    return {
      color: typeof key.color === "string" && HEX.test(key.color) ? key.color.toLowerCase() : fallback.color,
      logo: typeof key.logo === "string" && resolveLogoUrl(key.logo) ? key.logo.trim() : null,
    };
  });
  return resize({ rows, cols, keys }, rows, cols);
}

function material(id: string, name: string, props: Partial<ChibiMaterial>): ChibiMaterial {
  return {
    id,
    name,
    type: "standard",
    color: "#ffffff",
    metalness: 0,
    roughness: 0.5,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    flatShading: false,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
    sheen: 0,
    sheenColor: "#ffffff",
    maps: { map: null, normalMap: null, roughnessMap: null },
    ...props,
  };
}

const round = (x: number) => +x.toFixed(5);

/**
 * kit doc (lights, camera, env, assets) + config -> full document. keyboard
 * nodes/materials/states are regenerated; material names `key:N` / `logo:N`
 * (N = 1-based row-major) are the host's api.setMaterial handles. logo maps
 * are pushed at runtime, not baked.
 */
export function buildKeyboard(kit: ChibiDocument, config: KeyboardConfig): ChibiDocument {
  const nodes: Record<string, ChibiNode> = {};
  const materials: Record<string, ChibiMaterial> = {};
  const root: string[] = [];
  for (const id of kit.root) {
    const node = kit.nodes[id];
    if (node?.type !== "light") continue;
    nodes[id] = node;
    root.push(id);
  }

  const { rows, cols } = config;
  // inner half extents: the case slices' mid parts stretch, rims/corners move
  const innerX = KIT.cutX + ((cols - KIT.cols) * KIT.pitch) / 2;
  const innerZ = KIT.cutZ + ((rows - KIT.rows) * KIT.pitch) / 2;
  // iso camera: on-screen size ∝ width + depth -> shrink big boards to fit
  const span = innerX + innerZ + KIT.halfW - KIT.cutX + KIT.halfD - KIT.cutZ;
  const fit = round(Math.min(1.2, (KIT.halfW + KIT.halfD) / span));

  const board = "kb";
  nodes[board] = {
    id: board,
    name: "Keyboard",
    type: "group",
    visible: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [fit, fit, fit] },
    children: [],
  };
  root.push(board);

  const model = (
    id: string,
    name: string,
    path: string,
    materialId: string,
    position: Vec3,
    scale: Vec3,
    parent: string,
  ) => {
    nodes[id] = {
      id,
      name,
      type: "model",
      assetId: KIT.assetId,
      path,
      materialId,
      castShadow: true,
      receiveShadow: true,
      visible: true,
      transform: { position, rotation: [0, 0, 0], scale },
      children: [],
    };
    nodes[parent].children.push(id);
  };

  materials.mt_case = material("mt_case", "Case", { color: "#171819", roughness: 0.64 });
  const axis = (i: number, cut: number, inner: number) =>
    i === 1 ? { at: 0, scale: round(inner / cut) } : { at: round((i - 1) * (inner - cut)), scale: 1 };
  for (let zi = 0; zi < 3; zi++)
    for (let xi = 0; xi < 3; xi++) {
      const x = axis(xi, KIT.cutX, innerX);
      const z = axis(zi, KIT.cutZ, innerZ);
      model(`case_${xi}${zi}`, `Case ${xi}${zi}`, caseSlicePath(xi, zi), "mt_case", [x.at, 0, z.at], [x.scale, 1, z.scale], board);
    }

  const states: ChibiDocument["states"] = {};
  const interactions: ChibiDocument["interactions"] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c + 1;
      const key = config.keys[n - 1] ?? defaultKey(n - 1);
      const id = `key_${n}`;
      const position: Vec3 = [
        round((c - (cols - 1) / 2) * KIT.pitch),
        KIT.keyY,
        round((r - (rows - 1) / 2) * KIT.pitch),
      ];
      materials[`mt_key_${n}`] = material(`mt_key_${n}`, `key:${n}`, {
        color: key.color,
        roughness: 0.3,
        clearcoat: 0.18,
        clearcoatRoughness: 0.32,
      });
      model(id, `Key ${n}`, "0", `mt_key_${n}`, position, [1, 1, 1], board);

      // decal stays invisible until the host pushes a map (+ opacity 1)
      materials[`mt_logo_${n}`] = material(`mt_logo_${n}`, `logo:${n}`, {
        roughness: 0.6,
        transparent: true,
        opacity: 0,
      });
      nodes[`logo_${n}`] = {
        id: `logo_${n}`,
        name: `Logo ${n}`,
        type: "mesh",
        geometry: { kind: "plane", params: { width: KIT.logoSize, height: KIT.logoSize } },
        materialId: `mt_logo_${n}`,
        castShadow: false,
        receiveShadow: true,
        visible: true,
        transform: { position: [0, KIT.logoY, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 1, 1] },
        children: [],
      };
      nodes[id].children.push(`logo_${n}`);

      const pressed = `st_key_${n}`;
      states[pressed] = {
        id: pressed,
        nodeId: id,
        name: "Pressed",
        overrides: {
          [id]: { "transform.position": [position[0], round(KIT.keyY - KIT.keyHeight * KIT.pressFraction), position[2]] },
        },
      };
      interactions.push(
        {
          id: `ix_click_${n}`,
          trigger: { type: "click", nodeId: id },
          action: { type: "transition", nodeId: id, to: pressed, duration: 0.1, ease: "easeInOut" },
        },
        {
          id: `ix_in_${n}`,
          trigger: { type: "hoverEnter", nodeId: id },
          action: { type: "transition", nodeId: id, to: pressed, duration: 0.1, ease: "easeInOut" },
        },
        {
          id: `ix_out_${n}`,
          trigger: { type: "hoverExit", nodeId: id },
          action: { type: "transition", nodeId: id, to: "base", duration: 0.1, ease: "easeInOut" },
        },
      );
    }

  return {
    ...kit,
    environment: { ...kit.environment, bloom: true },
    root, nodes, materials, animations: {}, states, interactions,
  };
}
