# @chibi/runtime

Render and drive an exported [chibi](../../PRD.md) scene in any React app.
This folder is the future npm package — it has **no imports from the editor or
the Next.js app** (ESLint-enforced), so it can be extracted unchanged.

```tsx
import { useRef } from "react";
import { ChibiScene, type ChibiSceneApi } from "@chibi/runtime";

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
| `api` | `Ref<ChibiSceneApi>` | — | Imperative bridge (below). |

`ChibiSceneApi`: `transitionTo(stateId, {duration?, ease?})` (`"base"` resets
every stateful object) · `play(animationId)` · `pause(animationId)` ·
`stop(animationId)` · `getState()` → `{ [nodeId]: stateId }` ·
`setPaused(bool)`.

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
- Scene format reference: [PRD §3.1](../../PRD.md). Documents are validated
  with zod; legacy (≤ M5) documents are migrated in-place by
  `schema/migrate.ts`.

## Extraction to an npm package

Not done in the prototype, but the folder is ready:

1. `package.json` with peer deps `react`, `react-dom`, `three`,
   `@react-three/fiber` (direct deps: `@react-three/drei`, `zod`, `nanoid`,
   `jszip` as an optional lazy import).
2. Build with tsup (`ChibiScene` and friends are `"use client"` modules;
   preserve the directive).
3. Entry point is `index.ts` — everything else is internal.
4. `vitest run src/runtime` already passes with no editor code on the module
   graph, which is the self-containment proof.
