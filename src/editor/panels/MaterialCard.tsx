"use client";

import { Trash2, X } from "lucide-react";
import { DEFAULT_MATERIAL_ID, type ChibiMaterial } from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { clearOverride } from "../store/stateCommands";
import {
  deleteMaterial,
  materialUsageCount,
  renameMaterial,
  setMaterialProp,
} from "../store/materialCommands";
import { disposeMaterial } from "../viewport/materials";
import {
  LabeledRow,
  TEXTURE_SLOTS,
  TextureSlotRow,
  useOverrides,
} from "./inspectorShared";
import { Checkbox, ColorInput, DragNumber, Slider, TextInput } from "./controls";
import { MaterialPreviewSphere } from "./MaterialPreviewSphere";

// card target: selection wins (mesh -> material ?? Default, model -> assigned,
// else none); no selection -> pinned id from Materials list. re-reads
// doc.materials so a deleted target hides vs going stale
function useCardMaterial(): ChibiMaterial | undefined {
  const selectedId = useUI((s) => s.selectedId);
  const pinnedId = useUI((s) => s.materialCardPinnedId);
  return useDoc((s) => {
    const doc = s.doc;
    if (!doc) return undefined;
    let materialId: string | undefined;
    if (selectedId) {
      const node = doc.nodes[selectedId];
      if (node?.type === "mesh") materialId = node.materialId ?? DEFAULT_MATERIAL_ID;
      else if (node?.type === "model") materialId = node.materialId;
      else materialId = undefined;
    } else {
      materialId = pinnedId ?? undefined;
    }
    return materialId ? doc.materials[materialId] : undefined;
  });
}

export function confirmAndDeleteMaterial(materialId: string): void {
  const material = useDoc.getState().doc?.materials[materialId];
  if (!material) return;
  const used = materialUsageCount(materialId);
  const others = used - 1;
  if (
    others > 0 &&
    !window.confirm(
      `"${material.name}" is used by ${others} other object${others > 1 ? "s" : ""}. Reassign them to Default and delete?`,
    )
  ) {
    return;
  }
  deleteMaterial(materialId);
  disposeMaterial(materialId);
}

function MaterialBody({ material }: { material: ChibiMaterial }) {
  const activeStateId = useUI((s) => s.activeStateId);
  const overrides = useOverrides(material.id);

  const effColor = (overrides?.color as string | undefined) ?? material.color;
  const effOpacity = (overrides?.opacity as number | undefined) ?? material.opacity;

  const mk = (prop: string) => ({ mergeKey: `mat:${material.id}:${prop}` });
  const commitMetalness = (v: number, merge: boolean) =>
    setMaterialProp(material.id, { metalness: v }, merge ? mk("metalness") : undefined);
  const commitRoughness = (v: number, merge: boolean) =>
    setMaterialProp(material.id, { roughness: v }, merge ? mk("roughness") : undefined);
  const commitOpacity = (v: number, merge: boolean) =>
    setMaterialProp(material.id, { opacity: v }, merge ? mk("opacity") : undefined);
  const commitEmissiveIntensity = (v: number, merge: boolean) =>
    setMaterialProp(
      material.id,
      { emissiveIntensity: v },
      merge ? mk("emissiveIntensity") : undefined,
    );
  const commitClearcoat = (v: number, merge: boolean) =>
    setMaterialProp(material.id, { clearcoat: v }, merge ? mk("clearcoat") : undefined);
  const commitClearcoatRoughness = (v: number, merge: boolean) =>
    setMaterialProp(
      material.id,
      { clearcoatRoughness: v },
      merge ? mk("clearcoatRoughness") : undefined,
    );
  const commitSheen = (v: number, merge: boolean) =>
    setMaterialProp(material.id, { sheen: v }, merge ? mk("sheen") : undefined);

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <LabeledRow
        label="Color"
        overridden={overrides?.color !== undefined}
        onReset={() => clearOverride(activeStateId, material.id, "color")}
      >
        <ColorInput
          value={effColor}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { color: v },
              merge ? mk("color") : undefined,
            )
          }
        />
      </LabeledRow>
      <LabeledRow
        label="Metalness"
        scrub={{ value: material.metalness, onCommit: commitMetalness, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={material.metalness} onCommit={commitMetalness} />
      </LabeledRow>
      <LabeledRow
        label="Roughness"
        scrub={{ value: material.roughness, onCommit: commitRoughness, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={material.roughness} onCommit={commitRoughness} />
      </LabeledRow>
      <LabeledRow
        label="Clearcoat"
        scrub={{ value: material.clearcoat, onCommit: commitClearcoat, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={material.clearcoat} onCommit={commitClearcoat} />
      </LabeledRow>
      <LabeledRow
        label="Coat rough"
        scrub={{ value: material.clearcoatRoughness, onCommit: commitClearcoatRoughness, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={material.clearcoatRoughness} onCommit={commitClearcoatRoughness} />
      </LabeledRow>
      <LabeledRow
        label="Sheen"
        scrub={{ value: material.sheen, onCommit: commitSheen, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={material.sheen} onCommit={commitSheen} />
      </LabeledRow>
      {material.sheen > 0 && (
        <LabeledRow label="Sheen tint">
          <ColorInput
            value={material.sheenColor}
            onCommit={(v, merge) =>
              setMaterialProp(
                material.id,
                { sheenColor: v },
                merge ? mk("sheenColor") : undefined,
              )
            }
          />
        </LabeledRow>
      )}
      <LabeledRow
        label="Opacity"
        overridden={overrides?.opacity !== undefined}
        onReset={() => clearOverride(activeStateId, material.id, "opacity")}
        scrub={{ value: effOpacity, onCommit: commitOpacity, step: 0.01, min: 0, max: 1 }}
      >
        <Slider value={effOpacity} onCommit={commitOpacity} />
      </LabeledRow>
      <LabeledRow label="Emissive">
        <ColorInput
          value={material.emissive}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { emissive: v },
              merge ? mk("emissive") : undefined,
            )
          }
        />
      </LabeledRow>
      <LabeledRow
        label="Intensity"
        scrub={{ value: material.emissiveIntensity, onCommit: commitEmissiveIntensity, step: 0.1, min: 0 }}
      >
        <DragNumber
          value={material.emissiveIntensity}
          min={0}
          step={0.1}
          onCommit={commitEmissiveIntensity}
        />
      </LabeledRow>
      <div className="flex gap-4 pl-18">
        <Checkbox
          label="Transparent"
          checked={material.transparent}
          onChange={(v) => setMaterialProp(material.id, { transparent: v })}
        />
        <Checkbox
          label="Flat"
          checked={material.flatShading}
          onChange={(v) => setMaterialProp(material.id, { flatShading: v })}
        />
      </div>
      {TEXTURE_SLOTS.map(({ slot, label }) => (
        <TextureSlotRow key={slot} material={material} slot={slot} label={label} />
      ))}
    </div>
  );
}

/**
 * Floating card owning all material editing — Inspector's Material section is
 * just a chip that opens this. hidden when no target resolves (deselect);
 * open flag persists so it reappears on the next resolvable target
 */
export function MaterialCard() {
  const open = useUI((s) => s.materialCardOpen);
  const inspectorOpen = useUI((s) => s.inspectorOpen);
  const close = useUI((s) => s.closeMaterialCard);
  const material = useCardMaterial();
  if (!open || !material) return null;

  return (
    <div
      className={`absolute bottom-3 z-20 flex max-h-[min(600px,calc(100%-24px))] w-64 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur ${
        inspectorOpen ? "right-[272px]" : "right-3"
      }`}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MaterialPreviewSphere material={material} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Material
          </span>
          <TextInput
            value={material.name}
            onCommit={(v) => renameMaterial(material.id, v)}
          />
        </div>
        {material.id !== DEFAULT_MATERIAL_ID && (
          <button
            type="button"
            title="Delete material"
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            onClick={() => confirmAndDeleteMaterial(material.id)}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          title="Close"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={close}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MaterialBody material={material} />
      </div>
    </div>
  );
}
