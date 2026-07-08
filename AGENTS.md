# chibi

Web-native 3D design tool (Spline alternative): designers build interactive 3D scenes in a browser editor; developers consume them via a `<ChibiScene>` React component backed by an open JSON scene format. Prototype: local-only persistence (IndexedDB), no auth, no backend.

**Read first:** `PRD.md` (product + domain model + scene format) and `specs/00-overview.md` (roadmap + conventions). Each `specs/NN-*.md` file is one milestone with acceptance criteria — the spec for the milestone you're working on is the source of truth for that work.

## Design philosophy

chibi is early but built to grow — features will keep landing for a long time, and no future one should be boxed in by a shortcut or wrong assumption made now. A few principles keep the codebase reshapeable:

- **Evolvability comes from sharp seams, not from guessing the future.** Don't pre-build flexibility for features that don't exist yet — speculative abstraction is itself a wrong assumption, and it ages worse than the problem it was meant to solve. Instead keep the seams this repo already has clean: the single write path, the runtime↔editor import boundary, the UI-state vs document split, normalized id-keyed maps. Well-bounded code with honest names is cheap to reshape; favor code that's easy to *delete* over code that's "configurable."
- **The scene format is the load-bearing contract — change it deliberately.** It's consumed by the editor, the published `<ChibiScene>` runtime, and third-party developers, and it persists (IndexedDB) and exports. So it's the most expensive thing to change: every existing document must keep opening via `schema/migrate.ts`. Format/schema changes are never a casual add — they're versioned, migrated, and worth raising first. (The scene-level → per-object states revision is the model: a core assumption changed cleanly *because* it went through migration, not despite it.)
- **Refactor-first over monkeypatch.** When a feature would be better served by reshaping existing code than by bolting onto a shape that no longer fits, stop and say so — name the refactor, why it's warranted, and rough scope/risk — and let me choose *before* the workaround gets written. Paying for the right foundation now beats compounding interest on a shaky one.
- **Small hacks are fine; substantial ones are a conversation.** A localized, low-cost shortcut that doesn't spread or lock anything in is fine — just flag it in the code/PR. But anything touching the scene format, a store/command boundary, the runtime import boundary, cross-cutting architecture, or anything hard to reverse → raise it first. When you can't tell which side of the line it's on, ask: the cost of asking is a sentence, the cost of an entrenched wrong guess is a rewrite.
- **Write the decision down.** When we settle on a refactor or a deliberate shortcut, record it in the relevant spec (or PRD open questions) per the Workflow rule below — future sessions start from the files, not this chat.

## Status

<!-- Update this section whenever a milestone lands or work moves to a new spec. Trust the spec checklists and git log over this summary if they disagree. -->
- M0–M3 implemented (shell, core editing, materials & lighting, assets & files).
- M4 (keyframe animation) implemented — engine in `packages/runtime/src/engine/`, dope-sheet timeline, playback; manual browser checklist in `specs/05-animation.md` still to be verified by hand.
- M5 (states & interactions) implemented — states are **per-object** (`ObjectState.nodeId`; revised from the original scene-level design, legacy docs migrate via `schema/migrate.ts`), override recording via active state, per-node transition/interaction engine, Preview mode mounting `packages/runtime/src/react/SceneHost.tsx`; see "Implementation notes" in `specs/06-states-interactions.md`. Manual browser checklist still to be verified by hand.
- M6 (runtime) implemented — public API in `packages/runtime/src/index.ts`, `<ChibiScene>` (`packages/runtime/src/react/ChibiScene.tsx`) with `api` ref/`onEvent`/demand frameloop, `loadDocument` zip/json loader, `/demo` consumer page, `packages/runtime/README.md`; see "Implementation notes" in `specs/07-runtime.md`. `/demo` falls back to hand-authored `public/scenes/hero.chibi.json` until a real editor export is dropped at `public/scenes/hero.chibi.zip`. Manual browser checklist still to be verified by hand.
- M7 (AI copilot) implemented — **Mistral via Vercel AI SDK** (`ai` + `@ai-sdk/mistral`), not Anthropic (decision recorded in `specs/08-ai-copilot.md` "Implementation notes"). BYO key in localStorage, agentic editing through tool wrappers over the command layer (`src/editor/ai/`), chat panel `src/editor/panels/AiChat.tsx`, `AI:`-labeled undo entries with per-turn Revert. Manual browser checklist still to be verified by hand.
- M8 (prompt-to-scene generation) implemented — single-shot document generation pipeline in `src/editor/ai/generate.ts` (JSON via Mistral prefix prefill → id remap through `newId` → `validateDocument` → budget checks, 2 retries feeding zod errors back), generation scaffold + few-shot in `src/editor/ai/prompts.ts`, landing-page prompt input in `src/app/page.tsx`, chat-path wrapper-group nudge in `SYSTEM_PROMPT`; see "Implementation notes" in `specs/09-ai-scene-generation.md`. Manual browser checklist (live generations) still to be verified by hand.
- Post-M8 "clay look" upgrade: capsule primitive + `fillet` param on cylinder/cone (lathe-based edge rounding), `MeshPhysicalMaterial` with clearcoat/sheen fields, environment `exposure`/`softShadows` (PCF filtering)/`contactShadows` and the built-in `"soft"` studio preset (Lightformer rig, offline-safe) — shared components in `packages/runtime/src/react/EnvironmentExtras.tsx`; showcase scene `public/scenes/park.chibi.json` (File → Open); decisions recorded in specs 02/03 implementation notes.
- Post-M8 "Spline look" upgrade: doc-driven postprocessing (`environment.ao` via N8AO, `bloom`, `vignette`; composer in `packages/runtime/src/react/PostFx.tsx`), `environment.toneMapping` (`aces`/`neutral`/`agx`) and `environment.backgroundGradient` (screen-space radial gradient background). Postprocessing-package ban lifted for `@react-three/postprocessing`; decision + composer subtleties in specs/03 implementation notes. New docs default to `neutral` + AO on; legacy docs keep their old look via zod defaults.
- Post-M8 "split models": GLB model nodes can be split into individually editable objects (Inspector → Split into objects). `ModelNode.path` addresses one internal mesh by child-index path; `splitModelNode` (`src/editor/store/commands.ts`) mirrors the GLB scene graph as real chibi nodes; part rendering via `packages/runtime/src/react/GlbPart.tsx`. Parts also take an optional `materialId` override (chibi material replaces the embedded GLB material; states/animation work as for meshes). Implementation notes in `docs/specs/04-assets-files.md`.
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
- New dependencies only if a spec names them. Postprocessing is limited to the doc-driven chain in `packages/runtime/src/react/PostFx.tsx` (`@react-three/postprocessing`, named in specs/03) — don't add further effects without a spec.

## Workflow

- Work milestone by milestone in spec order (M2/M3 may swap; otherwise strict). A milestone is done when every acceptance criterion in its spec passes.
- Per-milestone verification: `pnpm tsc --noEmit` and `pnpm lint` clean, plus the spec's manual browser checklist (the user runs the dev server for that).
- When a decision changes the plan or the format, record it in the relevant spec (or PRD open questions), not just in conversation — future sessions start from these files.
