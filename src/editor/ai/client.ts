import { createMistral } from "@ai-sdk/mistral";
import {
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelMiddleware,
} from "ai";

// BYO key, browser-only: localStorage, never the document/IndexedDB/exports.
const API_KEY_STORAGE = "chibi.ai.apiKey";
const MODEL_STORAGE = "chibi.ai.model";

/** default for the agent loop (tool calling + streaming) */
export const AGENT_MODEL_ID = "mistral-large-latest";
/** tool-capable Mistral models offered in the AI settings picker */
export const AGENT_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: "mistral-large-latest", label: "Mistral Large" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-small-latest", label: "Mistral Small" },
];
/** reserved for cheap utility calls (M11 renaming etc.) */
export const UTILITY_MODEL_ID = "mistral-small-latest";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string) {
  if (key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim());
  else localStorage.removeItem(API_KEY_STORAGE);
}

export function getModelId(): string {
  if (typeof window === "undefined") return AGENT_MODEL_ID;
  return localStorage.getItem(MODEL_STORAGE) || AGENT_MODEL_ID;
}

export function setModelId(id: string) {
  if (id.trim() && id.trim() !== AGENT_MODEL_ID) {
    localStorage.setItem(MODEL_STORAGE, id.trim());
  } else {
    localStorage.removeItem(MODEL_STORAGE);
  }
}

// Mistral rate-limits aggressively (free-tier keys: ~1 request/second).
// Space out request *starts* globally so agent tool rounds, generation
// retries and SDK 429-retries never burst past the limit.
const MIN_REQUEST_INTERVAL_MS = 1100;

let nextSlot = 0;
async function awaitRequestSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_REQUEST_INTERVAL_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

const throttleMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    await awaitRequestSlot();
    return doGenerate();
  },
  wrapStream: async ({ doStream }) => {
    await awaitRequestSlot();
    return doStream();
  },
};

/**
 * Retry budget for generateText/streamText: what rides out a 429 window is
 * the SDK's exponential backoff (2s, 4s, 8s, 16s, 32s) — the default of 2
 * retries gives up after ~6s, well inside Mistral's per-minute windows.
 */
export const MAX_API_RETRIES = 5;

/** Mistral model bound to the stored key; throws if no key is set. */
export function getAgentModel(): LanguageModel {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No API key set");
  return wrapLanguageModel({
    model: createMistral({ apiKey })(getModelId()),
    middleware: throttleMiddleware,
  });
}
