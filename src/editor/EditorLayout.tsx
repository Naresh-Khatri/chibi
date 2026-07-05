"use client";

import { Toolbar } from "./panels/Toolbar";
import { Hierarchy } from "./panels/Hierarchy";
import { Inspector } from "./panels/Inspector";
import { Timeline } from "./panels/Timeline";
import { Viewport } from "./viewport/Viewport";

export function EditorLayout() {
  return (
    <div className="grid h-dvh select-none grid-cols-[260px_minmax(0,1fr)_300px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-bg text-ink">
      <header className="col-span-3">
        <Toolbar />
      </header>
      <aside className="border-r border-edge bg-panel">
        <Hierarchy />
      </aside>
      <main className="min-h-0 min-w-0">
        <Viewport />
      </main>
      <aside className="border-l border-edge bg-panel">
        <Inspector />
      </aside>
      <footer className="col-span-3">
        <Timeline />
      </footer>
    </div>
  );
}
