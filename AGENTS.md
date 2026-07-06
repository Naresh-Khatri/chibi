# chibi

Web-native 3D design tool (Spline alternative): designers build interactive 3D scenes in a browser editor; developers consume them via a `<ChibiScene>` React component backed by an open JSON scene format. Prototype: local-only persistence (IndexedDB), no auth, no backend.

**Read first:** `PRD.md` (product + domain model + scene format) and `specs/00-overview.md` (roadmap + conventions). Each `specs/NN-*.md` file is one milestone with acceptance criteria — the spec for the milestone you're working on is the source of truth for that work.

## Status

<!-- Update this section whenever a milestone lands or work moves to a new spec. Trust the spec checklists and git log over this summary if they disagree. -->
- M0–M3 implemented (shell, core editing, materials & lighting, assets & files).
- M4 (keyframe animation) implemented — engine in `packages/runtime/src/engine/`, dope-sheet timeline, playback; manual browser checklist in `specs/05-animation.md` still to be verified by hand.
- M5 (states & interactions) implemented — states are **per-object** (`ObjectState.nodeId`; revised from the original scene-level design, legacy docs migrate via `schema/migrate.ts`), override recording via active state, per-node transition/interaction engine, Preview mode mounting `packages/runtime/src/react/SceneHost.tsx`; see "Implementation notes" in `specs/06-states-interactions.md`. Manual browser checklist still to be verified by hand.
- M6 (runtime) implemented — public API in `packages/runtime/src/index.ts`, `<ChibiScene>` (`packages/runtime/src/react/ChibiScene.tsx`) with `api` ref/`onEvent`/demand frameloop, `loadDocument` zip/json loader, `/demo` consumer page, `packages/runtime/README.md`; see "Implementation notes" in `specs/07-runtime.md`. `/demo` falls back to hand-authored `public/scenes/hero.chibi.json` until a real editor export is dropped at `public/scenes/hero.chibi.zip`. Manual browser checklist still to be verified by hand.
- Runtime extracted to the `packages/runtime` workspace package (real `package.json`/`tsup` build, publishable as `@chibi3d/runtime`). The editor/app still import it at source level via the `@/runtime/*` tsconfig path alias (→ `packages/runtime/src/*`), so no build step is needed for local dev — only for cutting an npm release.

## Commands

- Typecheck: `pnpm tsc --noEmit`
- Lint: `pnpm lint`
- Unit tests: `pnpm vitest run` (schema round-trip test lands in M3)
- Package manager is **pnpm**.
- **Never** run `pnpm dev` or `pnpm build` — the user runs the dev server and builds themselves. Verify with typecheck + lint + tests; ask the user for in-browser checks.

## Architecture

- Stack: Next.js 16 (App Router) · React 19 · Tailwind 4 · three.js (WebGL only — no WebGPU/TSL) · @react-three/fiber v9 · drei · zustand · immer · zod · shadcn/ui (`src/components/ui/`, radix-nova preset) · lucide-react icons.
- UI conventions: shadcn semantic color tokens only (`background/card/muted/border/foreground/muted-foreground/primary`), defined dark-only on `:root`; icons from lucide-react, never emojis or text glyphs; shared dense controls live in `src/editor/panels/controls.tsx` (see "UI kit" in `specs/00-overview.md`).
- `src/app/` — routes: `/` landing, `/editor/[docId]` editor, `/demo` runtime consumer (M6).
- `src/editor/store/` — zustand stores. `document.ts` holds the document + undo/redo; `commands.ts` / `materialCommands.ts` are the mutation API; `ui.ts` is editor-only state; `persistence.ts` is IndexedDB autosave.
- `src/editor/viewport/` — R3F canvas, `NodeRenderer`, gizmos, selection.
- `src/editor/panels/` — toolbar, hierarchy, inspector, timeline.
- `packages/runtime/` — the `@chibi3d/runtime` npm package (own `package.json`/`tsup.config.ts`): zod schema, engine (animation/states/interactions), `<ChibiScene>`. Consumed by the editor at source level through the `@/runtime/*` alias; build with `pnpm --filter @chibi3d/runtime build`, publish from that directory.

## Hard rules

- **Single write path:** every document mutation goes through `useDoc.getState().dispatch(label, recipe, opts)` — commands run in immer `produceWithPatches`; inverse patches feed the undo stack. Panels never write to the document store directly. Add new mutations as exported functions in `src/editor/store/commands.ts` (or a sibling `*Commands.ts`), following the existing style.
- **Continuous gestures** (gizmo drags, slider scrubs) coalesce into one undo entry via `DispatchOpts.mergeKey` (300 ms merge window) — pass a stable mergeKey for scrub-style inputs.
- **Import boundary:** `packages/runtime/src/**` must never import from `src/editor/**` or `src/app/**` (ESLint-enforced). Editor may import from runtime, never the reverse.
- **UI state vs document state:** selection, active tool, active state, playhead → `ui.ts` store (not undoable, not persisted in the document). Anything that should survive export/import → the document.
- **Document format:** normalized flat id-keyed maps, tree via `children` id arrays. Ids are prefixed nanoid(8) via `newId(prefix)`: `nd_` node, `mt_` material, `as_` asset, `an_` animation, `st_` state, `ix_` interaction, `doc_` document.
- **Units:** radians + hex colors + plain `[x,y,z]` arrays in the document; degrees in the UI. No quaternions in the file format.
- New dependencies only if a spec names them. No postprocessing packages.

## Workflow

- Work milestone by milestone in spec order (M2/M3 may swap; otherwise strict). A milestone is done when every acceptance criterion in its spec passes.
- Per-milestone verification: `pnpm tsc --noEmit` and `pnpm lint` clean, plus the spec's manual browser checklist (the user runs the dev server for that).
- When a decision changes the plan or the format, record it in the relevant spec (or PRD open questions), not just in conversation — future sessions start from these files.
