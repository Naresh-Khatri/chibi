import {
  isStepCount,
  streamText,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { useDoc } from "../store/document";
import { getAgentModel } from "./client";
import { buildSceneContext } from "./context";
import { BUDGET_EXHAUSTED_PROMPT, SYSTEM_PROMPT } from "./prompts";
import { useAiChat } from "./store";
import { buildTools } from "./tools";

// hard cap on tool iterations per turn (spec §5)
const MAX_STEPS = 24;

let controller: AbortController | null = null;

export function stopTurn() {
  controller?.abort();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

// Multi-turn memory is the visible conversation (spec: nothing beyond it).
// Prior tool traffic isn't replayed — the fresh scene snapshot in the system
// prompt supersedes it.
function historyFromChat(): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const msg of useAiChat.getState().messages) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.text });
      continue;
    }
    const text = msg.items
      .filter((i) => i.kind === "text")
      .map((i) => i.text)
      .join("")
      .trim();
    const tools = msg.items
      .filter((i) => i.kind === "tool")
      .map((i) => i.chip.name);
    const content =
      text ||
      (tools.length
        ? `(edited the scene via tools: ${tools.join(", ")})`
        : "(no response)");
    out.push({ role: "assistant", content });
  }
  return out;
}

/** pipe one streamText result into the chat store; returns the finish reason */
async function consumeStream<T extends ToolSet>(result: {
  stream: AsyncIterable<TextStreamPart<T>>;
}): Promise<string | undefined> {
  const chat = useAiChat.getState();
  let finishReason: string | undefined;
  let streamError: unknown;

  for await (const part of result.stream) {
    switch (part.type) {
      case "text-delta":
        chat.appendText(part.text);
        break;
      case "tool-call":
        chat.addChip({ id: part.toolCallId, name: part.toolName });
        break;
      case "tool-result":
        chat.updateChip(part.toolCallId, {
          done: true,
          detail: summaryOf(part.output),
        });
        break;
      case "tool-error":
        chat.updateChip(part.toolCallId, {
          done: true,
          error: true,
          detail: errorMessage(part.error),
        });
        break;
      case "error":
        streamError = part.error;
        break;
      case "finish":
        finishReason = part.finishReason;
        break;
    }
  }
  if (streamError !== undefined) throw new Error(errorMessage(streamError));
  return finishReason;
}

function summaryOf(output: unknown): string | undefined {
  if (
    output &&
    typeof output === "object" &&
    "summary" in output &&
    typeof (output as { summary: unknown }).summary === "string"
  ) {
    return (output as { summary: string }).summary;
  }
  if (Array.isArray(output)) return `${output.length} result(s)`;
  return undefined;
}

export async function sendChatMessage(text: string) {
  const chat = useAiChat.getState();
  if (chat.status === "running" || !text.trim()) return;

  const checkpoint = useDoc.getState().undoStack.length;
  const system = `${SYSTEM_PROMPT}\n\n${buildSceneContext()}`;
  const history = historyFromChat();
  chat.beginTurn(text.trim(), checkpoint);
  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: text.trim() },
  ];

  controller = new AbortController();
  const signal = controller.signal;
  let error: string | undefined;

  try {
    const model = getAgentModel();
    const finishReason = await consumeStream(
      streamText({
        model,
        system,
        messages,
        tools: buildTools(),
        stopWhen: isStepCount(MAX_STEPS),
        abortSignal: signal,
      }),
    );

    // budget exhausted mid-tool-use: one tool-less pass to wrap up
    if (finishReason === "tool-calls" && !signal.aborted) {
      useAiChat.getState().appendText("\n\n");
      await consumeStream(
        streamText({
          model,
          system: `${SYSTEM_PROMPT}\n\n${buildSceneContext()}`,
          messages: [
            ...messages,
            {
              role: "assistant",
              content: "(tool iteration budget reached mid-task)",
            },
            { role: "user", content: BUDGET_EXHAUSTED_PROMPT },
          ],
          abortSignal: signal,
        }),
      );
    }
  } catch (err) {
    // Stop leaves applied changes in place (individually undoable) — only
    // real failures surface in the chat.
    if (!signal.aborted) error = errorMessage(err);
  } finally {
    controller = null;
    useAiChat.getState().endTurn(error);
  }
}
