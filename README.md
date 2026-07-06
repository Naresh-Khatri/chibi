# chibi

Web-native 3D design tool (Spline alternative): designers build interactive 3D
scenes in a browser editor; developers consume them via a `<ChibiScene>` React
component backed by an open JSON scene format. Prototype stage — local-only
persistence (IndexedDB), no auth, no backend.

**Read first:** [`PRD.md`](./PRD.md) (product + domain model + scene format)
and [`specs/00-overview.md`](./specs/00-overview.md) (roadmap + conventions).
`AGENTS.md` is the canonical guide for working in this repo (architecture,
hard rules, workflow) — read it before making changes.

## Getting started

```bash
pnpm install
pnpm dev
```

- `/` — landing page
- `/editor/[docId]` — the 3D scene editor
- `/demo` — a runtime consumer page showing `<ChibiScene>` in use
- `/components` — shadcn/ui component showcase

## Commands

- Typecheck: `pnpm tsc --noEmit`
- Lint: `pnpm lint`
- Unit tests: `pnpm test` (vitest)
- Package manager is **pnpm**.

## Layout

- `src/app/` — Next.js routes (landing, editor, demo, components showcase).
- `src/editor/` — the editor: zustand stores (`store/`), R3F viewport
  (`viewport/`), panels (`panels/`).
- `packages/runtime/` — `@chibi3d/runtime`, the publishable npm package
  (`<ChibiScene>`, engine, schema) consumed by the editor at source level; see
  [`packages/runtime/README.md`](./packages/runtime/README.md).

## Using scenes outside this repo

```tsx
import { useRef } from "react";
import { ChibiScene, type ChibiSceneApi } from "@chibi3d/runtime";

function Hero() {
  const api = useRef<ChibiSceneApi>(null);
  return <ChibiScene src="/scenes/hero.chibi.zip" api={api} className="h-[600px]" />;
}
```

See [`packages/runtime/README.md`](./packages/runtime/README.md) for the full
API and behavior notes.
