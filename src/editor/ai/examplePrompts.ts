// Landing-page example prompts (M8). Each body is written to carry a
// low-medium LLM to a good-looking clay scene on its own: an explicit prop
// inventory with primitive hints, a pinned hex palette, layout and camera
// notes. The generation scaffold (prompts.ts) supplies the schema and the
// house style; these add the art direction.

export type ExamplePrompt = {
  title: string;
  prompt: string;
};

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    title: "Cozy kitchen set",
    prompt: `A cozy toy kitchen laid out like a designer's prop collection on a bare warm-sand void (no floor, no walls). Back row: a terracotta kitchen counter — one rounded box body with a cream slab top, drawer fronts and door fronts as thin inset rounded boxes, tiny mustard knobs (small spheres). Right: a chunky mustard dining table with thick rounded legs and one terracotta chair with a simple ladder back. Front row, loosely scattered: a wooden crate holding 4-5 orange spheres, a blush-pink plant pot with 3 green capsule leaves fanned out, a small woven bowl of green lime spheres, a dark charcoal frying pan (squashed cylinder + handle) with a fried egg inside (white squashed sphere + yellow half-sphere yolk), and a green box basket of carrots (orange cones lying at angles with green tips). Palette: terracotta #cd7a52, burnt orange #d98a5f, cream #f0e6d2, mustard #e8ab4f, leaf green #71b344, fruit orange #ff9e2c, blush pink #dc9282, charcoal #4d4a48. Background sand #e8d5ba, soft shadows, high 3/4 camera looking down at the whole set.`,
  },
  {
    title: "Toy street corner",
    prompt: `A collection of cute city-street props arranged loosely on a bare warm-beige void (no floor). Star of the set, center-back: a chunky steel-blue traffic light — thick curved pole (cylinders), rounded pedestal base, a rounded box head holding three glowing lamps (emissive red, amber, green spheres). Around it: a bright red pillar post box sitting on a flat green grass blob (squashed cylinder), a wooden park bench with rounded grey metal armrests, a tall saguaro cactus (green capsules, two arms) rising from a ring of pebble stones, a green vintage street lamp with a glowing warm-white globe, a lavender-grey trash can with a lid, one orange traffic cone with a cream stripe, and a small blue signpost with two white arrow signs (thin rounded boxes) pointing different ways. A few flat stone patches (very squashed grey-tan cylinders) under some props. Palette: steel blue #8fa3b8, red #e04b3c, wood #d98a4f, cactus green #6fbf5a, grass #8ed058, cone orange #f07c30, lavender grey #9aa0b8, cream #f2ead9. Background beige #e9d9c2, bloom on for the glowing lamps, high 3/4 toy-diorama camera.`,
  },
  {
    title: "Pink artist studio",
    prompt: `An isometric cutaway artist studio, everything bathed in pink. Build the room as a thick rounded pink floor slab plus two pink back walls (rounded boxes) forming an open corner; camera looks into the corner from a high 3/4 angle. Against the right wall: a light-wood desk with thick legs, holding a pink drawing tablet propped at an angle (thin rounded box), a small yellow lamp (cone shade on a short post), and a tiny framed photo. On the wall above the desk: a big app-window poster made of 2-3 layered flat rounded boxes in deep blue #3f6cb5 with small cream detail blocks. Left: a pink easel (thin angled posts) holding a little landscape painting — a cream canvas with a green hill, blue mountain and yellow field as flat rounded shapes. Center: a round mustard rug (very squashed cylinder) with a pink stool on it. Corner: a terracotta-pink pot with tall green capsule leaves. A couple of small empty picture frames on the walls. Palette: wall pink #e8919f, light pink #f2b6bf, hot pink #e06a80, mustard #eebc55, wood #e3b678, blue #3f6cb5, leaf green #5faf4a, cream #f5ecdd. Background matches the walls (#e8a3ae), soft dreamy lighting.`,
  },
  {
    title: "Desert dusk camp",
    prompt: `A tiny desert campsite diorama at dusk, built on a thick rounded sand plinth — one squat wide cylinder with a big fillet, sand color #eccf96, everything else resting on top of it. On the plinth: a tall saguaro cactus (green capsule body + two smaller capsule arms) near the back, a round barrel cactus (squashed green sphere) in a terracotta pot, a little orange tent (a wide rounded box base with a cone or angled rounded box roof), and a campfire — 3 stubby brown log cylinders crossed at angles around a glowing amber flame (emissive cone, emissiveIntensity 3). Scatter 4-5 smooth pebbles (squashed grey and tan spheres) between them. One small pale moon sphere floating high behind the scene, slightly emissive. Palette: sand #eccf96, cactus green #6db85c, terracotta #cd7a52, log brown #8a5a3c, flame #ffb347, tent orange #f0824f, pebble grey #b8aca0, moon cream #f5ecd9. Dusky pink background #e9c0ac fading darker at the edges, bloom on so the fire glows, warm low key light like a sunset, high 3/4 camera framing the whole plinth.`,
  },
];
