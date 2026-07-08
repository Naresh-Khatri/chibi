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
| `fallback` | `ReactNode` | `null` | Shown while the scene file loads. |
| `onEvent` | `(e: RuntimeEvent) => void` | — | `{type:"ready"}` · `{type:"interaction", trigger, action}` · `{type:"stateChange", nodeId, stateId}`. |
| `scrollProgress` | `number` | auto-tracked | Scroll progress in `[0, 1]` fed to `scroll` triggers and scroll bindings. Omit to auto-track this component's position against the viewport; pass a number to take over (e.g. a custom smooth-scroll lib, or an overlay with no real page scroll). |
| `api` | `Ref<ChibiSceneApi>` | — | Imperative bridge (below). |

`ChibiSceneApi`: `transitionTo(stateId, {duration?, ease?})` (`"base"` resets
every stateful object) · `play(animationId)` · `pause(animationId)` ·
`stop(animationId)` · `getState()` → `{ [nodeId]: stateId }` ·
`setPaused(bool)` · `getScrollProgress()` → current scroll progress in
`[0, 1]` (auto-tracked, or the `scrollProgress` prop).

Also exported: `loadDocument(urlOrBytes)` (zip/json loader returning
`{ doc, resolveAsset, dispose }`), `validateDocument`, `createDocument`,
`InteractionRuntime` (headless engine), and every schema type.

## Behavior notes

- **Rendering is demand-driven.** The canvas idles at zero frames; the engine
  wakes it when a transition/clip starts and it re-invalidates itself while
  motion is in flight. `jszip` is imported lazily — JSON-only consumers never
  download it.
- **`ready`** fires after the document is mounted and `start` triggers ran.
  GLBs / textures may still stream in behind their own suspense boundaries.
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
pnpm --filter @chibi3d/runtime build     # emits dist/ (esm + cjs + d.ts)
cd packages/runtime && npm publish      # publishConfig.access is already "public"
```

Public surface: `index.ts` (curated) plus the editor-facing subpaths
`./schema`, `./engine`, `./react/Geometry`, `./react/SceneHost` — everything
else under `src/` is internal. `vitest run` (root) covers
`packages/runtime/src` with no editor code on the module graph, which is the
self-containment proof.
