"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
  Box,
  Copy,
  Eraser,
  Eye,
  Globe,
  Group,
  Lightbulb,
  ListTree,
  Loader2,
  MousePointer2,
  Move3d,
  Palette,
  Pencil,
  Search,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  AGENT_MODEL_OPTIONS,
  getApiKey,
  getModelId,
  setApiKey,
  setModelId,
} from "../ai/client";
import { sendChatMessage, stopTurn } from "../ai/agent";
import {
  canRevertTo,
  revertToCheckpoint,
  useAiChat,
  type AssistantItem,
  type ToolChip,
} from "../ai/store";

const TOOL_ICONS: Record<string, LucideIcon> = {
  get_scene: ListTree,
  get_node: Search,
  get_material: Search,
  find_nodes: Search,
  select_nodes: MousePointer2,
  add_mesh: Box,
  add_light: Lightbulb,
  add_group: Group,
  remove_node: Trash2,
  duplicate_node: Copy,
  reparent_node: ListTree,
  group_node: Group,
  set_transform: Move3d,
  set_node_name: Pencil,
  set_node_visible: Eye,
  set_node_shadow: Square,
  set_geometry_param: Settings2,
  add_material: Palette,
  assign_material: Palette,
  set_material_props: Palette,
  set_environment: Globe,
  set_document_name: Pencil,
};

// Minimal markdown-lite renderer for assistant text: bold, italic, inline
// code, links and lists. The model is asked to keep replies plain (see
// SYSTEM_PROMPT) but still leans on markdown for emphasis/lists, so render
// it instead of dropping it — no markdown dependency, this stays tiny.
const INLINE_MD =
  /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/g;

function renderInlineMarkdown(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE_MD)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      nodes.push(
        <code key={k} className="rounded bg-muted px-1 py-0.5 text-[11px]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined || m[3] !== undefined) {
      nodes.push(<strong key={k}>{m[2] ?? m[3]}</strong>);
    } else if (m[4] !== undefined || m[5] !== undefined) {
      nodes.push(<em key={k}>{m[4] ?? m[5]}</em>);
    } else if (m[6] !== undefined) {
      nodes.push(
        <a
          key={k}
          href={m[7]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {m[6]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const LIST_ITEM = /^\s*[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+\.\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        items.push(lines[i].match(LIST_ITEM)![1]);
        i++;
      }
      const k = key++;
      blocks.push(
        <ul key={`ul-${k}`} className="list-disc space-y-0.5 pl-4">
          {items.map((it, idx) => (
            <li key={idx}>{renderInlineMarkdown(it, `ul-${k}-${idx}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (ORDERED_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_ITEM.test(lines[i])) {
        items.push(lines[i].match(ORDERED_ITEM)![1]);
        i++;
      }
      const k = key++;
      blocks.push(
        <ol key={`ol-${k}`} className="list-decimal space-y-0.5 pl-4">
          {items.map((it, idx) => (
            <li key={idx}>{renderInlineMarkdown(it, `ol-${k}-${idx}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const k = key++;
      blocks.push(
        <p key={`h-${k}`} className="font-medium text-foreground">
          {renderInlineMarkdown(heading[1], `h-${k}`)}
        </p>,
      );
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !LIST_ITEM.test(lines[i]) &&
      !ORDERED_ITEM.test(lines[i]) &&
      !HEADING.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const k = key++;
    blocks.push(
      <p key={`p-${k}`}>
        {paraLines.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInlineMarkdown(l, `p-${k}-${idx}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

function ChipView({ chip }: { chip: ToolChip }) {
  const Icon = TOOL_ICONS[chip.name] ?? Settings2;
  return (
    <div
      title={chip.detail}
      className={`my-0.5 flex w-fit max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] ${
        chip.error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "bg-muted/40 text-muted-foreground"
      }`}
    >
      {chip.done ? (
        <Icon className="size-3 shrink-0" />
      ) : (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      )}
      <span className="truncate">
        {chip.name.replace(/_/g, " ")}
        {chip.detail ? ` · ${chip.detail}` : ""}
      </span>
    </div>
  );
}

function AssistantItems({ items }: { items: AssistantItem[] }) {
  return (
    <>
      {items.map((item, i) =>
        item.kind === "text" ? (
          <div
            key={i}
            className="space-y-1.5 text-xs text-foreground [&_a]:text-primary [&_ol]:text-foreground [&_ul]:text-foreground"
          >
            {renderMarkdown(item.text)}
          </div>
        ) : (
          <ChipView key={item.chip.id} chip={item.chip} />
        ),
      )}
    </>
  );
}

function RevertRow({
  checkpoint,
  changes,
}: {
  checkpoint: number;
  changes: number;
}) {
  // subscribe so enablement reacts to manual undo/redo
  useDoc((s) => s.undoStack);
  if (changes === 0) return null;
  const enabled = canRevertTo(checkpoint);
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {changes} change{changes === 1 ? "" : "s"} ·
      <button
        type="button"
        disabled={!enabled}
        onClick={() => revertToCheckpoint(checkpoint)}
        className="flex items-center gap-0.5 font-medium text-foreground enabled:hover:text-primary disabled:opacity-40"
      >
        <Undo2 className="size-3" />
        Revert
      </button>
    </div>
  );
}

function SettingsPopover({
  hasKey,
  onKeyChange,
  model,
  onModelChange,
}: {
  hasKey: boolean;
  onKeyChange: (v: boolean) => void;
  model: string;
  onModelChange: (v: string) => void;
}) {
  const [keyDraft, setKeyDraft] = useState("");
  return (
    <PopoverPrimitive.Root onOpenChange={() => setKeyDraft("")}>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-xs" title="AI settings">
          <Settings2 />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl outline-none"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Mistral API key
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  placeholder={hasKey ? "••••••••  (key set)" : "paste key"}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.currentTarget.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="h-6 w-full min-w-0 rounded-md border border-input bg-input/30 px-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={!keyDraft.trim()}
                  onClick={() => {
                    setApiKey(keyDraft);
                    setKeyDraft("");
                    onKeyChange(true);
                  }}
                >
                  Save
                </Button>
              </div>
              {hasKey && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setApiKey("");
                    onKeyChange(false);
                  }}
                >
                  Clear key
                </button>
              )}
              <p className="text-[10px] leading-4 text-muted-foreground">
                Stored in this browser only (localStorage) — never in the
                document or exports.
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Model
              </div>
              <Select
                value={model}
                onValueChange={(v) => {
                  setModelId(v);
                  onModelChange(v);
                }}
              >
                <SelectTrigger size="sm" className="h-6! w-full px-1.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  {/* a custom id stored before the picker existed still shows */}
                  {!AGENT_MODEL_OPTIONS.some((opt) => opt.id === model) && (
                    <SelectItem value={model}>{model}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function SetupCard({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="m-3 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Sparkles className="size-3.5 text-primary" />
        Set up chibi AI
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Paste a Mistral API key to chat with your scene. The key stays in this
        browser (localStorage) and is never written to the document or exports.
      </p>
      <input
        type="password"
        placeholder="Mistral API key"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && draft.trim()) {
            setApiKey(draft);
            onDone();
          }
        }}
        className="h-7 w-full rounded-md border border-input bg-input/30 px-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
      />
      <Button
        variant="secondary"
        size="xs"
        disabled={!draft.trim()}
        onClick={() => {
          setApiKey(draft);
          onDone();
        }}
      >
        Save key
      </Button>
    </div>
  );
}

// Floating entry point into chibi AI: shows while a node is selected and
// the chat is closed.
export function AskAiButton() {
  const selectedId = useUI((s) => s.selectedId);
  const chatOpen = useUI((s) => s.aiChatOpen);
  const toggleAiChat = useUI((s) => s.toggleAiChat);
  if (!selectedId || chatOpen) return null;

  return (
    <Button
      variant="secondary"
      size="xs"
      title="Open the chibi AI chat"
      onClick={toggleAiChat}
      className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 shadow-lg"
    >
      <Sparkles className="text-primary" />
      Ask AI
    </Button>
  );
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="ml-8 w-fit max-w-full self-end rounded-lg bg-primary/15 px-2.5 py-1.5 text-xs text-foreground">
      {children}
    </div>
  );
}

export function AiChat() {
  const open = useUI((s) => s.aiChatOpen);
  const toggle = useUI((s) => s.toggleAiChat);
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const messages = useAiChat((s) => s.messages);
  const status = useAiChat((s) => s.status);
  const clear = useAiChat((s) => s.clear);

  // lazy init is hydration-safe: the panel never renders during hydration
  // (aiChatOpen starts false), so localStorage is always available here
  const [hasKey, setHasKey] = useState(() => Boolean(getApiKey()));
  const [model, setModel] = useState(getModelId);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!open) return null;

  const send = () => {
    const text = draft.trim();
    if (!text || status === "running") return;
    setDraft("");
    void sendChatMessage(text);
  };

  return (
    <div
      className={`absolute bottom-3 z-20 flex max-h-[min(480px,calc(100%-24px))] w-80 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur ${
        inspectorOpen ? "right-[272px]" : "right-3"
      }`}
    >
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <Sparkles className="size-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground">chibi AI</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {AGENT_MODEL_OPTIONS.find((o) => o.id === model)?.label ?? model}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          title="Clear conversation"
          disabled={messages.length === 0 || status === "running"}
          onClick={clear}
        >
          <Eraser />
        </Button>
        <SettingsPopover
          hasKey={hasKey}
          onKeyChange={setHasKey}
          model={model}
          onModelChange={setModel}
        />
        <Button variant="ghost" size="icon-xs" title="Close" onClick={toggle}>
          <X />
        </Button>
      </div>

      {!hasKey ? (
        <SetupCard onDone={() => setHasKey(true)} />
      ) : (
        <>
          <div
            ref={listRef}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
          >
            {messages.length === 0 && (
              <p className="text-[11px] leading-4 text-muted-foreground">
                Ask for scene edits in plain language — &ldquo;make the cube
                metallic red, move the key light behind it&rdquo;. Every change
                is undoable.
              </p>
            )}
            {messages.map((msg) =>
              msg.role === "user" ? (
                <Bubble key={msg.id}>
                  <span className="whitespace-pre-wrap">{msg.text}</span>
                </Bubble>
              ) : (
                <div key={msg.id} className="flex flex-col items-start">
                  <AssistantItems items={msg.items} />
                  {msg.error && (
                    <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                      {msg.error}
                    </p>
                  )}
                  <RevertRow
                    checkpoint={msg.checkpoint}
                    changes={msg.changes}
                  />
                </div>
              ),
            )}
            {status === "running" && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex items-end gap-1.5 border-t p-2">
            <textarea
              rows={2}
              placeholder="Describe a change… (⏎ to send)"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="max-h-32 w-full resize-none rounded-md border border-input bg-input/30 px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            {status === "running" ? (
              <Button
                variant="secondary"
                size="xs"
                title="Stop this turn (applied changes stay undoable)"
                onClick={stopTurn}
              >
                <Square />
                Stop
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="xs"
                disabled={!draft.trim()}
                onClick={send}
              >
                Send
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
