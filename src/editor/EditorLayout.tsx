"use client";

import { Info, PanelLeft, PanelRight } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
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

function FloatingPanel({
  side,
  open,
  onToggle,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="icon-xs"
        title={side === "left" ? "Show hierarchy" : "Show inspector"}
        onClick={onToggle}
        className={`absolute top-3 z-20 shadow-lg ${side === "left" ? "left-3" : "right-3"}`}
      >
        {side === "left" ? <PanelLeft /> : <PanelRight />}
      </Button>
    );
  }
  return (
    <div
      className={`absolute inset-y-3 z-20 flex w-64 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <button
        type="button"
        title="Collapse"
        onClick={onToggle}
        className="absolute right-2 top-2 z-10 text-muted-foreground hover:text-foreground"
      >
        {side === "left" ? (
          <PanelLeft className="size-3.5" />
        ) : (
          <PanelRight className="size-3.5" />
        )}
      </button>
      {children}
    </div>
  );
}

export function EditorLayout() {
  const previewing = useUI((s) => s.previewing);
  const hierarchyOpen = useUI((s) => s.hierarchyOpen);
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const toggleHierarchy = useUI((s) => s.toggleHierarchy);
  const toggleInspector = useUI((s) => s.toggleInspector);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid h-dvh select-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
        <header>
          <Toolbar />
        </header>
        <main className="relative min-h-0 min-w-0">
          <Viewport />
          <FloatingPanel side="left" open={hierarchyOpen} onToggle={toggleHierarchy}>
            <Hierarchy />
          </FloatingPanel>
          <FloatingPanel side="right" open={inspectorOpen} onToggle={toggleInspector}>
            <Inspector />
          </FloatingPanel>
        </main>
        <footer>
          <Timeline />
        </footer>
        {previewing && <PreviewOverlay />}
        <ToastHost />
      </div>
    </TooltipProvider>
  );
}
