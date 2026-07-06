type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * pre-parse migration for legacy (≤ M5) documents where states were
 * scene-level. splits each scene state into per-object states (material
 * overrides attach to the first mesh using the material) and rewrites
 * transition/toggle actions to name the owner object — duplicating an
 * interaction when the old state touched several objects. new-format
 * documents pass through untouched. ids stay deterministic (`old~n`) so
 * migrating twice is idempotent.
 */
export function migrateDocument(data: unknown): unknown {
  if (!isRec(data) || !isRec(data.states)) return data;
  const legacy = Object.values(data.states).some(
    (s) => isRec(s) && s.nodeId === undefined,
  );
  if (!legacy) return data;

  const nodes = isRec(data.nodes) ? data.nodes : {};
  const materialOwner = new Map<string, string>();
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (isRec(node) && typeof node.materialId === "string" && !materialOwner.has(node.materialId)) {
      materialOwner.set(node.materialId, nodeId);
    }
  }

  const states: Rec = {};
  // old stateId -> the per-node states it split into
  const splits = new Map<string, { id: string; nodeId: string }[]>();
  for (const [oldId, state] of Object.entries(data.states)) {
    if (!isRec(state) || oldId === "base") continue;
    const overrides = isRec(state.overrides) ? state.overrides : {};
    const byOwner = new Map<string, Rec>();
    for (const [targetId, props] of Object.entries(overrides)) {
      const owner = nodes[targetId] ? targetId : materialOwner.get(targetId);
      if (!owner) continue; // override of a deleted/unowned target
      const bucket = byOwner.get(owner) ?? {};
      bucket[targetId] = props;
      byOwner.set(owner, bucket);
    }
    const owners = [...byOwner.entries()];
    const split: { id: string; nodeId: string }[] = [];
    owners.forEach(([nodeId, ov], i) => {
      const id = i === 0 ? oldId : `${oldId}~${i}`;
      const node = nodes[nodeId];
      const nodeName = isRec(node) && typeof node.name === "string" ? node.name : nodeId;
      states[id] = {
        id,
        nodeId,
        name: owners.length > 1 ? `${String(state.name)} · ${nodeName}` : state.name,
        overrides: ov,
      };
      split.push({ id, nodeId });
    });
    splits.set(oldId, split);
  }

  const statefulNodes = [
    ...new Set(Object.values(states).map((s) => (s as Rec).nodeId as string)),
  ];

  const interactions: unknown[] = [];
  const raw = Array.isArray(data.interactions) ? data.interactions : [];
  for (const ix of raw) {
    if (!isRec(ix) || !isRec(ix.action)) continue;
    const action = ix.action as Rec;
    if (action.type === "transition") {
      // "to base" meant the whole scene -> one per-object interaction per stateful node
      const targets =
        action.to === "base"
          ? statefulNodes.map((nodeId) => ({ id: "base", nodeId }))
          : (splits.get(String(action.to)) ?? []);
      targets.forEach((t, i) =>
        interactions.push({
          ...ix,
          id: i === 0 ? ix.id : `${String(ix.id)}~${i}`,
          action: { ...action, nodeId: t.nodeId, to: t.id },
        }),
      );
    } else if (action.type === "toggleStates") {
      const a = action.a === "base" ? [] : (splits.get(String(action.a)) ?? []);
      const b = action.b === "base" ? [] : (splits.get(String(action.b)) ?? []);
      const nodeIds = [...new Set([...a, ...b].map((s) => s.nodeId))];
      nodeIds.forEach((nodeId, i) =>
        interactions.push({
          ...ix,
          id: i === 0 ? ix.id : `${String(ix.id)}~${i}`,
          action: {
            ...action,
            nodeId,
            a: a.find((s) => s.nodeId === nodeId)?.id ?? "base",
            b: b.find((s) => s.nodeId === nodeId)?.id ?? "base",
          },
        }),
      );
    } else {
      interactions.push(ix);
    }
  }

  return { ...data, states, interactions };
}
