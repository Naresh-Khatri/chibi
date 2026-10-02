"use client";

import { useEffect } from "react";
import { useDoc } from "./store/document";
import { useUI } from "./store/ui";
import {
  duplicateNodes,
  groupNodes,
  nudgeNodes,
  removeNodes,
  setNodesVisible,
} from "./store/commands";
import { copySelection, cutSelection, pasteFromText } from "./store/clipboard";
import { deleteSelectedFaces } from "./store/meshCommands";
import { frameSelected } from "./viewport/frame";

const NUDGE_STEP = 0.1;
const NUDGE_STEP_LARGE = 1;

// widgets that own their arrow keys (sliders, menus, selects)
const ARROW_OWNERS = '[role="slider"],[role="menu"],[role="menuitem"],[role="listbox"],[role="option"],[role="radiogroup"],[role="tablist"],select';

// text fields + open dialogs/popovers keep their keys (Delete in Export ≠ delete nodes)
function ownsKeys(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable ||
        el.closest?.('[role="dialog"]')),
  );
}

// clipboard events: page text selection / fields keep native behavior
function clipboardBlocked(e: ClipboardEvent): boolean {
  const ui = useUI.getState();
  return (
    ownsKeys(e.target) ||
    Boolean(window.getSelection()?.toString()) ||
    ui.previewing ||
    Boolean(ui.meshEditNodeId)
  );
}

export function useShortcuts() {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (clipboardBlocked(e)) return;
      const text = e.type === "cut" ? cutSelection() : copySelection();
      if (!text) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", text);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (clipboardBlocked(e)) return;
      if (pasteFromText(e.clipboardData?.getData("text/plain")).length > 0) {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (ownsKeys(target)) return;
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
        if (ui.selectedIds.length > 0) duplicateNodes(ui.selectedIds);
        return;
      }
      if (meta && key === "g") {
        e.preventDefault();
        if (ui.selectedIds.length > 0) groupNodes(ui.selectedIds);
        return;
      }
      if (meta && key === "a") {
        if (ui.meshEditNodeId) return;
        e.preventDefault();
        const root = useDoc.getState().doc?.root ?? [];
        if (root.length > 0) ui.selectMany(root);
        return;
      }
      if (e.key === "?") {
        ui.setShortcutsOpen(true);
        return;
      }

      const arrow = e.key.startsWith("Arrow") ? e.key.slice(5) : null;
      if (arrow && !meta && !ui.meshEditNodeId && ui.selectedIds.length > 0) {
        if (e.defaultPrevented || target?.closest(ARROW_OWNERS)) return;
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        // alt+up/down = depth; up pushes away from default camera (-z)
        if (arrow === "Left" || arrow === "Right") {
          nudgeNodes(ui.selectedIds, 0, arrow === "Right" ? step : -step);
        } else if (e.altKey) {
          nudgeNodes(ui.selectedIds, 2, arrow === "Down" ? step : -step);
        } else {
          nudgeNodes(ui.selectedIds, 1, arrow === "Up" ? step : -step);
        }
        return;
      }
      if (meta || e.altKey) return;

      // mesh-edit sub-mode takes priority over node-level shortcuts, but
      // w/e/r/v/f fall through unchanged — the mesh-edit gizmo reuses ui.tool.
      if (ui.meshEditNodeId) {
        switch (key) {
          case "escape":
            // cut tool active -> Esc cancels the cut first, not the whole edit
            if (ui.meshCutActive) ui.setMeshCutActive(false);
            else ui.exitMeshEdit();
            return;
          case "c":
            ui.setMeshCutActive(!ui.meshCutActive);
            return;
          case "1":
            ui.setElementMode("vertex");
            return;
          case "2":
            ui.setElementMode("edge");
            return;
          case "3":
            ui.setElementMode("face");
            return;
          case "delete":
          case "backspace":
            // face-mode delete only — other modes/element counts stay a no-op
            // rather than falling through to node deletion in edit mode
            if (ui.elementMode === "face" && ui.meshSelection.faces.size > 0) {
              deleteSelectedFaces(ui.meshEditNodeId);
            }
            return;
        }
      }

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
        case "h":
          if (ui.selectedIds.length > 0) {
            const nodes = useDoc.getState().doc?.nodes ?? {};
            const anyVisible = ui.selectedIds.some((id) => nodes[id]?.visible);
            setNodesVisible(ui.selectedIds, !anyVisible);
          }
          break;
        case "escape":
          ui.select(null);
          break;
        case "delete":
        case "backspace":
          if (ui.selectedIds.length > 0) removeNodes(ui.selectedIds);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
}
