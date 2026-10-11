# @chibi3d/runtime

Render and drive an exported [chibi](../../PRD.md) scene in any React app.
This folder is the future npm package — it has **no imports from the editor or
the Next.js app** (ESLint-enforced), so it can be extracted unchanged.

```tsx
import { useRef } from "react";
import { ChibiScene, type ChibiSceneApi } from "@chibi3d/runtime";

function Hero() {
  const api = useRef<ChibiSceneApi>(null);
  return (
    <>
      <ChibiScene
        src="/scenes/hero.chibi.zip"
        api={api}
        onEvent={(e) => console.log(e)}
        className="h-[600px]"
      />
      <button onClick={() => api.current?.transitionTo("st_hot")}>Hot</button>
      <button onClick={() => api.current?.play("an_float")}>Float</button>
    </>
  );
}
```

## `<ChibiScene>` props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `document` | `unknown` | — | Parsed scene JSON; validated (zod) on mount. Mutually exclusive with `src` (`document` wins). |
| `src` | `string` | — | URL to a `.chibi.json` or `.chibi.zip`; fetched, sniffed (zip magic bytes), validated. |
| `resolveAsset` | `(asset) => Promise<string>` | zip-bundled assets, else error | Maps an asset record (`{ id, hash, name, … }`) to a loadable URL. |
| `interactive` | `boolean` | `true` | Pointer triggers (click / hover) active; click targets get `cursor: pointer`. |
| `orbit` | `boolean` | `false` | User orbit around the scene camera. |
| `autoStart` | `boolean` | `true` | Fire `start` triggers on mount. |
| `className` / `style` | — | — | Sizing is the host's job; the canvas fills the box. |
| `fallback` | `ReactNode` | `null` | Shown while the scene file loads (unless `poster` is set). |
| `poster` | `string` | — | Image URL covering the canvas until every asset has loaded, then fades out. Export one from the editor (Export → Image). |
| `lazy` | `boolean` | `false` | Defer fetching `src` and mounting the canvas until the box is within 200px of the viewport. |
| `pauseWhenOffscreen` | `boolean` | `true` | Stop rendering while scrolled out of view; motion resumes where it left off. |
| `reducedMotion` | `boolean` | OS setting | Drop cursor-driven motion (pointer bindings, camera parallax). Omit to follow `prefers-reduced-motion`. Click/hover transitions still play. |
| `dpr` | `number \| [min, max]` | `[1, 2]` | Device pixel ratio, or a clamp range. |
| `debug` | `boolean` | `false` | Compact FPS, frame-time graph, JS memory and resolution overlay. Includes a local resolution selector. |
| `onPerformance` | `(sample: PerformanceSnapshot) => void` | — | Diagnostics every 500 ms while visible; also enables sampling without the overlay. |
| `onEvent` | `(e: RuntimeEvent) => void` | — | `{type:"ready"}` · `{type:"interaction", trigger, action}` · `{type:"stateChange", nodeId, stateId}` · `{type:"contextLost"}` / `{type:"contextRestored"}` (WebGL). |
| `onLoad` | `() => void` | — | Scene mounted and every asset (models, textures, env map, font) settled — loaded or failed. |
| `onError` | `(error: Error) => void` | — | Scene file failed to fetch, parse or validate. |
| `scrollProgress` | `number` | auto-tracked | Scroll progress in `[0, 1]` fed to `scroll` triggers and scroll bindings. Omit to auto-track this component's position against the viewport; pass a number to take over (e.g. a custom smooth-scroll lib, or an overlay with no real page scroll). |
| `api` | `Ref<ChibiSceneApi>` | — | Imperative bridge (below). |

`ChibiSceneApi`: `transitionTo(stateId, {duration?, ease?})` (`"base"` resets
every stateful object) · `play(animationId)` · `pause(animationId)` ·
`stop(animationId)` · `getState()` → `{ [nodeId]: stateId }` ·
`setPaused(bool)` · `getScrollProgress()` → current scroll progress in
`[0, 1]` (auto-tracked, or the `scrollProgress` prop) · `getPointer()` →
damped pointer progress over the canvas, `{x, y}` in `[0, 1]` per axis
(`{0.5, 0.5}` at rest/center) · `setMaterial(target, patch)` → restyle a
material at runtime (below) · `screenshot({type?, quality?, transparent?})` →
`Promise<Blob | null>` of the current frame at the canvas's pixel size
(`transparent` drops the background; `null` = not mounted).

### Performance overlay

```tsx
<ChibiScene src="/scene.chibi.zip" debug api={api} />
// Or receive the same readings without displaying an overlay:
<ChibiScene src="/scene.chibi.zip" onPerformance={handlePerformance} />
// Read the latest snapshot without subscribing:
api.current?.getPerformance();
```

The panel shows rendered FPS, frame time with a small graph, page-wide JS heap
memory when available, and actual render resolution. Its resolution selector
temporarily overrides `dpr`; choose **Host** to follow the prop again. The
override only applies while `debug` is enabled and never changes the document.

`PerformanceSnapshot` contains `fps`, `frameMs`, `memoryMB`, `width`, `height`,
`dpr`, and the graph's `history`. Readings update every 500 ms. `getPerformance()`
returns `null` before sampling or while diagnostics are disabled. Sampling is
enabled by either `debug` or `onPerformance`, and does not keep the Canvas
rendering. An idle scene correctly shows 0 FPS.

Frame time is the average interval between continuous rendered frames, excluding
idle gaps. It is not GPU time or input latency. Memory uses the optional browser
`performance.memory` reading: it covers the entire page's JS heap, not one scene
or GPU memory. Unsupported browsers show **N/A**. Hidden tabs reset sampling.

### Runtime material overrides

```tsx
api.current?.setMaterial("key:1", { color: "#f0a020" });
api.current?.setMaterial("logo:1", { map: "https://thesvg.org/icons/react/mono.svg", mapFit: "contain", mapColor: "#ffffff", opacity: 1 });
```

`target` is a material id, else every material with that name. `patch`:
`color` · `emissive` · `emissiveIntensity` · `metalness` · `roughness` ·
`opacity` · `map` (image URL — png/jpg/webp/svg — replacing the albedo map;
`null` removes it). A patch carrying a `map` URL lands as a whole once the
image has loaded, so nothing flashes untextured. Returns `false` when nothing
matches or the scene isn't mounted yet — call it from the `ready` event.
Overrides live on the mounted scene only (never written to the document), and
state/clip-driven color or opacity wins while it animates.

For square decals, pass `mapFit: "contain"` alongside `map` to center the
image with transparent padding, preserving its aspect ratio. The default
`"stretch"` uses the image's full UV range.
Pass `mapColor` alongside `map` to render a monochrome image in that color
while preserving transparency. Omitting it preserves the image's colors.

Swappable logos/labels: author a thin `plane` child on the surface with its
own transparent material at `opacity: 0`, then set `map` + `opacity: 1` from
the host (see `/demo/keycaps`).

Also exported: `loadDocument(urlOrBytes)` (zip/json loader returning
`{ doc, resolveAsset, dispose }`), `validateDocument`, `createDocument`,
`InteractionRuntime` (headless engine), and every schema type.

## Behavior notes

- **Rendering is demand-driven.** The canvas idles at zero frames; the engine
  wakes it when a transition/clip starts and it re-invalidates itself while
  motion is in flight. `jszip` is imported lazily — JSON-only consumers never
  download it.
- **`ready`** fires after the document is mounted and `start` triggers ran.
  GLBs / textures may still stream in behind their own suspense boundaries —
  use `onLoad` to know when they've all settled (it fires once per document).
- **Offscreen = zero frames.** With `pauseWhenOffscreen` (default) the
  frameloop stops once the box leaves the viewport (200px margin), so
  long pages with many scenes only render what's visible.
- **WebGL context loss** (GPU reset, too many contexts) is handled: the
  default page reload is prevented, `contextLost` / `contextRestored` events
  fire, and three.js re-uploads resources on restore.
- **Multiple instances** on one page are independent — each owns its engine
  instance. (GLB parsing is cached per-URL across instances by drei's
  `useGLTF`, which is shared immutable data, not state.)
- **Text3D nodes** need the font file served by the host at
  `/fonts/helvetiker_regular.typeface.json` (see `react/Geometry.tsx`).
- **Scroll tracking is opt-in.** The auto-tracking `scroll`/`resize` listener
  only attaches when the document actually declares scroll features
  (`docUsesScroll(doc)`: a `scroll` trigger or a non-empty `scrollBindings`)
  *and* no explicit `scrollProgress` prop is passed — plain scenes never pay
  for a listener, preserving the demand-frameloop guarantee above.
- **Pointer tracking is opt-in** the same way: `pointermove`/`pointerleave`
  listeners attach to the canvas only when the document declares pointer
  features (`docUsesPointer(doc)`: a non-empty `pointerBindings`, or
  `camera.parallax > 0`). Pointer position is canvas-local and damped in the
  engine; on pointer leave everything eases back to the centered rest pose.
  There is no controlled prop — auto-tracking always works.
- Scene format reference: [PRD §3.1](../../PRD.md). Documents are validated
  with zod; legacy (≤ M5) documents are migrated in-place by
  `schema/migrate.ts`.

## Publishing

This is a real workspace package (`packages/runtime`), not just a folder of
source — it has its own `package.json`, `tsconfig.json`, and `tsup.config.ts`.
The editor/app still consume it at source level via the `@/runtime/*`
tsconfig path alias, so no build is needed for local dev; building is only
required to cut an npm release:

```sh
npm --prefix packages/runtime run build # emits dist/ (esm + cjs + d.ts)
cd packages/runtime && npm publish      # publishConfig.access is already "public"
```

Public surface: `index.ts` (curated) plus the editor-facing subpaths
`./schema`, `./engine`, `./react/Geometry`, `./react/SceneHost` — everything
else under `src/` is internal. `vitest run` (root) covers
`packages/runtime/src` with no editor code on the module graph, which is the
self-containment proof.

### Host animation and input (0.4.0)

Use node ids from your document to drive a scene from GSAP or another host
animation library. Transform setters copy arrays, never mutate the document,
and request a frame automatically:

```ts
api.current?.setNodeTransform(nodeId, { position: [x, y, z] });
api.current?.setNodeVisible(nodeId, true);
api.current?.transitionNodeTo(nodeId, pressedStateId, { duration: 0.1 });
api.current?.transitionNodeTo(nodeId, "base", { duration: 0.1 });
api.current?.clearNodeOverrides(nodeId);
```

Host transform/visibility overrides win over animation samples until cleared.
Clearing restores the latest engine value or document base. Unknown node ids
and calls before mount return false for setters. Use separate parent groups
when host motion and document states need to compose. `transitionTo("base")`
still resets all stateful nodes; `transitionNodeTo(id, "base")` resets one.

Pass a stable `pointerTargets` array and `onPointerEvent` callback to receive
`hoverEnter`, `hoverExit`, `pointerDown`, `pointerUp`, `pointerCancel`, and `click`.
Events contain `nodeId`, `pointerId`, and `pointerType`; synthesized hover exits
use pointer id -1. Targets don't need document-authored actions. Pointer release
outside the canvas, window blur, and hidden tabs are handled. Physical keyboard
input and sound remain the host application's responsibility.

`transparent` composites over the host page. `onError` also reports model and
texture failures caught by local asset boundaries; `onLoad` means assets have
settled, so consumers should retain any failure state when it fires.

Use `<ChibiScene orthographic ... />` for parallel projection. Position the
scene camera at equal x/y/z distances from its target for an isometric view.
Framing matches the perspective camera at the target using its distance and
`fov`, and stays consistent on resize. The default remains perspective. This
host option does not change the exported document format. Changing the option
remounts the canvas and resets its runtime state.

Pass `environment={renderEnvironment}` to adjust rendering quality without
replacing `document`. This optional prop takes a complete environment object,
usually `{ ...doc.environment, ao: false, shadows: false }`. It controls the
background, fog, environment lighting, shadows, exposure, tone mapping, and
postprocessing. Omitting it uses the document environment. Keep `document`,
`resolveAsset`, and `pointerTargets` stable to preserve engine state, host node
overrides, and loaded geometry while quality changes. The prop is a host
rendering override, not a scene-format change; quality changes do not fire a
new scene `onLoad` event. Both props are available in runtime 0.5.0.
