// Generates public/scenes/orrery.chibi.json: a solar system built from deeply
// nested orbit-pivot groups. Stress targets: outliner depth (moons of moons,
// a 12-level "comet tail" chain), one clip with dozens of rotation tracks, and
// per-planet click-to-select toggle states.
// Run with `node scripts/generate-orrery-scene.mjs`.
import { sceneBuilder, rng, TAU } from "./lib.mjs";

const b = sceneBuilder();
const rand = rng(7);

const orbitTracks = [];
/** orbit pivot: a group at the parent's origin whose rotation.y loops */
function orbitPivot(name, parent, periodTurns, phase = 0) {
  const pivot = b.group(name, { parent, rotation: [0, phase, 0] });
  orbitTracks.push({
    targetId: pivot,
    property: "transform.rotation",
    keyframes: [
      { t: 0, v: [0, phase, 0] },
      { t: 60, v: [0, phase + TAU * periodTurns, 0] },
    ],
  });
  return pivot;
}

// --- sun -------------------------------------------------------------------

const system = b.group("Solar system");
const sunMat = b.material("Sun", {
  color: "#ffb347", emissive: "#ff8c1a", emissiveIntensity: 2.2, roughness: 1,
});
b.mesh("Sun", {
  geometry: { kind: "sphere", params: { radius: 1.6, widthSegments: 48, heightSegments: 32 } },
  materialId: sunMat,
  parent: system,
  castShadow: false,
  receiveShadow: false,
});
b.light("Sun light", {
  light: { kind: "point", color: "#ffd9a0", intensity: 60, distance: 0, castShadow: false },
  parent: system,
});
b.light("Ambient fill", {
  light: { kind: "directional", color: "#8899bb", intensity: 0.35, castShadow: false },
  position: [5, 10, 5],
});

// --- planets, moons, moons-of-moons -----------------------------------------

const PLANETS = [
  { name: "Cinder",  radius: 0.28, orbit: 3.2,  turns: 9,  color: "#c9836a", moons: 0 },
  { name: "Verdant", radius: 0.45, orbit: 5.0,  turns: 6,  color: "#6fbf8f", moons: 1 },
  { name: "Cobalt",  radius: 0.52, orbit: 6.9,  turns: 4,  color: "#5a8fdc", moons: 2, moonMoons: 1 },
  { name: "Rustia",  radius: 0.38, orbit: 8.8,  turns: 3,  color: "#d0684f", moons: 2 },
  { name: "Corona",  radius: 0.95, orbit: 11.4, turns: 2,  color: "#d9b57e", moons: 3, ringed: true },
  { name: "Glacio",  radius: 0.7,  orbit: 14.2, turns: 1.4, color: "#9fd8e8", moons: 2, moonMoons: 2 },
];

for (const p of PLANETS) {
  const pivot = orbitPivot(`${p.name} orbit`, system, p.turns, rand() * TAU);
  const anchor = b.group(`${p.name} anchor`, { parent: pivot, position: [p.orbit, 0, 0] });
  const mat = b.material(p.name, { color: p.color, roughness: 0.7, metalness: 0.05 });
  const planet = b.mesh(p.name, {
    geometry: { kind: "sphere", params: { radius: p.radius, widthSegments: 28, heightSegments: 20 } },
    materialId: mat,
    parent: anchor,
  });

  const selected = b.state(planet, "Selected", {
    [planet]: { "transform.scale": [1.6, 1.6, 1.6] },
    [mat]: { color: "#ffffff" },
  });
  b.clickToggle(planet, "base", selected);

  if (p.ringed) {
    b.mesh(`${p.name} ring`, {
      geometry: { kind: "torus", params: { radius: p.radius * 1.9, tube: 0.07, radialSegments: 6, tubularSegments: 96 } },
      materialId: b.material(`${p.name} ring`, { color: "#e8d9b8", roughness: 0.9, flatShading: true }),
      parent: anchor,
      rotation: [Math.PI / 2 - 0.25, 0, 0],
      scale: [1, 1, 0.4],
    });
  }

  for (let m = 0; m < (p.moons ?? 0); m++) {
    const mPivot = orbitPivot(`${p.name} moon ${m + 1} orbit`, anchor, 14 + m * 5, rand() * TAU);
    const mAnchor = b.group(`${p.name} moon ${m + 1} anchor`, {
      parent: mPivot,
      position: [p.radius + 0.55 + m * 0.45, 0.12 * (m % 2 ? -1 : 1), 0],
    });
    b.mesh(`${p.name} moon ${m + 1}`, {
      geometry: { kind: "sphere", params: { radius: 0.1 + 0.04 * m, widthSegments: 12, heightSegments: 8 } },
      materialId: b.material(`${p.name} moon ${m + 1}`, { color: "#a8a29e", roughness: 0.95, flatShading: true }),
      parent: mAnchor,
    });
    // moons of moons: one extra nesting level below the last moon
    if (m === 0 && p.moonMoons) {
      for (let mm = 0; mm < p.moonMoons; mm++) {
        const mmPivot = orbitPivot(`${p.name} moonlet ${mm + 1} orbit`, mAnchor, 30 + mm * 8, rand() * TAU);
        b.mesh(`${p.name} moonlet ${mm + 1}`, {
          geometry: { kind: "sphere", params: { radius: 0.045, widthSegments: 8, heightSegments: 6 } },
          materialId: b.material(`${p.name} moonlet ${mm + 1}`, { color: "#78716c", roughness: 1, flatShading: true }),
          parent: mmPivot,
          position: [0.28 + mm * 0.14, 0, 0],
        });
      }
    }
  }
}

// --- comet tail: a 12-level chain of nested groups ---------------------------
// Each link is a child of the previous one, offset and slightly rotated, so the
// outliner has to render a 12-deep single chain and the whole tail whips around
// as the head pivot spins.

const cometPivot = orbitPivot("Comet orbit", system, 2.6, 1.1);
let link = b.group("Comet head pivot", { parent: cometPivot, position: [17, 1.4, 0], rotation: [0, 0, 0.35] });
const headMat = b.material("Comet head", { color: "#dff3ff", emissive: "#9fd8ff", emissiveIntensity: 1.4, roughness: 0.4 });
b.mesh("Comet head", {
  geometry: { kind: "sphere", params: { radius: 0.22, widthSegments: 16, heightSegments: 12 } },
  materialId: headMat,
  parent: link,
  castShadow: false,
});
for (let i = 0; i < 12; i++) {
  link = b.group(`Tail link ${i + 1}`, { parent: link, position: [0.42, 0.04, 0], rotation: [0, 0.13, 0.02] });
  const t = i / 11;
  b.mesh(`Tail bead ${i + 1}`, {
    geometry: { kind: "sphere", params: { radius: 0.16 * (1 - t) + 0.03, widthSegments: 10, heightSegments: 8 } },
    materialId: b.material(`Tail bead ${i + 1}`, {
      color: "#bfe8ff", emissive: "#7fc4ff", emissiveIntensity: 1 - t * 0.8,
      transparent: true, opacity: 0.85 - t * 0.6, roughness: 0.5,
    }),
    parent: link,
    castShadow: false,
    receiveShadow: false,
  });
}

// --- starfield ---------------------------------------------------------------

const stars = b.group("Starfield");
const starMats = [
  b.material("Star white", { color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.6 }),
  b.material("Star blue", { color: "#bcd7ff", emissive: "#bcd7ff", emissiveIntensity: 1.3 }),
  b.material("Star warm", { color: "#ffe0b8", emissive: "#ffe0b8", emissiveIntensity: 1.1 }),
];
for (let i = 0; i < 90; i++) {
  const theta = rand() * TAU;
  const y = (rand() - 0.5) * 2;
  const r = 26 + rand() * 10;
  const xz = Math.sqrt(Math.max(0, 1 - y * y));
  b.mesh(`Star ${i + 1}`, {
    geometry: { kind: "sphere", params: { radius: 0.05 + rand() * 0.06, widthSegments: 6, heightSegments: 4 } },
    materialId: starMats[i % starMats.length],
    parent: stars,
    position: [Math.cos(theta) * xz * r, y * r * 0.6, Math.sin(theta) * xz * r],
    castShadow: false,
    receiveShadow: false,
  });
}

// --- animation ---------------------------------------------------------------

const orbitsId = b.animation("Orbits", { duration: 60, loop: true, tracks: orbitTracks });
b.playOnStart(orbitsId);

const pulse = b.animation("Sun pulse", {
  duration: 4,
  loop: true,
  tracks: [
    { targetId: sunMat, property: "opacity", keyframes: [{ t: 0, v: 1 }, { t: 2, v: 0.9, ease: "easeInOut" }, { t: 4, v: 1, ease: "easeInOut" }] },
    { targetId: headMat, property: "color", keyframes: [{ t: 0, v: "#dff3ff" }, { t: 2, v: "#ffd9f2", ease: "easeInOut" }, { t: 4, v: "#dff3ff", ease: "easeInOut" }] },
  ],
});
b.playOnStart(pulse);

b.write("orrery", {
  name: "Orrery",
  camera: { position: [0, 14, 22], target: [0, 0, 0], fov: 42 },
  environment: { background: "#05060d", preset: null, fog: null, shadows: false },
  grid: false,
});
