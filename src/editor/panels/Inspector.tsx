"use client";

import {
  DEFAULT_MATERIAL_ID,
  ENVIRONMENT_PRESETS,
  GEOMETRY_DEFS,
  type LightNode,
  type MeshNode,
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
} from "../store/commands";
import {
  addMaterial,
  assignMaterial,
  deleteMaterial,
  materialUsageCount,
  renameMaterial,
  setDocumentName,
  setEnvironment,
  setGridVisible,
  setLightProp,
  setMaterialProp,
} from "../store/materialCommands";
import { disposeMaterial } from "../viewport/materials";
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-edge px-3 py-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function LabeledRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-ink-dim">{label}</span>
      {children}
    </div>
  );
}

function Vec3Row({
  label,
  value,
  onCommit,
  toDisplay = (v) => v,
  fromDisplay = (v) => v,
  step = 0.1,
}: {
  label: string;
  value: Vec3;
  onCommit: (axis: 0 | 1 | 2, v: number, merge: boolean) => void;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  step?: number;
}) {
  return (
    <LabeledRow label={label}>
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
      <div className="border-b border-edge px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
        Inspector
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
  if (!node) return null;
  const t = node.transform;

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

  return (
    <>
      <Section title="Node">
        <LabeledRow label="Name">
          <TextInput
            value={node.name}
            onCommit={(v) => setNodeName(nodeId, v)}
          />
        </LabeledRow>
        <div className="flex gap-4 pl-18">
          <Checkbox
            label="Visible"
            checked={node.visible}
            onChange={(v) => setNodeVisible(nodeId, v)}
          />
        </div>
        {node.type === "mesh" && (
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

      <Section title="Transform">
        <Vec3Row
          label="Position"
          value={t.position}
          onCommit={commitTf("position")}
        />
        <Vec3Row
          label="Rotation"
          value={t.rotation}
          step={1}
          toDisplay={(v) => Number((v * RAD2DEG).toFixed(1))}
          fromDisplay={(v) => v * DEG2RAD}
          onCommit={commitTf("rotation")}
        />
        <Vec3Row label="Scale" value={t.scale} onCommit={commitTf("scale")} />
      </Section>

      {node.type === "mesh" && <GeometrySection node={node} />}
      {node.type === "mesh" && <MaterialSection node={node} />}
      {node.type === "light" && <LightSection node={node} />}
    </>
  );
}

function GeometrySection({ node }: { node: MeshNode }) {
  const def = GEOMETRY_DEFS[node.geometry.kind];
  return (
    <Section title={`Geometry · ${def.label}`}>
      {def.params.map((param) => {
        const raw = node.geometry.params[param.key] ?? param.default;
        return (
          <LabeledRow key={param.key} label={param.label}>
            {param.type === "number" ? (
              <DragNumber
                value={typeof raw === "number" ? raw : Number(raw) || 0}
                min={param.min}
                max={param.max}
                step={param.step ?? 0.1}
                onCommit={(v, merge) =>
                  setGeometryParam(
                    node.id,
                    param.key,
                    param.step && param.step >= 1 ? Math.round(v) : v,
                    merge
                      ? { mergeKey: `geo:${node.id}:${param.key}` }
                      : undefined,
                  )
                }
              />
            ) : (
              <TextInput
                value={String(raw)}
                onCommit={(v) => setGeometryParam(node.id, param.key, v)}
              />
            )}
          </LabeledRow>
        );
      })}
    </Section>
  );
}

function MaterialSection({ node }: { node: MeshNode }) {
  const material = useDoc(
    (s) =>
      s.doc?.materials[node.materialId] ??
      s.doc?.materials[DEFAULT_MATERIAL_ID],
  );
  const materialList = useDoc((s) => s.doc?.materials);
  if (!material || !materialList) return null;

  const mk = (prop: string) => ({ mergeKey: `mat:${material.id}:${prop}` });
  const pickerItems: MenuItem[] = [
    ...Object.values(materialList).map((m) => ({
      label: m.id === material.id ? `✓ ${m.name}` : m.name,
      onSelect: () => assignMaterial(node.id, m.id),
    })),
    { divider: true },
    { label: "+ New material", onSelect: () => addMaterial(node.id) },
  ];

  const onDelete = () => {
    const used = materialUsageCount(material.id);
    const others = used - 1;
    if (
      others > 0 &&
      !window.confirm(
        `"${material.name}" is used by ${others} other object${others > 1 ? "s" : ""}. Reassign them to Default and delete?`,
      )
    ) {
      return;
    }
    deleteMaterial(material.id);
    disposeMaterial(material.id);
  };

  return (
    <Section title="Material">
      <div className="flex items-center gap-1">
        <Dropdown button={<>{material.name} ▾</>} items={pickerItems} />
        <span className="flex-1" />
        {material.id !== DEFAULT_MATERIAL_ID && (
          <button
            type="button"
            title="Delete material"
            className="text-ink-dim hover:text-red-400"
            onClick={onDelete}
          >
            ✕
          </button>
        )}
      </div>
      <LabeledRow label="Name">
        <TextInput
          value={material.name}
          onCommit={(v) => renameMaterial(material.id, v)}
        />
      </LabeledRow>
      <LabeledRow label="Color">
        <ColorInput
          value={material.color}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { color: v },
              merge ? mk("color") : undefined,
            )
          }
        />
      </LabeledRow>
      <LabeledRow label="Metalness">
        <Slider
          value={material.metalness}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { metalness: v },
              merge ? mk("metalness") : undefined,
            )
          }
        />
      </LabeledRow>
      <LabeledRow label="Roughness">
        <Slider
          value={material.roughness}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { roughness: v },
              merge ? mk("roughness") : undefined,
            )
          }
        />
      </LabeledRow>
      <LabeledRow label="Opacity">
        <Slider
          value={material.opacity}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { opacity: v },
              merge ? mk("opacity") : undefined,
            )
          }
        />
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
      <LabeledRow label="Intensity">
        <DragNumber
          value={material.emissiveIntensity}
          min={0}
          step={0.1}
          onCommit={(v, merge) =>
            setMaterialProp(
              material.id,
              { emissiveIntensity: v },
              merge ? mk("emissiveIntensity") : undefined,
            )
          }
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
      {(["Albedo", "Normal", "Roughness"] as const).map((slot) => (
        <LabeledRow key={slot} label={slot}>
          <div className="flex h-6 flex-1 items-center rounded border border-dashed border-edge px-1.5 text-[11px] text-ink-dim/60">
            texture — arrives in M3
          </div>
        </LabeledRow>
      ))}
    </Section>
  );
}

function LightSection({ node }: { node: LightNode }) {
  const light = node.light;
  const mk = (prop: string) => ({ mergeKey: `light:${node.id}:${prop}` });
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
      <LabeledRow label="Intensity">
        <DragNumber
          value={light.intensity}
          min={0}
          step={0.1}
          onCommit={(v, merge) =>
            setLightProp(
              node.id,
              { intensity: v },
              merge ? mk("intensity") : undefined,
            )
          }
        />
      </LabeledRow>
      {light.kind !== "directional" && (
        <LabeledRow label="Distance">
          <DragNumber
            value={light.distance ?? 0}
            min={0}
            step={0.5}
            onCommit={(v, merge) =>
              setLightProp(
                node.id,
                { distance: v },
                merge ? mk("distance") : undefined,
              )
            }
          />
        </LabeledRow>
      )}
      {light.kind === "spot" && (
        <>
          <LabeledRow label="Angle°">
            <DragNumber
              value={Number(((light.angle ?? Math.PI / 6) * RAD2DEG).toFixed(1))}
              min={1}
              max={89}
              step={1}
              onCommit={(v, merge) =>
                setLightProp(
                  node.id,
                  { angle: v * DEG2RAD },
                  merge ? mk("angle") : undefined,
                )
              }
            />
          </LabeledRow>
          <LabeledRow label="Penumbra">
            <Slider
              value={light.penumbra ?? 0.3}
              onCommit={(v, merge) =>
                setLightProp(
                  node.id,
                  { penumbra: v },
                  merge ? mk("penumbra") : undefined,
                )
              }
            />
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

function SceneInspector() {
  const name = useDoc((s) => s.doc?.name ?? "");
  const env = useDoc((s) => s.doc?.environment);
  const grid = useDoc((s) => s.doc?.editor.grid ?? true);
  if (!env) return null;

  const presetItems: MenuItem[] = [
    { label: "None", onSelect: () => setEnvironment({ preset: null }) },
    ...ENVIRONMENT_PRESETS.map((p) => ({
      label: env.preset === p ? `✓ ${p}` : p,
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
        <LabeledRow label="Preset">
          <Dropdown
            button={<>{env.preset ?? "None"} ▾</>}
            items={presetItems}
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
            <LabeledRow label="Near">
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
            <LabeledRow label="Far">
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
      <div className="px-3 py-4 text-xs text-ink-dim/70">
        Select an object to edit its transform, geometry and material.
      </div>
    </>
  );
}
