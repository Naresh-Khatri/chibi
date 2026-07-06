import { describe, expect, it } from "vitest";
import { createDocument, validateDocument } from "./index";

/** legacy (≤ M5) doc: scene-level states, actions without nodeId */
function legacyDoc() {
  const doc = JSON.parse(JSON.stringify(createDocument("Legacy")));
  const [cubeId, lightId] = doc.root as [string, string];
  doc.states = {
    base: { id: "base", name: "Base", overrides: {} },
    st_hot: {
      id: "st_hot",
      name: "Hover",
      overrides: {
        [cubeId]: { "transform.scale": [2, 2, 2] },
        mt_default: { color: "#ff0000" },
        [lightId]: { "transform.position": [3, 10, 2] },
      },
    },
  };
  doc.interactions = [
    {
      id: "ix_in",
      trigger: { type: "hoverEnter", nodeId: cubeId },
      action: { type: "transition", to: "st_hot", duration: 0.4, ease: "easeOut" },
    },
    {
      id: "ix_out",
      trigger: { type: "hoverExit", nodeId: cubeId },
      action: { type: "transition", to: "base", duration: 0.4, ease: "easeOut" },
    },
    {
      id: "ix_play",
      trigger: { type: "click", nodeId: cubeId },
      action: { type: "playAnimation", animationId: "an_x" },
    },
  ];
  return { doc, cubeId, lightId };
}

describe("legacy document migration", () => {
  it("splits scene-level states per object, materials with their mesh", () => {
    const { doc, cubeId, lightId } = legacyDoc();
    const parsed = validateDocument(doc);

    expect(parsed.states.base).toBeUndefined();
    expect(parsed.states.st_hot).toMatchObject({
      nodeId: cubeId,
      overrides: {
        [cubeId]: { "transform.scale": [2, 2, 2] },
        mt_default: { color: "#ff0000" },
      },
    });
    expect(parsed.states["st_hot~1"]).toMatchObject({
      nodeId: lightId,
      overrides: { [lightId]: { "transform.position": [3, 10, 2] } },
    });
    // split states get disambiguated names
    expect(parsed.states.st_hot.name).not.toBe(parsed.states["st_hot~1"].name);
  });

  it("rewrites transitions per owner, duplicating across split states", () => {
    const { doc, cubeId, lightId } = legacyDoc();
    const parsed = validateDocument(doc);

    const enters = parsed.interactions.filter(
      (ix) => ix.trigger.type === "hoverEnter",
    );
    expect(enters.map((ix) => ix.action)).toEqual([
      expect.objectContaining({ type: "transition", nodeId: cubeId, to: "st_hot" }),
      expect.objectContaining({ type: "transition", nodeId: lightId, to: "st_hot~1" }),
    ]);

    // "to base" fans out to every node that owns a state
    const exits = parsed.interactions.filter(
      (ix) => ix.trigger.type === "hoverExit",
    );
    expect(new Set(exits.map((ix) => (ix.action.type === "transition" ? ix.action.nodeId : "")))).toEqual(
      new Set([cubeId, lightId]),
    );
    for (const ix of exits) {
      expect(ix.action).toMatchObject({ type: "transition", to: "base" });
    }

    // non-state actions pass through untouched
    expect(
      parsed.interactions.find((ix) => ix.id === "ix_play")?.action,
    ).toEqual({ type: "playAnimation", animationId: "an_x" });
  });

  it("leaves new-format documents untouched and stays idempotent", () => {
    const { doc } = legacyDoc();
    const once = validateDocument(doc);
    const twice = validateDocument(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});
