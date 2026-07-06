"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import type { Object3D } from "three";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Group,
  Layers,
  Lightbulb,
  Package,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ChibiNode } from "@/runtime/schema";
import { GEOMETRY_ICONS } from "./Toolbar";
import { getSceneObject, useRegistry } from "../viewport/objectRegistry";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  removeNode,
  reparentNode,
  setNodeName,
  setNodeVisible,
} from "../store/commands";

type DropPos = "before" | "inside" | "after";

const TYPE_ICONS: Record<Exclude<ChibiNode["type"], "mesh">, LucideIcon> = {
  group: Group,
  light: Lightbulb,
  model: Package,
};

function nodeIcon(node: ChibiNode): LucideIcon {
  if (node.type === "mesh") return GEOMETRY_ICONS[node.geometry.kind];
  return TYPE_ICONS[node.type];
}

// Read-only view of a GLB's internal object tree (informational only).
function ModelInternals({ nodeId, depth }: { nodeId: string; depth: number }) {
  useRegistry((s) => s.version);
  const object = getSceneObject(nodeId);
  const rows: { key: string; name: string; depth: number }[] = [];
  if (object) {
    const walk = (o: Object3D, d: number) => {
      for (const child of o.children) {
        if (rows.length >= 100) return;
        const named = child.name.length > 0;
        if (named) rows.push({ key: child.uuid, name: child.name, depth: d });
        walk(child, named ? d + 1 : d);
      }
    };
    walk(object, depth);
  }
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex h-6 items-center gap-1 pr-2 text-[11px] italic text-muted-foreground/70"
          style={{ paddingLeft: 8 + row.depth * 14 + 16 }}
        >
          <span className="text-[9px]">·</span>
          <span className="truncate">{row.name}</span>
        </div>
      ))}
    </>
  );
}

type Row = { id: string; depth: number };

export function Hierarchy() {
  const doc = useDoc((s) => s.doc);
  const selectedId = useUI((s) => s.selectedId);
  const select = useUI((s) => s.select);
  const activeStateId = useUI((s) => s.activeStateId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    pos: DropPos;
  } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const parentOf = useMemo(() => {
    const map = new Map<string, string>();
    if (doc) {
      for (const node of Object.values(doc.nodes)) {
        for (const cid of node.children) map.set(cid, node.id);
      }
    }
    return map;
  }, [doc]);

  const interactiveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ix of doc?.interactions ?? []) {
      if (ix.trigger.type !== "start") ids.add(ix.trigger.nodeId);
    }
    return ids;
  }, [doc?.interactions]);

  const rows = useMemo(() => {
    if (!doc) return [] as Row[];
    const out: Row[] = [];
    const walk = (ids: string[], depth: number) => {
      for (const id of ids) {
        const node = doc.nodes[id];
        if (!node) continue;
        out.push({ id, depth });
        if (!collapsed.has(id)) walk(node.children, depth + 1);
      }
    };
    walk(doc.root, 0);
    return out;
  }, [doc, collapsed]);

  useEffect(() => {
    if (selectedId) {
      rowRefs.current
        .get(selectedId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId]);

  if (!doc) return null;

  const overriddenIds = doc.states[activeStateId]?.overrides ?? {};

  const canNest = (id: string) => {
    const t = doc.nodes[id]?.type;
    return t === "group" || t === "mesh";
  };

  const computePos = (
    e: ReactDragEvent<HTMLDivElement>,
    targetId: string,
  ): DropPos => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    if (canNest(targetId)) {
      if (ratio < 0.3) return "before";
      if (ratio > 0.7) return "after";
      return "inside";
    }
    return ratio < 0.5 ? "before" : "after";
  };

  const handleDrop = (targetId: string, pos: DropPos) => {
    if (!dragId || dragId === targetId) return;
    if (pos === "inside") {
      reparentNode(dragId, targetId, doc.nodes[targetId].children.length);
    } else {
      const parentId = parentOf.get(targetId) ?? null;
      const siblings = parentId ? doc.nodes[parentId].children : doc.root;
      const idx = siblings.indexOf(targetId);
      reparentNode(dragId, parentId, pos === "before" ? idx : idx + 1);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-muted-foreground">
        <Layers className="size-3" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.map(({ id, depth }) => {
          const node = doc.nodes[id];
          const isSelected = id === selectedId;
          const isDrop = dropTarget?.id === id;
          const hasChildren = node.children.length > 0 || node.type === "model";
          return (
            <Fragment key={id}>
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
              draggable={editingId !== id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragId(id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                if (!dragId || dragId === id) return;
                e.preventDefault();
                const pos = computePos(e, id);
                if (dropTarget?.id !== id || dropTarget.pos !== pos) {
                  setDropTarget({ id, pos });
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(id, computePos(e, id));
                setDragId(null);
                setDropTarget(null);
              }}
              onClick={() => select(id)}
              onDoubleClick={() => setEditingId(id)}
              className={`group flex h-7 cursor-default items-center gap-1 pr-2 text-xs ${
                isSelected
                  ? "bg-primary/20 text-foreground"
                  : "text-foreground hover:bg-muted"
              } ${
                isDrop && dropTarget.pos === "inside"
                  ? "ring-1 ring-inset ring-primary"
                  : ""
              } ${
                isDrop && dropTarget.pos === "before"
                  ? "shadow-[inset_0_2px_0_0_var(--color-primary)]"
                  : ""
              } ${
                isDrop && dropTarget.pos === "after"
                  ? "shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                  : ""
              }`}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <button
                type="button"
                className={`grid w-3.5 place-items-center text-muted-foreground hover:text-foreground ${hasChildren ? "" : "invisible"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
              >
                {collapsed.has(id) ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
              {(() => {
                const Icon = nodeIcon(node);
                return (
                  <Icon
                    className={`size-3.5 shrink-0 ${
                      isSelected ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                );
              })()}
              {editingId === id ? (
                <input
                  autoFocus
                  defaultValue={node.name}
                  className="w-full min-w-0 rounded bg-muted px-1 text-xs text-foreground outline-none ring-1 ring-primary"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setNodeName(id, e.currentTarget.value);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <span
                  className={`truncate ${node.visible ? "" : "text-muted-foreground line-through"}`}
                >
                  {node.name}
                </span>
              )}
              {interactiveIds.has(id) && (
                <Zap
                  aria-label="Has interactions"
                  className="size-3 shrink-0 fill-amber-400/20 text-amber-400"
                />
              )}
              {overriddenIds[id] && (
                <span
                  title="Overridden in the active state"
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                />
              )}
              <span className="flex-1" />
              <button
                type="button"
                title="Delete"
                className="hidden text-muted-foreground hover:text-destructive group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(id);
                }}
              >
                <Trash2 className="size-3" />
              </button>
              <button
                type="button"
                title={node.visible ? "Hide" : "Show"}
                className={`${node.visible ? "text-muted-foreground" : "text-muted-foreground/50"} hover:text-foreground`}
                onClick={(e) => {
                  e.stopPropagation();
                  setNodeVisible(id, !node.visible);
                }}
              >
                {node.visible ? (
                  <Eye className="size-3" />
                ) : (
                  <EyeOff className="size-3" />
                )}
              </button>
            </div>
            {node.type === "model" && !collapsed.has(id) && (
              <ModelInternals nodeId={id} depth={depth + 1} />
            )}
            </Fragment>
          );
        })}
        <div
          className={`min-h-10 flex-1 ${
            dropTarget?.id === "__root__"
              ? "shadow-[inset_0_2px_0_0_var(--color-primary)]"
              : ""
          }`}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            if (dropTarget?.id !== "__root__") {
              setDropTarget({ id: "__root__", pos: "after" });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId) reparentNode(dragId, null, doc.root.length);
            setDragId(null);
            setDropTarget(null);
          }}
        />
      </div>
    </div>
  );
}
