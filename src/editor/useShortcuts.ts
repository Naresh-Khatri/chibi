"use client";

import { useEffect } from "react";
import { useDoc } from "./store/document";
import { useUI } from "./store/ui";
import { duplicateNode, groupNode, removeNode } from "./store/commands";
import { frameSelected } from "./viewport/frame";

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();

      // preview swallows all editor shortcuts; Esc exits
      if (ui.previewing) {
        if (key === "escape") ui.setPreviewing(false);
        return;
      }

      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) useDoc.getState().redo();
        else useDoc.getState().undo();
        return;
      }
      if (meta && key === "d") {
        e.preventDefault();
        if (ui.selectedId) duplicateNode(ui.selectedId);
        return;
      }
      if (meta && key === "g") {
        e.preventDefault();
        if (ui.selectedId) groupNode(ui.selectedId);
        return;
      }
      if (meta || e.altKey) return;

      switch (key) {
        case " ":
          // play/pause when the timeline is open (prevent scroll + button focus clicks)
          if (ui.timelineOpen && ui.activeClipId) {
            e.preventDefault();
            ui.togglePlay();
          }
          break;
        case "t":
          if (e.shiftKey) ui.toggleTimeline();
          break;
        case "v":
          ui.setTool("select");
          break;
        case "w":
          ui.setTool("move");
          break;
        case "e":
          ui.setTool("rotate");
          break;
        case "r":
          ui.setTool("scale");
          break;
        case "f":
          frameSelected();
          break;
        case "escape":
          ui.select(null);
          break;
        case "delete":
        case "backspace":
          if (ui.selectedId) removeNode(ui.selectedId);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
