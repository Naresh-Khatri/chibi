import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";

// BYO key, browser-only: localStorage, never the document/IndexedDB/exports.
const API_KEY_STORAGE = "chibi.ai.apiKey";
const MODEL_STORAGE = "chibi.ai.model";

/** default for the agent loop (tool calling + streaming) */
export const AGENT_MODEL_ID = "mistral-large-latest";
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

/** Mistral model bound to the stored key; throws if no key is set. */
export function getAgentModel(): LanguageModel {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No API key set");
  return createMistral({ apiKey })(getModelId());
}
