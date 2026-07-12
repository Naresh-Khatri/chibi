"use client";

import { useMemo } from "react";
import {
  Boxes,
  Palette,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Ungroup,
  Zap,
} from "lucide-react";
import { Color } from "three";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_MATERIAL_ID,
  ENVIRONMENT_PRESETS,
  GEOMETRY_DEFS,
  TONE_MAPPINGS,
  type LightNode,
  type MeshNode,
  type ModelNode,
  type Vec3,
} from "@/runtime/schema";
import { useDoc } from "../store/document";
import { useUI } from "../store/ui";
import {
  setGeometryParam,
  setNodeName,
  setNodeShadow,
  setNodeVisible,
  setTransformComponent,
  splitModelNode,
} from "../store/commands";
import {
  convertToEditableMesh,
  increaseBaseSubdivision,
  setSubdivisions,
} from "../store/meshCommands";
import { getGltfScene, useRegistry } from "../viewport/objectRegistry";
import { clearOverride, requireBaseState } from "../store/stateCommands";
import {
  addMaterial,
  assignMaterial,
  setDocumentName,
  setEnvironment,
  setGridVisible,
  setLightProp,
} from "../store/materialCommands";
import { confirmAndDeleteMaterial } from "./MaterialCard";
import { InteractionList } from "./InteractionList";
import { ScrollBindingList } from "./ScrollBindingList";
import { StatesSection } from "./StatesSection";
import { LabeledRow, ResetDot, Section, useOverrides } from "./inspectorShared";
import {
  Checkbox,
  ColorInput,
  DragNumber,
  Dropdown,
  Slider,
  TextInput,
  type MenuItem,
} from "./controls";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const AXIS_LABELS = ["X", "Y", "Z"] as const;
const AXIS_CLASSES = ["text-red-400", "text-green-400", "text-blue-400"];

function Vec3Row({
  label,
  value,
  onCommit,
  toDisplay = (v) => v,
  fromDisplay = (v) => v,
  step = 0.1,
  overridden,
  onReset,
}: {
  label: string;
  value: Vec3;
  onCommit: (axis: 0 | 1 | 2, v: number, merge: boolean) => void;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  step?: number;
  overridden?: boolean;
  onReset?: () => void;
}) {
  return (
    <LabeledRow label={label} overridden={overridden} onReset={onReset}>
      <div className="flex min-w-0 flex-1 gap-1">
        {([0, 1, 2] as const).map((axis) => (
          <DragNumber
            key={axis}
            label={AXIS_LABELS[axis]}
            labelClass={AXIS_CLASSES[axis]}
            value={toDisplay(value[axis])}
            step={step}
            onCommit={(v, merge) => onCommit(axis, fromDisplay(v), merge)}
          />
        ))}
      </div>
    </LabeledRow>
  );
}

export function Inspector() {
  const selectedId = useUI((s) => s.selectedId);
  const hasNode = useDoc((s) =>
    selectedId ? Boolean(s.doc?.nodes[selectedId]) : false,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-muted-foreground">
        <SlidersHorizontal className="size-3" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasNode && selectedId ? (
          <NodeInspector nodeId={selectedId} />
        ) : (
          <SceneInspector />
        )}
      </div>
    </div>
  );
}

function NodeInspector({ nodeId }: { nodeId: string }) {
  const node = useDoc((s) => s.doc?.nodes[nodeId]);
  const tab = useUI((s) => s.inspectorTab);
  const setTab = useUI((s) => s.setInspectorTab);
  const interactionCount = useDoc(
    (s) =>
      s.doc?.interactions.filter(
        (ix) =>
          ix.trigger.type !== "start" &&
          ix.trigger.type !== "scroll" &&
          ix.trigger.nodeId === nodeId,
      ).length ?? 0,
  );
  const overrides = useOverrides(nodeId);
  const activeStateId = useUI((s) => s.activeStateId);
  if (!node) return null;

  const tabs = (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "design" | "interactions")}
      className="border-b px-2 py-1.5"
    >
      <TabsList className="w-full">
        <TabsTrigger value="design" className="text-xs">
          <Palette className="size-3.5" />
          Design
        </TabsTrigger>
        <TabsTrigger value="interactions" className="text-xs">
          <Zap className="size-3.5" />
          Interactions
          {interactionCount > 0 && (
            <span className="rounded-sm bg-primary/20 px-1 text-[10px] tabular-nums text-primary">
              {interactionCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (tab === "interactions") {
    return (
      <>
        {tabs}
        <Section title="Interactions">
          <InteractionList scope={{ kind: "node", nodeId }} />
        </Section>
      </>
    );
  }

  const t = {
    position:
      (overrides?.["transform.position"] as Vec3 | undefined) ??
      node.transform.position,
    rotation:
      (overrides?.["transform.rotation"] as Vec3 | undefined) ??
      node.transform.rotation,
    scale:
      (overrides?.["transform.scale"] as Vec3 | undefined) ?? node.transform.scale,
  };
  const visible = (overrides?.visible as boolean | undefined) ?? node.visible;

  const commitTf =
    (field: "position" | "rotation" | "scale") =>
    (axis: 0 | 1 | 2, v: number, merge: boolean) =>
      setTransformComponent(
        nodeId,
        field,
        axis,
        v,
        merge ? { mergeKey: `tf:${nodeId}:${field}:${axis}` } : undefined,
      );
  const tfOverrideProps = (field: "position" | "rotation" | "scale") => ({
    overridden: overrides?.[`transform.${field}`] !== undefined,
    onReset: () => clearOverride(activeStateId, nodeId, `transform.${field}`),
  });

  return (
    <>
      {tabs}
      <Section title="Node">
        <LabeledRow label="Name">
          <TextInput
            value={node.name}
            onCommit={(v) => setNodeName(nodeId, v)}
          />
        </LabeledRow>
        <div className="flex items-center gap-4 pl-18">
          <Checkbox
            label="Visible"
            checked={visible}
            onChange={(v) => setNodeVisible(nodeId, v)}
          />
          {overrides?.visible !== undefined && (
            <ResetDot
              onReset={() => clearOverride(activeStateId, nodeId, "visible")}
            />
          )}
        </div>
        {(node.type === "mesh" || node.type === "model") && (
          <div className="flex gap-4 pl-18">
            <Checkbox
              label="Cast shadow"
              checked={node.castShadow}
              onChange={(v) => setNodeShadow(nodeId, "castShadow", v)}
            />
            <Checkbox
              label="Receive"
              checked={node.receiveShadow}
              onChange={(v) => setNodeShadow(nodeId, "receiveShadow", v)}
            />
          </div>
        )}
      </Section>

      <Section title="States">
        <StatesSection nodeId={nodeId} />
      </Section>

      <Section title="Transform">
        <Vec3Row
          label="Position"
          value={t.position}
          onCommit={commitTf("position")}
          {...tfOverrideProps("position")}
        />
        <Vec3Row
          label="Rotation"
          value={t.rotation}
          step={1}
          toDisplay={(v) => Number((v * RAD2DEG).toFixed(1))}
          fromDisplay={(v) => v * DEG2RAD}
          onCommit={commitTf("rotation")}
          {...tfOverrideProps("rotation")}
        />
        <Vec3Row
          label="Scale"
          value={t.scale}
          onCommit={commitTf("scale")}
          {...tfOverrideProps("scale")}
        />
      </Section>

      {node.type === "mesh" && node.geometry.kind === "editableMesh" && (
        <EditableMeshSection node={node} />
      )}
      {node.type === "mesh" && node.geometry.kind !== "editableMesh" && (
        <GeometrySection node={node} />
      )}
      {(node.type === "mesh" ||
        (node.type === "model" && node.path !== undefined)) && (
        <MaterialSection node={node} />
      )}
      {node.type === "light" && <LightSection node={node} />}
      {node.type === "model" && <ModelSection node={node} />}
    </>
  );
}

function ModelSection({ node }: { node: ModelNode }) {
  const asset = useDoc((s) => s.doc?.assets[node.assetId]);
  useRegistry((s) => s.version);
  const isPart = node.path !== undefined;
  const gltfScene = isPart ? null : getGltfScene(node.assetId);
  return (
    <Section title={isPart ? "Model part" : "Model"}>
      <LabeledRow label="Asset">
        <span className="truncate text-xs text-foreground">
          {asset
            ? `${asset.name} · ${(asset.size / 1_000_000).toFixed(1)} MB`
            : "missing asset"}
        </span>
      </LabeledRow>
      {isPart ? (
        <div className="text-[11px] text-muted-foreground/70">
          Geometry comes from the source model; transform and material are
          yours to edit.
        </div>
      ) : (
        <>
          <Button
            variant="secondary"
            size="xs"
            className="w-full"
            disabled={!gltfScene}
            onClick={() => gltfScene && splitModelNode(node.id, gltfScene)}
          >
            <Ungroup />
            Split into objects
          </Button>
          <div className="text-[11px] text-muted-foreground/70">
            {gltfScene
              ? "Turns the internal hierarchy into editable objects — move, animate, hide, or delete each part."
              : "Embedded materials render as-is; internal hierarchy is read-only."}
          </div>
        </>
      )}
    </Section>
  );
}

function GeometrySection({ node }: { node: MeshNode }) {
  const geometry = node.geometry;
  if (geometry.kind === "editableMesh") return null; // handled by EditableMeshSection
  const def = GEOMETRY_DEFS[geometry.kind];
  // capsule/text3d have no cage generator yet — see cageFromGeometry
  const convertible = geometry.kind !== "capsule" && geometry.kind !== "text3d";
  return (
    <Section title={`Geometry · ${def.label}`}>
      {def.params.map((param) => {
        const raw = geometry.params[param.key] ?? param.default;
        const commit = (v: number, merge: boolean) =>
          setGeometryParam(
            node.id,
            param.key,
            param.step && param.step >= 1 ? Math.round(v) : v,
            merge ? { mergeKey: `geo:${node.id}:${param.key}` } : undefined,
          );
        const numValue = typeof raw === "number" ? raw : Number(raw) || 0;
        return (
          <LabeledRow
            key={param.key}
            label={param.label}
            scrub={
              param.type === "number"
                ? {
                    value: numValue,
                    onCommit: commit,
                    step: param.step,
                    min: param.min,
                    max: param.max,
                  }
                : undefined
            }
          >
            {param.type === "number" ? (
              param.min !== undefined && param.max !== undefined ? (
                <Slider
                  value={numValue}
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 0.1}
                  onCommit={commit}
                />
              ) : (
                <DragNumber
                  value={numValue}
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 0.1}
                  onCommit={commit}
                />
              )
            ) : (
              <TextInput
                value={String(raw)}
                onCommit={(v) => setGeometryParam(node.id, param.key, v)}
              />
            )}
          </LabeledRow>
        );
      })}
      <Button
        variant="secondary"
        size="xs"
        className="w-full"
        disabled={!convertible}
        onClick={() => convertToEditableMesh(node.id)}
      >
        <Boxes />
        Convert to Editable Mesh
      </Button>
      {!convertible && (
        <div className="text-[11px] text-muted-foreground/70">
          {def.label} can&apos;t be converted to an editable mesh yet.
        </div>
      )}
    </Section>
  );
}

function EditableMeshSection({ node }: { node: MeshNode }) {
  const geometry = node.geometry;
  const meshEditNodeId = useUI((s) => s.meshEditNodeId);
  const enterMeshEdit = useUI((s) => s.enterMeshEdit);
  if (geometry.kind !== "editableMesh") return null; // handled by GeometrySection
  const vertCount = geometry.positions.length / 3;
  const editing = meshEditNodeId === node.id;
  // predicted post-bake face count: 1st CC step = each n-gon -> n quads (sum
  // of degrees), each further step ×4. shown in tooltip so the destructive
  // rewrite is visible before the click
  const bakeSteps = Math.max(1, geometry.subdivisions);
  const bakedFaceCount =
    geometry.faces.reduce((sum, f) => sum + f.length, 0) * 4 ** (bakeSteps - 1);
  const commitLevel = (v: number, merge: boolean) =>
    setSubdivisions(
      node.id,
      v,
      merge ? { mergeKey: `subdiv:${node.id}` } : undefined,
    );
  return (
    <Section title="Geometry · Editable Mesh">
      <LabeledRow
        label="Level"
        scrub={{ value: geometry.subdivisions, onCommit: commitLevel, step: 1, min: 0, max: 4 }}
      >
        <Slider
          value={geometry.subdivisions}
          min={0}
          max={4}
          step={1}
          onCommit={commitLevel}
        />
      </LabeledRow>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="xs"
            className="w-full"
            onClick={() => increaseBaseSubdivision(node.id)}
          >
            <Plus />
            {/* bakes the Level above in one shot when >1 — no clicking once per step */}
            {geometry.subdivisions > 1
              ? `Increase Base Subdivision (+${geometry.subdivisions})`
              : "Increase Base Subdivision"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Rewrites the cage: {geometry.faces.length} → {bakedFaceCount} faces ·
          undo to revert
        </TooltipContent>
      </Tooltip>
      {editing ? (
        // active-edit controls (element mode, face ops, Done) live in the
        // floating MeshEditToolbar at the top of the viewport
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Editing — use the toolbar at the top of the viewport.
        </div>
      ) : (
        <Button
          variant="secondary"
          size="xs"
          className="w-full"
          onClick={() => {
            if (requireBaseState("edit the mesh")) enterMeshEdit(node.id);
          }}
        >
          <Pencil />
          Edit Mesh
        </Button>
      )}
      <div className="text-xs text-muted-foreground">
        {vertCount} verts · {geometry.faces.length} faces
      </div>
    </Section>
  );
}

function MaterialSection({ node }: { node: MeshNode | ModelNode }) {
  // model parts have no chibi material until one is assigned — they render
  // the GLB's embedded material; meshes always resolve to a material
  const isPart = node.type === "model";
  const material = useDoc((s) =>
    node.type === "mesh"
      ? (s.doc?.materials[node.materialId] ??
        s.doc?.materials[DEFAULT_MATERIAL_ID])
      : node.materialId !== undefined
        ? s.doc?.materials[node.materialId]
        : undefined,
  );
  const materialList = useDoc((s) => s.doc?.materials);
  const openMaterialCard = useUI((s) => s.openMaterialCard);
  if (!materialList) return null;

  if (!material) {
    const assignItems: MenuItem[] = [
      ...Object.values(materialList).map((m) => ({
        label: m.name,
        onSelect: () => assignMaterial(node.id, m.id),
      })),
      { divider: true },
      {
        label: "New material",
        icon: Plus,
        onSelect: () => addMaterial(node.id),
      },
    ];
    return (
      <Section title="Material">
        <div className="flex items-center gap-1">
          <Dropdown button={<>Embedded (GLB)</>} items={assignItems} />
        </div>
        <div className="text-[11px] text-muted-foreground/70">
          This part renders the model&apos;s embedded material — assign a
          material to restyle it.
        </div>
      </Section>
    );
  }

  const pickerItems: MenuItem[] = [
    ...(isPart
      ? ([
          {
            label: "Embedded (GLB)",
            onSelect: () => assignMaterial(node.id, null),
          },
          { divider: true },
        ] satisfies MenuItem[])
      : []),
    ...Object.values(materialList).map((m) => ({
      label: m.name,
      checked: m.id === material.id,
      onSelect: () => assignMaterial(node.id, m.id),
    })),
    { divider: true },
    {
      label: "New material",
      icon: Plus,
      onSelect: () => addMaterial(node.id),
    },
  ];

  return (
    <Section title="Material">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Edit material"
          onClick={() => openMaterialCard()}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-input/30 px-1.5 py-1 text-left hover:bg-input/50"
        >
          <span
            className="size-3.5 shrink-0 rounded-full border border-border/60"
            style={{ backgroundColor: material.color }}
          />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {material.name}
          </span>
        </button>
        <Dropdown
          button={<></>}
          items={pickerItems}
          title="Switch material"
          triggerClassName="shrink-0 px-1"
        />
      </div>
    </Section>
  );
}

function LightSection({ node }: { node: LightNode }) {
  const light = node.light;
  const mk = (prop: string) => ({ mergeKey: `light:${node.id}:${prop}` });
  const commitIntensity = (v: number, merge: boolean) =>
    setLightProp(node.id, { intensity: v }, merge ? mk("intensity") : undefined);
  const commitDistance = (v: number, merge: boolean) =>
    setLightProp(node.id, { distance: v }, merge ? mk("distance") : undefined);
  const commitAngle = (v: number, merge: boolean) =>
    setLightProp(node.id, { angle: v * DEG2RAD }, merge ? mk("angle") : undefined);
  const commitPenumbra = (v: number, merge: boolean) =>
    setLightProp(node.id, { penumbra: v }, merge ? mk("penumbra") : undefined);
  const angleDeg = Number(((light.angle ?? Math.PI / 6) * RAD2DEG).toFixed(1));
  return (
    <Section title={`Light · ${light.kind}`}>
      <LabeledRow label="Color">
        <ColorInput
          value={light.color}
          onCommit={(v, merge) =>
            setLightProp(node.id, { color: v }, merge ? mk("color") : undefined)
          }
        />
      </LabeledRow>
      <LabeledRow
        label="Intensity"
        scrub={{ value: light.intensity, onCommit: commitIntensity, step: 0.1, min: 0 }}
      >
        <DragNumber value={light.intensity} min={0} step={0.1} onCommit={commitIntensity} />
      </LabeledRow>
      {light.kind !== "directional" && (
        <LabeledRow
          label="Distance"
          scrub={{ value: light.distance ?? 0, onCommit: commitDistance, step: 0.5, min: 0 }}
        >
          <DragNumber
            value={light.distance ?? 0}
            min={0}
            step={0.5}
            onCommit={commitDistance}
          />
        </LabeledRow>
      )}
      {light.kind === "spot" && (
        <>
          <LabeledRow
            label="Angle°"
            scrub={{ value: angleDeg, onCommit: commitAngle, step: 1, min: 1, max: 89 }}
          >
            <Slider value={angleDeg} min={1} max={89} step={1} onCommit={commitAngle} />
          </LabeledRow>
          <LabeledRow
            label="Penumbra"
            scrub={{
              value: light.penumbra ?? 0.3,
              onCommit: commitPenumbra,
              step: 0.01,
              min: 0,
              max: 1,
            }}
          >
            <Slider value={light.penumbra ?? 0.3} onCommit={commitPenumbra} />
          </LabeledRow>
        </>
      )}
      <div className="pl-18">
        <Checkbox
          label="Cast shadow"
          checked={light.castShadow}
          onChange={(v) => setLightProp(node.id, { castShadow: v })}
        />
      </div>
    </Section>
  );
}

// starting edge color when the background gradient is switched on: a slightly
// darker tint of the background so the toggle reads immediately
function edgeTint(background: string): string {
  const color = new Color(background);
  color.offsetHSL(0, 0, -0.09);
  return `#${color.getHexString()}`;
}

function MaterialsSection() {
  const materials = useDoc((s) => s.doc?.materials);
  const nodes = useDoc((s) => s.doc?.nodes);
  const openMaterialCard = useUI((s) => s.openMaterialCard);
  // hooks rule: memo before the !materials early return
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of Object.values(nodes ?? {})) {
      if ((n.type === "mesh" || n.type === "model") && n.materialId) {
        map.set(n.materialId, (map.get(n.materialId) ?? 0) + 1);
      }
    }
    return map;
  }, [nodes]);
  if (!materials) return null;

  return (
    <Section title="Materials">
      <div className="flex flex-col gap-0.5">
        {Object.values(materials).map((m) => (
          <div
            key={m.id}
            className="group flex h-6 cursor-default items-center gap-2 rounded px-1.5 text-xs text-foreground hover:bg-muted"
            onClick={() => openMaterialCard(m.id)}
          >
            <span
              className="size-3.5 shrink-0 rounded-full border border-border/60"
              style={{ backgroundColor: m.color }}
            />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {counts.get(m.id) ?? 0}×
            </span>
            {m.id !== DEFAULT_MATERIAL_ID && (
              <button
                type="button"
                title="Delete material"
                className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmAndDeleteMaterial(m.id);
                }}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        size="xs"
        className="self-start"
        onClick={() => openMaterialCard(addMaterial())}
      >
        <Plus />
        New material
      </Button>
    </Section>
  );
}

function SceneInspector() {
  const name = useDoc((s) => s.doc?.name ?? "");
  const env = useDoc((s) => s.doc?.environment);
  const grid = useDoc((s) => s.doc?.editor.grid ?? true);
  if (!env) return null;

  const presetItems: MenuItem[] = [
    {
      label: "None",
      checked: env.preset === null,
      onSelect: () => setEnvironment({ preset: null }),
    },
    ...ENVIRONMENT_PRESETS.map((p) => ({
      label: p,
      checked: env.preset === p,
      onSelect: () => setEnvironment({ preset: p }),
    })),
  ];

  return (
    <>
      <Section title="Scene">
        <LabeledRow label="Name">
          <TextInput value={name} onCommit={setDocumentName} />
        </LabeledRow>
      </Section>
      <MaterialsSection />
      <Section title="Environment">
        <LabeledRow label="Background">
          <ColorInput
            value={env.background}
            onCommit={(v, merge) =>
              setEnvironment(
                { background: v },
                merge ? { mergeKey: "env:background" } : undefined,
              )
            }
          />
        </LabeledRow>
        <div className="pl-18">
          <Checkbox
            label="Gradient"
            checked={env.backgroundGradient !== null}
            onChange={(v) =>
              setEnvironment({
                backgroundGradient: v ? edgeTint(env.background) : null,
              })
            }
          />
        </div>
        {env.backgroundGradient && (
          <LabeledRow label="Edge color">
            <ColorInput
              value={env.backgroundGradient}
              onCommit={(v, merge) =>
                setEnvironment(
                  { backgroundGradient: v },
                  merge ? { mergeKey: "env:bggradient" } : undefined,
                )
              }
            />
          </LabeledRow>
        )}
        <LabeledRow label="Preset">
          <Dropdown button={<>{env.preset ?? "None"}</>} items={presetItems} />
        </LabeledRow>
        <LabeledRow label="Tone map">
          <Dropdown
            button={<>{env.toneMapping}</>}
            items={TONE_MAPPINGS.map((t) => ({
              label: t,
              checked: env.toneMapping === t,
              onSelect: () => setEnvironment({ toneMapping: t }),
            }))}
          />
        </LabeledRow>
        <LabeledRow
          label="Exposure"
          scrub={{
            value: env.exposure,
            onCommit: (v, merge) =>
              setEnvironment(
                { exposure: v },
                merge ? { mergeKey: "env:exposure" } : undefined,
              ),
            step: 0.05,
            min: 0.1,
            max: 2.5,
          }}
        >
          <Slider
            value={env.exposure}
            min={0.1}
            max={2.5}
            step={0.05}
            onCommit={(v, merge) =>
              setEnvironment(
                { exposure: v },
                merge ? { mergeKey: "env:exposure" } : undefined,
              )
            }
          />
        </LabeledRow>
        <div className="flex gap-4 pl-18">
          <Checkbox
            label="Shadows"
            checked={env.shadows}
            onChange={(v) => setEnvironment({ shadows: v })}
          />
          <Checkbox label="Grid" checked={grid} onChange={setGridVisible} />
        </div>
        <div className="flex gap-4 pl-18">
          <Checkbox
            label="Soft shadows"
            checked={env.softShadows}
            onChange={(v) => setEnvironment({ softShadows: v })}
          />
          <Checkbox
            label="Contact"
            checked={env.contactShadows}
            onChange={(v) => setEnvironment({ contactShadows: v })}
          />
        </div>
        <div className="flex gap-4 pl-18">
          <Checkbox
            label="AO"
            checked={env.ao}
            onChange={(v) => setEnvironment({ ao: v })}
          />
          <Checkbox
            label="Bloom"
            checked={env.bloom}
            onChange={(v) => setEnvironment({ bloom: v })}
          />
          <Checkbox
            label="Vignette"
            checked={env.vignette}
            onChange={(v) => setEnvironment({ vignette: v })}
          />
        </div>
        <div className="pl-18">
          <Checkbox
            label="Fog"
            checked={env.fog !== null}
            onChange={(v) =>
              setEnvironment({
                fog: v ? { color: env.background, near: 8, far: 40 } : null,
              })
            }
          />
        </div>
        {env.fog && (
          <>
            <LabeledRow label="Fog color">
              <ColorInput
                value={env.fog.color}
                onCommit={(v, merge) =>
                  setEnvironment(
                    { fog: { ...env.fog!, color: v } },
                    merge ? { mergeKey: "env:fogcolor" } : undefined,
                  )
                }
              />
            </LabeledRow>
            <LabeledRow
              label="Near"
              scrub={{
                value: env.fog.near,
                onCommit: (v, merge) =>
                  setEnvironment(
                    { fog: { ...env.fog!, near: v } },
                    merge ? { mergeKey: "env:fognear" } : undefined,
                  ),
                step: 0.5,
                min: 0,
              }}
            >
              <DragNumber
                value={env.fog.near}
                min={0}
                step={0.5}
                onCommit={(v, merge) =>
                  setEnvironment(
                    { fog: { ...env.fog!, near: v } },
                    merge ? { mergeKey: "env:fognear" } : undefined,
                  )
                }
              />
            </LabeledRow>
            <LabeledRow
              label="Far"
              scrub={{
                value: env.fog.far,
                onCommit: (v, merge) =>
                  setEnvironment(
                    { fog: { ...env.fog!, far: v } },
                    merge ? { mergeKey: "env:fogfar" } : undefined,
                  ),
                step: 1,
                min: 0.1,
              }}
            >
              <DragNumber
                value={env.fog.far}
                min={0.1}
                step={1}
                onCommit={(v, merge) =>
                  setEnvironment(
                    { fog: { ...env.fog!, far: v } },
                    merge ? { mergeKey: "env:fogfar" } : undefined,
                  )
                }
              />
            </LabeledRow>
          </>
        )}
      </Section>
      <Section title="Interactions · scene">
        <InteractionList scope={{ kind: "start" }} />
      </Section>
      <Section title="Scroll bindings">
        <ScrollBindingList />
      </Section>
      <div className="px-3 py-4 text-xs text-muted-foreground/70">
        Select an object to edit its transform, geometry and material.
      </div>
    </>
  );
}
