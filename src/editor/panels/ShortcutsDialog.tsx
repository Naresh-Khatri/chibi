"use client";

import { useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUI } from "../store/ui";

// "Mod" renders as ⌘ on mac, Ctrl elsewhere; keep in sync with useShortcuts
const SHORTCUTS: { group: string; items: [keys: string, label: string][] }[] = [
  {
    group: "General",
    items: [
      ["Mod+Z", "Undo"],
      ["Shift+Mod+Z", "Redo"],
      ["?", "Keyboard shortcuts"],
    ],
  },
  {
    group: "Objects",
    items: [
      ["Mod+A", "Select all"],
      ["Esc", "Deselect"],
      ["Mod+C", "Copy"],
      ["Mod+X", "Cut"],
      ["Mod+V", "Paste (works across scenes)"],
      ["Mod+D", "Duplicate"],
      ["Mod+G", "Group"],
      ["Del", "Delete"],
      ["H", "Hide / show"],
      ["F", "Frame selection"],
    ],
  },
  {
    group: "Move",
    items: [
      ["← →", "Nudge X by 0.1"],
      ["↑ ↓", "Nudge Y by 0.1"],
      ["Alt+↑ ↓", "Nudge Z by 0.1"],
      ["Shift+arrows", "Nudge by 1"],
    ],
  },
  {
    group: "Tools",
    items: [
      ["V", "Select"],
      ["W", "Move"],
      ["E", "Rotate"],
      ["R", "Scale"],
    ],
  },
  {
    group: "Timeline",
    items: [
      ["Shift+T", "Toggle timeline"],
      ["Space", "Play / pause"],
    ],
  },
  {
    group: "Mesh edit",
    items: [
      ["1 / 2 / 3", "Vertex / edge / face"],
      ["C", "Loop cut"],
      ["Del", "Delete faces"],
      ["Esc", "Exit"],
    ],
  },
];

const noop = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noop,
    () => /mac|iphone|ipad/i.test(navigator.userAgent),
    () => true,
  );
}

function Keys({ keys, mac }: { keys: string; mac: boolean }) {
  const parts = keys
    .replace(/Mod/g, mac ? "⌘" : "Ctrl")
    .replace(/Alt/g, mac ? "⌥" : "Alt")
    .split("+");
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="min-w-5 rounded border bg-muted px-1 py-0.5 text-center font-mono text-[10px] text-foreground"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  const mac = useIsMac();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Ignored while typing in a field.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] grid-cols-1 gap-x-6 gap-y-4 overflow-y-auto p-4 sm:grid-cols-2">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </span>
              {items.map(([keys, label]) => (
                <div
                  key={keys + label}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span>{label}</span>
                  <Keys keys={keys} mac={mac} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
