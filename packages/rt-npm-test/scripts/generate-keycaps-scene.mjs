// Generates keycaps.chibi.zip for the main app's /demo/keycaps: the keycap +
// case meshes from the Spline export in assets/keycaps-keyboard.gltf, baked
// into one GLB (path "0" keycap, "1".."9" case 9-slice). layout lives in
// src/app/demo/keycaps/keyboard.ts, shared with the page so any rows × cols
// grid can be built at runtime; this ships the default 6 × 4.
// Run with `node scripts/generate-keycaps-scene.mjs`.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { sceneBuilder } from "./lib.mjs";
import { KIT, buildKeyboard, caseSlicePath, defaultConfig } from "../../../src/app/demo/keycaps/keyboard.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSZip = createRequire(resolve(__dirname, "../../../package.json"))("jszip");
const b = sceneBuilder();

const src = JSON.parse(readFileSync(resolve(__dirname, "assets/keycaps-keyboard.gltf"), "utf8"));
const bin = Buffer.from(src.buffers[0].uri.split(",")[1], "base64");

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(i) {
  const acc = src.accessors[i];
  const view = src.bufferViews[acc.bufferView];
  const n = COMPONENTS[acc.type];
  const Arr = acc.componentType === 5126 ? Float32Array : acc.componentType === 5125 ? Uint32Array : Uint16Array;
  const stride = view.byteStride ?? n * Arr.BYTES_PER_ELEMENT;
  const out = new Arr(acc.count * n);
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  for (let e = 0; e < acc.count; e++) {
    for (let k = 0; k < n; k++) {
      const at = base + e * stride + k * Arr.BYTES_PER_ELEMENT;
      out[e * n + k] = Arr === Float32Array ? bin.readFloatLE(at) : Arr === Uint32Array ? bin.readUInt32LE(at) : bin.readUInt16LE(at);
    }
  }
  return out;
}

// column-major 4×4, as glTF stores them
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, c) => {
  const o = new Array(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) o[col * 4 + row] += a[k * 4 + row] * c[col * 4 + k];
  return o;
};
const local = (i) => src.nodes[i].matrix ?? IDENTITY;
const byName = (parent, name) => src.nodes[parent].children.find((c) => src.nodes[c].name === name);

function bakeMesh(meshIndex, m) {
  const prim = src.meshes[meshIndex].primitives[0];
  const pos = readAccessor(prim.attributes.POSITION);
  const nrm = readAccessor(prim.attributes.NORMAL);
  const outPos = new Float32Array(pos.length);
  const outNrm = new Float32Array(nrm.length);
  for (let v = 0; v < pos.length; v += 3) {
    const [x, y, z] = [pos[v], pos[v + 1], pos[v + 2]];
    for (let k = 0; k < 3; k++) outPos[v + k] = m[k] * x + m[4 + k] * y + m[8 + k] * z + m[12 + k];
    // matrices here are rotation × uniform scale, so the 3×3 + renormalize is enough
    const n = [0, 1, 2].map((k) => m[k] * nrm[v] + m[4 + k] * nrm[v + 1] + m[8 + k] * nrm[v + 2]);
    const len = Math.hypot(...n);
    for (let k = 0; k < 3; k++) outNrm[v + k] = n[k] / len;
  }
  return { pos: outPos, nrm: outNrm, idx: Uint32Array.from(readAccessor(prim.indices)) };
}

const KEYBOARD = src.nodes.findIndex((n) => n.name === "keyboard");
const rows = src.nodes[KEYBOARD].children
  .filter((c) => src.nodes[c].name.startsWith("row "))
  .sort((a, c) => local(a)[14] - local(c)[14]);
const firstCap = byName(src.nodes[rows[0]].children[0], "keycap");
const desktop = byName(firstCap, "keycap-desktop");
const legend = byName(firstCap, "legend");

// units: one keycap footprint = 1
const capAcc = src.accessors[src.meshes[src.nodes[desktop].mesh].primitives[0].attributes.POSITION];
const S = 1 / (capAcc.max[0] - capAcc.min[0]);
const scale = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, 0, 0, 0, 1];

const bodyNode = byName(KEYBOARD, "body");
const body = bakeMesh(src.nodes[bodyNode].mesh, mul(scale, local(bodyNode)));
let floor = Infinity;
for (let v = 1; v < body.pos.length; v += 3) floor = Math.min(floor, body.pos[v]);
for (let v = 1; v < body.pos.length; v += 3) body.pos[v] -= floor;
// keycap mesh in its "keycap" node's space, so the chibi key node = that node
const cap = bakeMesh(src.nodes[desktop].mesh, mul(scale, local(desktop)));
let capTop = -Infinity;
for (let v = 1; v < cap.pos.length; v += 3) capTop = Math.max(capTop, cap.pos[v]);

function writeGlb(meshes) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const push = (arr, target, type, extra = {}) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf);
    offset += buf.length; // all arrays are 4-byte elements, alignment holds
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: arr instanceof Uint32Array ? 5125 : 5126,
      count: arr.length / COMPONENTS[type],
      type,
      ...extra,
    });
    return accessors.length - 1;
  };
  const gltfMeshes = meshes.map(({ pos, nrm, idx }) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < pos.length; v += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[v + k]);
        max[k] = Math.max(max[k], pos[v + k]);
      }
    const POSITION = push(pos, 34962, "VEC3", { min, max });
    const NORMAL = push(nrm, 34962, "VEC3");
    const indices = push(idx, 34963, "SCALAR");
    return { primitives: [{ attributes: { POSITION, NORMAL }, indices, mode: 4 }] };
  });
  const json = {
    asset: { version: "2.0", generator: "chibi generate-keycaps-scene" },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
  const jsonBuf = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binBuf = pad(Buffer.concat(chunks), 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const chunkHead = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  return Buffer.concat([header, chunkHead(jsonBuf.length, 0x4e4f534a), jsonBuf, chunkHead(binBuf.length, 0x004e4942), binBuf]);
}

// 9-slice: clip every tri at x = ±cutX, z = ±cutZ. the builder stretches the
// mid slices + moves rims/corners, so the rounded corners never distort
function clipTri(tri, axis, value) {
  const below = [];
  const above = [];
  for (let i = 0; i < 3; i++) {
    const p = tri[i];
    const q = tri[(i + 1) % 3];
    const dp = p.pos[axis] - value;
    const dq = q.pos[axis] - value;
    (dp <= 0 ? below : above).push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      const lerp = (a, c) => a.map((x, k) => x + (c[k] - x) * t);
      const n = lerp(p.nrm, q.nrm);
      const len = Math.hypot(...n);
      const cut = { pos: lerp(p.pos, q.pos), nrm: n.map((x) => x / len) };
      cut.pos[axis] = value;
      below.push(cut);
      above.push(cut);
    }
  }
  const fan = (poly) => poly.slice(2).map((_, i) => [poly[0], poly[i + 1], poly[i + 2]]);
  return [below.length >= 3 ? fan(below) : [], above.length >= 3 ? fan(above) : []];
}
function slice(mesh) {
  let tris = [];
  for (let t = 0; t < mesh.idx.length; t += 3)
    tris.push([0, 1, 2].map((k) => {
      const v = mesh.idx[t + k] * 3;
      return { pos: [...mesh.pos.slice(v, v + 3)], nrm: [...mesh.nrm.slice(v, v + 3)] };
    }));
  const split = (list, axis, value) => {
    const lo = [];
    const hi = [];
    for (const tri of list) {
      const [a, c] = clipTri(tri, axis, value);
      lo.push(...a);
      hi.push(...c);
    }
    return [lo, hi];
  };
  const bands = (list, axis, cut) => {
    const [lo, rest] = split(list, axis, -cut);
    const [mid, hi] = split(rest, axis, cut);
    return [lo, mid, hi];
  };
  const parts = [];
  bands(tris, 2, KIT.cutZ).forEach((band, zi) =>
    bands(band, 0, KIT.cutX).forEach((part, xi) => {
      tris = part.flat();
      parts[+caseSlicePath(xi, zi) - 1] = {
        name: `case ${xi}${zi}`,
        pos: Float32Array.from(tris.flatMap((v) => v.pos)),
        nrm: Float32Array.from(tris.flatMap((v) => v.nrm)),
        idx: Uint32Array.from(tris.keys()),
      };
    }),
  );
  return parts;
}

const glb = writeGlb([{ name: "keycap", ...cap }, ...slice(body)]);
const hash = createHash("sha256").update(glb).digest("hex");
b.doc.assets[KIT.assetId] = { id: KIT.assetId, kind: "glb", name: "keycaps-keyboard.glb", hash, size: glb.length };

// The key lights the -x walls; weak +z fill leaves the right walls dark.
// The key casts inter-key shadows; AO adds contact shading in the gaps.
b.light("Key light", {
  light: { kind: "directional", color: "#fffaf3", intensity: 3.2, castShadow: true },
  position: [-6, 8, -3],
});
b.light("Fill", {
  light: { kind: "directional", color: "#e6efff", intensity: 0.2, castShadow: false },
  position: [4, 6, 6],
});

// Match the reference's ~41° elevation and ~48° azimuth. A distant 4° lens
// approximates its orthographic projection within the existing scene format.
const direction = [-1.095, 1.309, 1];
const DIR = direction.map((x) => x / Math.hypot(...direction));
const DIST = 96;
const TARGET = [0, 0.35, 0];
const round = (x) => +x.toFixed(5);
const doc = b.doc;
doc.name = "Keycaps";
doc.camera = { position: DIR.map((d, k) => round(TARGET[k] + d * DIST)), target: TARGET, fov: 4 };
doc.environment = {
  ...doc.environment,
  background: "#101520",
  backgroundGradient: "#080b11",
  preset: "product",
  shadows: true,
  softShadows: true,
  toneMapping: "linear",
  ao: true,
  exposure: 0.92,
};
doc.editor = { grid: false };

// written straight to the main app (validated there by src/scenes.test.ts):
// model materialId + the "soft" preset postdate the published runtime this
// package's lib validates against
const zip = new JSZip();
zip.file("document.json", JSON.stringify(buildKeyboard(doc, defaultConfig())));
zip.file(`assets/${hash}`, glb);
const out = resolve(__dirname, "../../../public/scenes/keycaps.chibi.zip");
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`wrote ${out} (glb ${glb.length} bytes)`);
