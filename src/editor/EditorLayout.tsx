"use client";

import { Info } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUI } from "./store/ui";
import { Toolbar } from "./panels/Toolbar";
import { Hierarchy } from "./panels/Hierarchy";
import { Inspector } from "./panels/Inspector";
import { Timeline } from "./panels/Timeline";
import { Viewport } from "./viewport/Viewport";
import { PreviewOverlay } from "./Preview";

function ToastHost() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-3.5 py-2 text-xs text-popover-foreground shadow-xl">
      <Info className="size-3.5 text-primary" />
      {toast}
    </div>
  );
}

export function EditorLayout() {
  const previewing = useUI((s) => s.previewing);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-dvh select-none grid-cols-[260px_minmax(0,1fr)_300px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
        <header className="col-span-3">
          <Toolbar />
        </header>
        <aside className="border-r bg-card">
          <Hierarchy />
        </aside>
        <main className="min-h-0 min-w-0">
          <Viewport />
        </main>
        <aside className="border-l bg-card">
          <Inspector />
        </aside>
        <footer className="col-span-3">
          <Timeline />
        </footer>
        {previewing && <PreviewOverlay />}
        <ToastHost />
      </div>
    </TooltipProvider>
  );
}
