import { create } from "zustand";
import { newId } from "@/runtime/schema";
import { useDoc } from "../store/document";

export type ToolChip = {
  /** toolCallId from the stream */
  id: string;
  name: string;
  detail?: string;
  error?: boolean;
  done?: boolean;
};

export type AssistantItem =
  | { kind: "text"; text: string }
  | { kind: "tool"; chip: ToolChip };

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      items: AssistantItem[];
      /** undoStack.length when the turn started */
      checkpoint: number;
      /** undo entries the turn produced (set when the turn ends) */
      changes: number;
      error?: string;
    };

type AiChatState = {
  messages: ChatMessage[];
  status: "idle" | "running";
  beginTurn: (userText: string, checkpoint: number) => void;
  appendText: (text: string) => void;
  addChip: (chip: ToolChip) => void;
  updateChip: (id: string, patch: Partial<ToolChip>) => void;
  endTurn: (error?: string) => void;
  clear: () => void;
};

// session-only chat: not persisted, not part of the document
export const useAiChat = create<AiChatState>()((set) => {
  const patchLastAssistant = (
    fn: (msg: Extract<ChatMessage, { role: "assistant" }>) => Partial<
      Extract<ChatMessage, { role: "assistant" }>
    >,
  ) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (last?.role !== "assistant") return s;
      return {
        messages: [...s.messages.slice(0, -1), { ...last, ...fn(last) }],
      };
    });

  return {
    messages: [],
    status: "idle",

    beginTurn: (userText, checkpoint) =>
      set((s) => ({
        status: "running",
        messages: [
          ...s.messages,
          { id: newId("msg"), role: "user", text: userText },
          {
            id: newId("msg"),
            role: "assistant",
            items: [],
            checkpoint,
            changes: 0,
          },
        ],
      })),

    appendText: (text) =>
      patchLastAssistant((msg) => {
        const last = msg.items[msg.items.length - 1];
        if (last?.kind === "text") {
          return {
            items: [
              ...msg.items.slice(0, -1),
              { kind: "text", text: last.text + text },
            ],
          };
        }
        return { items: [...msg.items, { kind: "text", text }] };
      }),

    addChip: (chip) =>
      patchLastAssistant((msg) => ({
        items: [...msg.items, { kind: "tool", chip }],
      })),

    updateChip: (id, patch) =>
      patchLastAssistant((msg) => ({
        items: msg.items.map((item) =>
          item.kind === "tool" && item.chip.id === id
            ? { kind: "tool", chip: { ...item.chip, ...patch } }
            : item,
        ),
      })),

    endTurn: (error) =>
      set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last?.role !== "assistant") return { status: "idle" };
        const changes = Math.max(
          0,
          useDoc.getState().undoStack.length - last.checkpoint,
        );
        return {
          status: "idle",
          messages: [...s.messages.slice(0, -1), { ...last, changes, error }],
        };
      }),

    clear: () => set({ messages: [], status: "idle" }),
  };
});

const AI_LABEL = "AI: ";

/** Revert stays valid only while everything above the checkpoint is AI-made
 * and the stack hasn't been rewound past it — no patch surgery otherwise. */
export function canRevertTo(checkpoint: number): boolean {
  const { undoStack } = useDoc.getState();
  return (
    undoStack.length > checkpoint &&
    undoStack.slice(checkpoint).every((e) => e.label.startsWith(AI_LABEL))
  );
}

export function revertToCheckpoint(checkpoint: number) {
  if (!canRevertTo(checkpoint)) return;
  const times = useDoc.getState().undoStack.length - checkpoint;
  for (let i = 0; i < times; i++) useDoc.getState().undo();
}
