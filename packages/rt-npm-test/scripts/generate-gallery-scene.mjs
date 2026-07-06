// Generates public/scenes/gallery.chibi.json: a museum of every geometry kind
// at extreme parameter values plus a big material study wall. Stress targets:
// inspector geometry params (corner radius, segment counts, text3d bevel),
// ~80 materials in the material panel (metalness x roughness sweep, emissive
// row, glass opacity row), material color/opacity animation tracks, and hover
// states on every exhibit.
// Run with `node scripts/generate-gallery-scene.mjs`.
import { sceneBuilder, TAU } from "./lib.mjs";

const b = sceneBuilder();

// --- room ---------------------------------------------------------------------

b.mesh("Floor", {
  geometry: { kind: "plane", params: { width: 26, height: 20, cornerRadius: 1 } },
  materialId: b.material("Floor", { color: "#d8d2c8", roughness: 0.35, metalness: 0.05 }),
  rotation: [-Math.PI / 2, 0, 0],
  castShadow: false,
});
b.mesh("Back wall", {
  geometry: { kind: "plane", params: { width: 26, height: 10, cornerRadius: 0.4 } },
  materialId: b.material("Wall", { color: "#efe9df", roughness: 0.9, metalness: 0 }),
  position: [0, 5, -9.8],
  castShadow: false,
});

// --- exhibits: one of each geometry kind at extreme params ----------------------

const EXHIBITS = [
  {
    name: "Soft box",
    blurb: "max corner radius + smoothness",
    geometry: { kind: "box", params: { width: 1.4, height: 1.4, depth: 1.4, radius: 0.5, smoothness: 16 } },
    mat: { color: "#e85d75", roughness: 0.25, metalness: 0.1 },
  },
  {
    name: "Lowpoly sphere",
    blurb: "min segments, flat shaded",
    geometry: { kind: "sphere", params: { radius: 0.85, widthSegments: 6, heightSegments: 4 } },
    mat: { color: "#6fbf8f", roughness: 0.6, flatShading: true },
  },
  {
    name: "Silk sphere",
    blurb: "max segments 128x64",
    geometry: { kind: "sphere", params: { radius: 0.85, widthSegments: 128, heightSegments: 64 } },
    mat: { color: "#5a8fdc", roughness: 0.08, metalness: 0.9 },
  },
  {
    name: "Needle",
    blurb: "cylinder, radiusTop 0",
    geometry: { kind: "cylinder", params: { radiusTop: 0, radiusBottom: 0.7, height: 1.9, radialSegments: 5 } },
    mat: { color: "#d9b57e", roughness: 0.5, flatShading: true },
  },
  {
    name: "Party cone",
    blurb: "3 radial segments",
    geometry: { kind: "cone", params: { radius: 0.8, height: 1.7, radialSegments: 3 } },
    mat: { color: "#b07fe0", roughness: 0.55, flatShading: true },
  },
  {
    name: "Dense torus",
    blurb: "200 tubular segments",
    geometry: { kind: "torus", params: { radius: 0.7, tube: 0.28, radialSegments: 64, tubularSegments: 200 } },
    mat: { color: "#ff9f5a", roughness: 0.2, metalness: 0.7 },
  },
  {
    name: "Fat type",
    blurb: "text3d, max bevel",
    geometry: { kind: "text3d", params: { text: "chibi!", size: 0.6, depth: 0.35, bevel: 0.1 } },
    mat: { color: "#f2d84b", roughness: 0.3, metalness: 0.6 },
    offsetX: -0.9, // text isn't center-origin
  },
];

const plinthMat = b.material("Plinth", { color: "#c9c2b6", roughness: 0.8, metalness: 0 });
const labelMat = b.material("Label", { color: "#3a3630", roughness: 0.8 });
const spinTracks = [];

EXHIBITS.forEach((ex, i) => {
  const x = (i - (EXHIBITS.length - 1) / 2) * 3.4;
  const stand = b.group(ex.name, { position: [x, 0, -3.5] });
  b.mesh("Plinth", {
    geometry: { kind: "cylinder", params: { radiusTop: 1.0, radiusBottom: 1.15, height: 1, radialSegments: 40 } },
    materialId: plinthMat,
    parent: stand,
    position: [0, 0.5, 0],
  });
  const spinner = b.group("Turntable", { parent: stand, position: [0, 2.05, 0] });
  const mat = b.material(ex.name, ex.mat);
  const piece = b.mesh(ex.name, {
    geometry: ex.geometry,
    materialId: mat,
    parent: spinner,
    position: [ex.offsetX ?? 0, 0, 0],
  });
  b.mesh("Label", {
    geometry: { kind: "text3d", params: { text: ex.blurb, size: 0.14, depth: 0.02, bevel: 0 } },
    materialId: labelMat,
    parent: stand,
    position: [-0.85, 1.06, 1.0],
    rotation: [-Math.PI / 2, 0, 0],
    castShadow: false,
  });
  spinTracks.push({
    targetId: spinner,
    property: "transform.rotation",
    keyframes: [{ t: 0, v: [0, 0, 0] }, { t: 24, v: [0, TAU, 0] }],
  });
  // hover: lift the piece and brighten it
  const lifted = b.state(piece, "Lifted", {
    [piece]: { "transform.position": [ex.offsetX ?? 0, 0.45, 0] },
    [mat]: { color: "#ffffff" },
  });
  b.hoverState(piece, lifted);
});

// --- material study wall: metalness x roughness sweep ----------------------------

const wall = b.group("Material wall", { position: [0, 0, -8.9] });
const SWEEP = 7;
for (let row = 0; row < SWEEP; row++) {
  for (let col = 0; col < SWEEP; col++) {
    const metalness = row / (SWEEP - 1);
    const roughness = col / (SWEEP - 1);
    b.mesh(`Sweep m${row} r${col}`, {
      geometry: { kind: "sphere", params: { radius: 0.42, widthSegments: 24, heightSegments: 16 } },
      materialId: b.material(`m ${metalness.toFixed(2)} / r ${roughness.toFixed(2)}`, {
        color: "#c8564a", metalness, roughness,
      }),
      parent: wall,
      position: [(col - (SWEEP - 1) / 2) * 1.15, 1.4 + row * 1.05, 0.6],
      castShadow: false,
    });
  }
}

// emissive intensity row
for (let i = 0; i < SWEEP; i++) {
  b.mesh(`Emissive ${i}`, {
    geometry: { kind: "sphere", params: { radius: 0.42, widthSegments: 24, heightSegments: 16 } },
    materialId: b.material(`emissive ${(i * 0.6).toFixed(1)}`, {
      color: "#1a1a20", emissive: "#4ad9c8", emissiveIntensity: i * 0.6, roughness: 0.5,
    }),
    parent: wall,
    position: [(i - (SWEEP - 1) / 2) * 1.15, 1.4 + SWEEP * 1.05, 0.6],
    castShadow: false,
  });
}

// glass row: opacity gradient, in front of the exhibits so sorting artifacts show
const glassGroup = b.group("Glass row", { position: [0, 0, 0.5] });
const glassMats = [];
for (let i = 0; i < 6; i++) {
  const opacity = 0.15 + i * 0.15;
  const mat = b.material(`glass ${opacity.toFixed(2)}`, {
    color: "#bfe3ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity,
  });
  glassMats.push(mat);
  b.mesh(`Pane ${i + 1}`, {
    geometry: { kind: "box", params: { width: 1.6, height: 2.2, depth: 0.06, radius: 0.03, smoothness: 4 } },
    materialId: mat,
    parent: glassGroup,
    position: [(i - 2.5) * 2.2, 1.6, 0],
    castShadow: false,
  });
}

// --- neon sign: animated material color + opacity --------------------------------

const neonMat = b.material("Neon sign", {
  color: "#ff4ad9", emissive: "#ff4ad9", emissiveIntensity: 2.4, roughness: 0.3,
  transparent: true, opacity: 1,
});
b.mesh("Neon sign", {
  geometry: { kind: "text3d", params: { text: "GALLERY", size: 0.9, depth: 0.12, bevel: 0.03 } },
  materialId: neonMat,
  position: [-3.2, 7.6, -9.4],
  castShadow: false,
});
b.mesh("Neon ring", {
  geometry: { kind: "torus", params: { radius: 1.1, tube: 0.05, radialSegments: 12, tubularSegments: 80 } },
  materialId: neonMat,
  position: [9, 8.1, -9.4],
  castShadow: false,
});

// --- lights -----------------------------------------------------------------------

b.light("Skylight", {
  light: { kind: "directional", color: "#fff8ec", intensity: 1.4, castShadow: true },
  position: [6, 12, 6],
});
b.light("Bounce", {
  light: { kind: "point", color: "#ffe2c4", intensity: 10, distance: 0, castShadow: false },
  position: [-6, 5, 4],
});
EXHIBITS.forEach((_, i) => {
  if (i % 2) return; // spot every other exhibit
  const x = (i - (EXHIBITS.length - 1) / 2) * 3.4;
  b.light(`Exhibit spot ${i + 1}`, {
    light: { kind: "spot", color: "#fff2dd", intensity: 18, distance: 12, angle: 0.42, penumbra: 0.9, castShadow: false },
    position: [x, 6.5, -1.5],
  });
});

// --- animations --------------------------------------------------------------------

b.playOnStart(b.animation("Turntables", { duration: 24, loop: true, tracks: spinTracks }));
b.playOnStart(
  b.animation("Neon flicker", {
    duration: 6,
    loop: true,
    tracks: [
      {
        targetId: neonMat,
        property: "color",
        keyframes: [
          { t: 0, v: "#ff4ad9" },
          { t: 2, v: "#4ad9ff", ease: "easeInOut" },
          { t: 4, v: "#d9ff4a", ease: "easeInOut" },
          { t: 6, v: "#ff4ad9", ease: "easeInOut" },
        ],
      },
      {
        targetId: neonMat,
        property: "opacity",
        keyframes: [
          { t: 0, v: 1 },
          { t: 2.8, v: 1 },
          { t: 2.9, v: 0.25, ease: "easeIn" },
          { t: 3.0, v: 1, ease: "easeOut" },
          { t: 6, v: 1 },
        ],
      },
    ],
  }),
);
// breathing glass wall
b.playOnStart(
  b.animation("Glass breathe", {
    duration: 8,
    loop: true,
    tracks: glassMats.map((mat, i) => ({
      targetId: mat,
      property: "opacity",
      keyframes: [
        { t: 0, v: 0.15 + i * 0.15 },
        { t: 4, v: Math.min(1, 0.45 + i * 0.15), ease: "easeInOut" },
        { t: 8, v: 0.15 + i * 0.15, ease: "easeInOut" },
      ],
    })),
  }),
);

b.write("gallery", {
  name: "Geometry & material gallery",
  camera: { position: [0, 5.5, 14], target: [0, 2.6, -3], fov: 45 },
  environment: { background: "#1a1c22", preset: "studio", fog: null, shadows: true },
  grid: false,
});
