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
  ArrowRight,
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
import { BASE_STATE_ID, type Action, type ChibiDocument, type ChibiNode } from "@/runtime/schema";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

const TRIGGER_LABELS: Record<string, string> = {
  start: "Start",
  click: "Click",
  hoverEnter: "Hover enter",
  hoverExit: "Hover exit",
};

function describeAction(action: Action, doc: ChibiDocument): string {
  const nodeName = (id: string) => doc.nodes[id]?.name ?? id;
  const stateName = (id: string) =>
    id === BASE_STATE_ID ? "Base" : (doc.states[id]?.name ?? id);
  switch (action.type) {
    case "transition":
      return `Transition ${nodeName(action.nodeId)} → ${stateName(action.to)}`;
    case "playAnimation":
      return `Play ${doc.animations[action.animationId]?.name ?? "animation"}`;
    case "toggleStates":
      return `Toggle ${nodeName(action.nodeId)} ${stateName(action.a)} ↔ ${stateName(action.b)}`;
  }
}

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

type Row = {
  id: string;
  depth: number;
  isLast: boolean;
  ancestorLast: boolean[];
};

const INDENT = 14;

export function Hierarchy() {
  const doc = useDoc((s) => s.doc);
  const docId = useDoc((s) => s.docId);
  const selectedId = useUI((s) => s.selectedId);
  const selectedIds = useUI((s) => s.selectedIds);
  const select = useUI((s) => s.select);
  const openNodeInteractions = useUI((s) => s.openNodeInteractions);
  const activeStateId = useUI((s) => s.activeStateId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const collapsedInitFor = useRef<string | null>(null);
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

  const interactionSummaries = useMemo(() => {
    const map = new Map<string, { trigger: string; action: string }[]>();
    if (doc) {
      for (const ix of doc.interactions) {
        if (ix.trigger.type === "start") continue;
        const row = {
          trigger: TRIGGER_LABELS[ix.trigger.type],
          action: describeAction(ix.action, doc),
        };
        const list = map.get(ix.trigger.nodeId) ?? [];
        list.push(row);
        map.set(ix.trigger.nodeId, list);
      }
    }
    return map;
  }, [doc]);

  const rows = useMemo(() => {
    if (!doc) return [] as Row[];
    const out: Row[] = [];
    const walk = (ids: string[], depth: number, ancestorLast: boolean[]) => {
      ids.forEach((id, i) => {
        const node = doc.nodes[id];
        if (!node) return;
        const isLast = i === ids.length - 1;
        out.push({ id, depth, isLast, ancestorLast });
        if (!collapsed.has(id)) {
          walk(node.children, depth + 1, [...ancestorLast, isLast]);
        }
      });
    };
    walk(doc.root, 0, []);
    return out;
  }, [doc, collapsed]);

  // expand collapsed ancestors when selection lands on a hidden nested node —
  // adjusted during render (not an effect) so the row is visible immediately
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  if (selectedId !== expandedFor) {
    setExpandedFor(selectedId);
    if (selectedId) {
      const ancestors: string[] = [];
      let cur = parentOf.get(selectedId);
      while (cur) {
        ancestors.push(cur);
        cur = parentOf.get(cur);
      }
      if (ancestors.some((id) => collapsed.has(id))) {
        const next = new Set(collapsed);
        for (const id of ancestors) next.delete(id);
        setCollapsed(next);
      }
    }
  }

  useEffect(() => {
    if (selectedId) {
      rowRefs.current
        .get(selectedId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, collapsed]);

  useEffect(() => {
    if (!doc || collapsedInitFor.current === docId) return;
    collapsedInitFor.current = docId;
    const all = new Set<string>();
    for (const node of Object.values(doc.nodes)) {
      if (node.children.length > 0 || node.type === "model") all.add(node.id);
    }
    setCollapsed(all);
  }, [doc, docId]);

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
        {rows.map(({ id, depth, isLast, ancestorLast }) => {
          const node = doc.nodes[id];
          const isSelected = selectedIds.includes(id);
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
              tabIndex={0}
              onClick={() => select(id)}
              onDoubleClick={() => setEditingId(id)}
              className={`group flex h-7 cursor-default items-center gap-1 pr-2 pl-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary ${
                isSelected
                  ? "bg-primary text-primary-foreground"
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
            >
              {ancestorLast.slice(0, depth - 1).map((last, i) => (
                <div
                  key={i}
                  className="relative h-7 shrink-0 self-stretch"
                  style={{ width: INDENT }}
                >
                  {!last && (
                    <span
                      className="absolute top-0 bottom-0 w-px bg-muted-foreground/40"
                      style={{ left: INDENT / 2 }}
                    />
                  )}
                </div>
              ))}
              {depth > 0 && (
                <div
                  className="relative h-7 shrink-0 self-stretch"
                  style={{ width: INDENT }}
                >
                  <span
                    className="absolute border-l border-b border-muted-foreground/40"
                    style={{
                      left: INDENT / 2,
                      top: 0,
                      height: INDENT,
                      width: INDENT / 2 + 4,
                    }}
                  />
                  {!isLast && (
                    <span
                      className="absolute bottom-0 w-px bg-muted-foreground/40"
                      style={{ left: INDENT / 2, top: INDENT }}
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                className={`grid size-3.5 shrink-0 place-items-center rounded-sm ${
                  hasChildren
                    ? collapsed.has(id)
                      ? "border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      : "bg-primary text-primary-foreground"
                    : "invisible"
                }`}
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
                  <ChevronRight className="size-2.5" />
                ) : (
                  <ChevronDown className="size-2.5" />
                )}
              </button>
              {(() => {
                const Icon = nodeIcon(node);
                return (
                  <Icon
                    className={`size-3.5 shrink-0 ${
                      isSelected
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
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
                className={`hidden group-hover:block ${node.visible ? "text-muted-foreground" : "text-muted-foreground/50"} hover:text-foreground`}
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
              <span className="grid size-3 shrink-0 place-items-center">
                {interactionSummaries.has(id) && (
                  <HoverCard openDelay={0} closeDelay={0}>
                    <HoverCardTrigger asChild>
                      <Zap
                        aria-label="Has interactions"
                        className="size-3 shrink-0 fill-amber-400/20 text-amber-400"
                      />
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="right"
                      className="w-64 overflow-hidden p-0"
                    >
                      <div className="flex items-center gap-1.5 border-b border-border py-2 pr-2 pl-3">
                        <Zap className="size-3 shrink-0 fill-amber-400/20 text-amber-400" />
                        <span className="text-xs font-semibold text-foreground">
                          Interactions
                        </span>
                        <span className="flex-1" />
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openNodeInteractions(id);
                          }}
                        >
                          Edit
                          <ArrowRight />
                        </Button>
                      </div>
                      <div className="flex flex-col gap-1.5 p-3">
                        {interactionSummaries.get(id)!.map((row, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-1.5 rounded-md border border-border px-2 py-1.5"
                          >
                            <span className="mt-0.5 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
                              {row.trigger}
                            </span>
                            <span className="text-xs leading-snug text-foreground">
                              {row.action}
                            </span>
                          </div>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </span>
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
