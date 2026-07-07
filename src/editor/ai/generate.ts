import { generateText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  createMaterial,
  DEFAULT_MATERIAL_ID,
  newId,
  validateDocument,
  type ChibiDocument,
} from "@/runtime/schema";
import { getAgentModel, MAX_API_RETRIES } from "./client";
import { GENERATION_SYSTEM_PROMPT } from "./prompts";

// M8 single-shot document generation (specs/09 §1): one call returns a full
// ChibiDocument JSON; parse → remap all ids → validate; retry on validation
// failure feeding the zod error paths back.

export const MAX_ATTEMPTS = 5; // 1 + 4 retries

export const GENERATION_BUDGETS = { nodes: 80, materials: 12, lights: 4 };

/** final failure carries the raw model output so the UI can offer it for inspection */
export class GenerationError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "GenerationError";
    this.rawText = rawText;
  }
}

/** the LLM call, injectable so the pipeline is unit-testable */
export type CompleteFn = (messages: ModelMessage[]) => Promise<string>;

async function completeWithModel(messages: ModelMessage[]): Promise<string> {
  const result = await generateText({
    model: getAgentModel(),
    system: GENERATION_SYSTEM_PROMPT,
    // trailing assistant "{" becomes a Mistral prefix — the reply continues
    // the JSON object (and typically omits the prefilled brace)
    messages: [...messages, { role: "assistant", content: "{" }],
    maxRetries: MAX_API_RETRIES,
  });
  return result.text;
}

/** tolerant JSON extraction: plain object, prefix continuation, or fenced */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const last = t.lastIndexOf("}");
  const first = t.indexOf("{");
  const candidates = [t, `{${t}`];
  if (first !== -1 && last > first) candidates.push(t.slice(first, last + 1));
  if (last !== -1) candidates.push(`{${t.slice(0, last + 1)}`);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  throw new Error("The reply was not valid JSON.");
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** top-level fields the model shouldn't have to spell out (or can't be trusted on) */
function withDocumentDefaults(data: unknown, prompt: string): unknown {
  if (!isRec(data)) return data;
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name
      : prompt.trim().slice(0, 48) || "Generated scene";
  return {
    assets: {},
    animations: {},
    states: {},
    interactions: [],
    editor: { grid: true },
    ...data,
    chibi: 1,
    name,
  };
}

const ID_SECTIONS = [
  ["nodes", "nd"],
  ["materials", "mt"],
  ["assets", "as"],
  ["animations", "an"],
  ["states", "st"],
] as const;

/**
 * Remap every entity id through newId(prefix) — model-invented ids are never
 * trusted — fixing cross-references via the remap table. "mt_default" and the
 * virtual state id "base" pass through. Unknown scalar refs are left as-is
 * (zod reports better errors on the original text); unknown tree refs
 * (root/children) are dropped so no ghost ids survive into the document.
 * Pre-validation: structurally defensive, never throws on malformed input.
 */
export function remapGeneratedIds(data: unknown): unknown {
  if (!isRec(data)) return data;

  const map = new Map<string, string>();
  for (const [section, prefix] of ID_SECTIONS) {
    const rec = data[section];
    if (!isRec(rec)) continue;
    for (const oldId of Object.keys(rec)) {
      const keep = section === "materials" && oldId === DEFAULT_MATERIAL_ID;
      map.set(oldId, keep ? oldId : newId(prefix));
    }
  }

  const ref = (id: unknown): unknown =>
    typeof id === "string" ? (map.get(id) ?? id) : id;
  const refList = (ids: unknown): unknown =>
    Array.isArray(ids)
      ? ids.filter((id) => typeof id === "string" && map.has(id)).map((id) => map.get(id))
      : ids;
  const refKeys = (rec: unknown): unknown =>
    isRec(rec)
      ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [ref(k), v]))
      : rec;

  const remapSection = (section: string, fix: (entity: Rec) => Rec): unknown => {
    const rec = data[section];
    if (!isRec(rec)) return rec;
    return Object.fromEntries(
      Object.entries(rec).map(([oldId, entity]) => {
        const id = map.get(oldId)!;
        return [id, isRec(entity) ? { ...fix(entity), id } : entity];
      }),
    );
  };

  const fixNode = (node: Rec): Rec => ({
    ...node,
    children: refList(node.children),
    ...(node.materialId !== undefined && { materialId: ref(node.materialId) }),
    ...(node.assetId !== undefined && { assetId: ref(node.assetId) }),
  });

  const fixMaterial = (material: Rec): Rec => ({
    ...material,
    ...(isRec(material.maps) && {
      maps: Object.fromEntries(
        Object.entries(material.maps).map(([slot, assetId]) => [slot, ref(assetId)]),
      ),
    }),
  });

  const fixAnimation = (animation: Rec): Rec => ({
    ...animation,
    ...(Array.isArray(animation.tracks) && {
      tracks: animation.tracks.map((track) =>
        isRec(track) ? { ...track, targetId: ref(track.targetId) } : track,
      ),
    }),
  });

  const fixState = (state: Rec): Rec => ({
    ...state,
    nodeId: ref(state.nodeId),
    overrides: refKeys(state.overrides),
  });

  const fixInteraction = (ix: unknown): unknown => {
    if (!isRec(ix)) return ix;
    const trigger = isRec(ix.trigger)
      ? { ...ix.trigger, ...(ix.trigger.nodeId !== undefined && { nodeId: ref(ix.trigger.nodeId) }) }
      : ix.trigger;
    const action = isRec(ix.action)
      ? {
        ...ix.action,
        ...(ix.action.nodeId !== undefined && { nodeId: ref(ix.action.nodeId) }),
        ...(ix.action.animationId !== undefined && { animationId: ref(ix.action.animationId) }),
        // state refs; "base" isn't in the map and passes through
        ...(ix.action.to !== undefined && { to: ref(ix.action.to) }),
        ...(ix.action.a !== undefined && { a: ref(ix.action.a) }),
        ...(ix.action.b !== undefined && { b: ref(ix.action.b) }),
      }
      : ix.action;
    return { ...ix, id: newId("ix"), trigger, action };
  };

  return {
    ...data,
    root: refList(data.root),
    nodes: remapSection("nodes", fixNode),
    materials: remapSection("materials", fixMaterial),
    assets: remapSection("assets", (a) => a),
    animations: remapSection("animations", fixAnimation),
    states: remapSection("states", fixState),
    interactions: Array.isArray(data.interactions)
      ? data.interactions.map(fixInteraction)
      : data.interactions,
  };
}

/** the editor assumes mt_default exists (mesh defaults, delete-material fallback) */
function ensureDefaultMaterial(data: unknown): unknown {
  if (!isRec(data) || !isRec(data.materials) || data.materials[DEFAULT_MATERIAL_ID]) {
    return data;
  }
  return {
    ...data,
    materials: {
      ...data.materials,
      [DEFAULT_MATERIAL_ID]: createMaterial(DEFAULT_MATERIAL_ID, "Default"),
    },
  };
}

/** budgets from the prompt, enforced post-parse: hard-fail over 2×, warn over 1× */
export function checkBudgets(doc: ChibiDocument): void {
  const counts = {
    nodes: Object.keys(doc.nodes).length,
    materials: Object.keys(doc.materials).length,
    lights: Object.values(doc.nodes).filter((n) => n.type === "light").length,
  };
  const over: string[] = [];
  for (const key of Object.keys(GENERATION_BUDGETS) as (keyof typeof counts)[]) {
    const budget = GENERATION_BUDGETS[key];
    if (counts[key] > budget * 2) {
      over.push(`${counts[key]} ${key} (budget ${budget})`);
    } else if (counts[key] > budget) {
      console.warn(`chibi: generated scene over ${key} budget (${counts[key]} > ${budget})`);
    }
  }
  if (over.length) {
    throw new Error(
      `The scene is far over budget: ${over.join(", ")}. Regenerate with fewer elements (budgets: ${GENERATION_BUDGETS.nodes} nodes, ${GENERATION_BUDGETS.materials} materials, ${GENERATION_BUDGETS.lights} lights).`,
    );
  }
}

/** validation feedback the model can act on: zod issue paths, capped */
function describeIssues(err: unknown): string {
  if (err instanceof z.ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    const shown = issues.slice(0, 20);
    if (issues.length > shown.length) {
      shown.push(`… and ${issues.length - shown.length} more issue(s)`);
    }
    return shown.join("\n");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Prompt → validated ChibiDocument. Throws GenerationError (with the raw
 * model output) after MAX_ATTEMPTS failed validations; network/API errors
 * from the completer propagate unchanged.
 */
export async function generateDocument(
  prompt: string,
  complete: CompleteFn = completeWithModel,
): Promise<ChibiDocument> {
  const messages: ModelMessage[] = [{ role: "user", content: prompt }];
  let lastRaw = "";
  let lastError = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const text = await complete(messages);
    lastRaw = text;
    try {
      const parsed = extractJson(text);
      const draft = ensureDefaultMaterial(
        remapGeneratedIds(withDocumentDefaults(parsed, prompt)),
      );
      const doc = validateDocument(draft);
      checkBudgets(doc);
      return doc;
    } catch (err) {
      lastError = describeIssues(err);
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `That document failed validation:\n${lastError}\n\nReturn the complete corrected JSON document. JSON only.`,
        },
      );
    }
  }

  throw new GenerationError(
    `Couldn't produce a valid scene after ${MAX_ATTEMPTS} attempts. Last error:\n${lastError}`,
    lastRaw,
  );
}
