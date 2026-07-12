"use client";

import { RotateCcw } from "lucide-react";
import {
  BASE_STATE_ID,
  type ChibiMaterial,
  type PropertyValue,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import { setMaterialMap } from "../store/materialCommands";
import { importAssetFile } from "../store/assets";
import { Dropdown, useDragScrub, type MenuItem } from "./controls";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-3 py-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/** active-state overrides for a target (node or material id); undefined in base */
export function useOverrides(targetId: string): Record<string, PropertyValue> | undefined {
  const activeStateId = useUI((s) => s.activeStateId);
  return useDoc((s) =>
    activeStateId === BASE_STATE_ID
      ? undefined
      : s.doc?.states[activeStateId]?.overrides[targetId],
  );
}

export function ResetDot({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      title="Reset override to base value"
      onClick={onReset}
      className="shrink-0 text-primary transition-colors hover:text-destructive"
    >
      <RotateCcw className="size-3" />
    </button>
  );
}

export type ScrubConfig = {
  value: number;
  onCommit: (v: number, merge: boolean) => void;
  step?: number;
  min?: number;
  max?: number;
};

export function LabeledRow({
  label,
  children,
  overridden,
  onReset,
  scrub,
}: {
  label: string;
  children: React.ReactNode;
  overridden?: boolean;
  onReset?: () => void;
  scrub?: ScrubConfig;
}) {
  const scrubHandlers = useDragScrub(
    scrub ?? { value: 0, onCommit: () => {} },
  );
  return (
    <div
      className={`flex items-center gap-2 ${
        overridden ? "-mx-1 rounded px-1 ring-1 ring-primary/60" : ""
      }`}
    >
      <span
        className={`w-16 shrink-0 text-xs text-muted-foreground ${
          scrub ? "cursor-ew-resize select-none" : ""
        }`}
        {...(scrub ? scrubHandlers : undefined)}
      >
        {label}
      </span>
      {children}
      {overridden && onReset && <ResetDot onReset={onReset} />}
    </div>
  );
}

export const TEXTURE_SLOTS = [
  { slot: "map", label: "Albedo" },
  { slot: "normalMap", label: "Normal" },
  { slot: "roughnessMap", label: "Roughness" },
] as const;

export const IMAGE_TYPES = /^image\/(png|jpeg|webp)$/;

export function TextureSlotRow({
  material,
  slot,
  label,
}: {
  material: ChibiMaterial;
  slot: keyof ChibiMaterial["maps"];
  label: string;
}) {
  const assets = useDoc((s) => s.doc?.assets);
  const textures = assets
    ? Object.values(assets).filter((a) => a.kind === "texture")
    : [];
  const currentId = material.maps[slot];
  const current = currentId && assets ? assets[currentId] : undefined;

  const items: MenuItem[] = [
    {
      label: "None",
      checked: !currentId,
      onSelect: () => setMaterialMap(material.id, slot, null),
    },
    ...textures.map((t) => ({
      label: t.name,
      checked: t.id === currentId,
      onSelect: () => setMaterialMap(material.id, slot, t.id),
    })),
  ];

  return (
    <LabeledRow label={label}>
      <div
        className="min-w-0 flex-1 rounded border border-dashed border-border"
        title="Pick a texture or drop an image here"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (!file || !IMAGE_TYPES.test(file.type)) return;
          const asset = await importAssetFile(file, "texture");
          setMaterialMap(material.id, slot, asset.id);
        }}
      >
        <Dropdown
          button={<span className="truncate">{current?.name ?? "None"}</span>}
          items={items}
        />
      </div>
    </LabeledRow>
  );
}
