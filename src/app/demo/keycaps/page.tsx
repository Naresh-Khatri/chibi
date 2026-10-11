"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Check, Copy, Minus, Plus, Shuffle } from "lucide-react";
import {
  ChibiScene,
  loadDocument,
  type ChibiSceneApi,
  type LoadedScene,
  type RuntimeEvent,
} from "@/runtime";
import {
  buildKeyboard,
  defaultConfig,
  keyMaterialPatch,
  LOGOS,
  MAX_COLS,
  MAX_ROWS,
  MIN_SIZE,
  parseConfig,
  resolveLogoUrl,
  resize,
  type KeyboardConfig,
  type KeyConfig,
} from "./keyboard";

const KIT_SRC = "/scenes/keycaps.chibi.zip";

// one key per line -> diff/paste friendly
function stringify(config: KeyboardConfig): string {
  const keys = config.keys.map((k) => `    ${JSON.stringify(k)}`).join(",\n");
  return `{\n  "rows": ${config.rows},\n  "cols": ${config.cols},\n  "keys": [\n${keys}\n  ]\n}`;
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function KeycapsDemoPage() {
  const api = useRef<ChibiSceneApi>(null);
  const [kit, setKit] = useState<LoadedScene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<KeyboardConfig>(() => defaultConfig());
  const configRef = useRef(config);
  // doc only rebuilds on layout changes; per-key edits go through setMaterial
  const [layout, setLayout] = useState<KeyboardConfig>(config);
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const [pressedKeys, setPressedKeys] = useState<ReadonlySet<number>>(() => new Set());
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastCall, setLastCall] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let scene: LoadedScene | null = null;
    loadDocument(KIT_SRC)
      .then((loaded) => {
        scene = loaded;
        if (live) setKit(loaded);
        else loaded.dispose();
      })
      .catch(() => {
        if (live) setLoadError("The keycaps could not load. Refresh the page to try again.");
      });
    return () => {
      live = false;
      scene?.dispose();
    };
  }, []);

  const doc = useMemo(() => (kit ? buildKeyboard(kit.doc, layout) : null), [kit, layout]);

  const pushKey = (i: number, key: KeyConfig, logo: boolean) => {
    const scene = api.current;
    if (!scene) return;
    const n = i + 1;
    scene.setMaterial(`key:${n}`, keyMaterialPatch(key, scene.getState()[`key_${n}`] === `st_key_${n}`));
    if (logo) {
      const map = resolveLogoUrl(key.logo);
      scene.setMaterial(`logo:${n}`, map
        ? { map, mapFit: "contain", mapColor: "#ffffff", opacity: 1, color: "#ffffff" }
        : { map: null, opacity: 0 });
    }
  };

  const selectKey = (i: number) => {
    const live = configRef.current;
    if (!live.keys[i]) return;
    setSelected([Math.floor(i / live.cols), i % live.cols]);
  };

  const onEvent = (e: RuntimeEvent) => {
    const live = configRef.current;
    if (e.type === "ready") {
      const states = api.current?.getState() ?? {};
      setPressedKeys(new Set(live.keys.flatMap((_, i) => states[`key_${i + 1}`] === `st_key_${i + 1}` ? [i] : [])));
      live.keys.forEach((key, i) => pushKey(i, key, true));
    }
    if (e.type === "stateChange") {
      const match = /^key_(\d+)$/.exec(e.nodeId);
      if (!match) return;
      const i = Number(match[1]) - 1;
      const key = live.keys[i];
      if (!key) return;
      // stateChange is emitted before getState() reflects the new state.
      const pressed = e.stateId === `st_key_${i + 1}`;
      api.current?.setMaterial(`key:${i + 1}`, keyMaterialPatch(key, pressed));
      setPressedKeys((previous) => {
        const next = new Set(previous);
        if (pressed) next.add(i);
        else next.delete(i);
        return next;
      });
    }
    if (e.type === "interaction" && e.trigger.type === "click") {
      const match = /^key_(\d+)$/.exec(e.trigger.nodeId);
      if (match) selectKey(Number(match[1]) - 1);
    }
  };

  const replaceConfig = (next: KeyboardConfig) => {
    configRef.current = next;
    setConfig(next);
  };

  const applyLayout = (next: KeyboardConfig) => {
    setPressedKeys(new Set());
    replaceConfig(next);
    setLayout(next);
    setLastCall(`buildKeyboard(kit, { rows: ${next.rows}, cols: ${next.cols}, keys })`);
  };

  const setSize = (rows: number, cols: number) => {
    const next = resize(config, rows, cols);
    if (next.rows !== config.rows || next.cols !== config.cols) applyLayout(next);
  };

  const row = Math.min(selected[0], config.rows - 1);
  const col = Math.min(selected[1], config.cols - 1);
  const index = row * config.cols + col;
  const current = config.keys[index];

  const update = (patch: Partial<KeyConfig>) => {
    const key = { ...current, ...patch };
    replaceConfig({ ...config, keys: config.keys.map((k, i) => (i === index ? key : k)) });
    pushKey(index, key, "logo" in patch);
    setLastCall(
      "logo" in patch
        ? `api.setMaterial("logo:${index + 1}", { map: ${JSON.stringify(resolveLogoUrl(key.logo))}, mapFit: "contain", mapColor: "#ffffff" })`
        : `api.setMaterial("key:${index + 1}", { color: "${key.color}" })`,
    );
  };

  const shuffle = (field: keyof KeyConfig) => {
    const values = shuffled(config.keys.map((k) => k[field]));
    const keys = config.keys.map((k, i) => ({ ...k, [field]: values[i] }));
    replaceConfig({ ...config, keys });
    keys.forEach((key, i) => pushKey(i, key, field === "logo"));
  };

  const json = stringify(config);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const applyDraft = () => {
    if (draft === null) return;
    let parsed: KeyboardConfig | null = null;
    try {
      parsed = parseConfig(JSON.parse(draft));
    } catch {
      // fall through to the error below
    }
    if (!parsed) {
      setDraftError("expected { rows, cols, keys: [{ color, logo }] }");
      return;
    }
    setDraft(null);
    setDraftError(null);
    applyLayout(parsed);
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary/30">
      <SiteHeader current="keycaps" />

      <section className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-12 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground">
            Your keyboard.
            <br />
            <span className="text-primary">Your colors.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Pick a key, give it a color, and add a logo. Resize the keyboard
            or shuffle the palette to try something unexpected.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Stepper
              label="rows"
              value={config.rows}
              min={MIN_SIZE}
              max={MAX_ROWS}
              onChange={(rows) => setSize(rows, config.cols)}
            />
            <Stepper
              label="cols"
              value={config.cols}
              min={MIN_SIZE}
              max={MAX_COLS}
              onChange={(cols) => setSize(config.rows, cols)}
            />
          </div>

          <div
            className="mt-4 grid w-fit gap-1.5"
            style={{ gridTemplateColumns: `repeat(${config.cols}, ${config.cols > 8 ? "2rem" : "2.75rem"})` }}
          >
            {config.keys.map((key, i) => {
              const active = i === index;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectKey(i)}
                  aria-label={`Select key ${i + 1}`}
                  aria-pressed={active}
                  title={`key:${i + 1}`}
                  style={{
                    backgroundColor: key.color,
                    borderColor: pressedKeys.has(i) ? key.color : undefined,
                    boxShadow: pressedKeys.has(i) ? `0 0 6px ${key.color}66, 0 0 14px ${key.color}26` : undefined,
                  }}
                  className={`grid aspect-square place-items-center rounded-lg border-2 transition-colors ${
                    active ? "border-primary" : "border-transparent"
                  }`}
                >
                  {key.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveLogoUrl(key.logo) ?? undefined}
                      alt=""
                      className="size-1/2 object-contain brightness-0 invert"
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Hover a key in the 3D view to press it. Click a key to edit it.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono text-muted-foreground">key:{index + 1}</span>
            <input
              aria-label="Selected key color"
              type="color"
              value={current.color}
              onChange={(e) => update({ color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-card"
            />
            <LogoUrlInput
              key={`${index}:${current.logo ?? ""}`}
              logo={current.logo}
              onApply={(logo) => update({ logo })}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Enter an image URL or a logo name from thesvg.org, such as react.
            Remote hosts must allow CORS.
            Clear the URL and apply to remove the logo.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ToolButton onClick={() => shuffle("color")}>
              <Shuffle className="size-3" />
              shuffle colors
            </ToolButton>
            <ToolButton onClick={() => shuffle("logo")}>
              <Shuffle className="size-3" />
              shuffle logos
            </ToolButton>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-5 text-foreground">
            {lastCall ?? <span className="text-muted-foreground">edit a key or resize the grid…</span>}
          </div>

          <details className="mt-6 border-t border-border pt-4">
            <summary className="mb-4 cursor-pointer text-sm text-muted-foreground">Edit keyboard configuration</summary>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] text-muted-foreground">config.json</span>
              <div className="flex gap-2">
                {draft !== null && (
                  <>
                    <ToolButton
                      onClick={() => {
                        setDraft(null);
                        setDraftError(null);
                      }}
                    >
                      discard
                    </ToolButton>
                    <ToolButton onClick={applyDraft}>apply</ToolButton>
                  </>
                )}
                <ToolButton onClick={copy}>
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "copied" : "copy"}
                </ToolButton>
              </div>
            </div>
            <textarea
              aria-label="Keyboard configuration JSON"
              value={draft ?? json}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              rows={10}
              className="w-full resize-y rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-5 text-foreground outline-none focus:border-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {draftError ? (
                <span className="text-destructive">{draftError}</span>
              ) : (
                "paste a config here and apply"
              )}
            </p>
          </details>
          <Link href="/docs#materials" className="mt-6 inline-block text-sm text-primary underline underline-offset-4">Learn how live material changes work</Link>
        </div>

        <div className="relative aspect-[874/615] min-w-0 overflow-hidden rounded-2xl border border-border bg-background lg:sticky lg:top-6">
          {doc && kit && (
            <ChibiScene
              document={doc}
              resolveAsset={kit.resolveAsset}
              api={api}
              onEvent={onEvent}
              orbit
              className="h-full w-full"
              onError={() => setLoadError("The 3D keycaps could not load. Refresh the page to try again.")}
            />
          )}
          {!doc && !loadError && <div role="status" className="grid h-full place-items-center text-sm text-muted-foreground">Loading keycaps...</div>}
          {loadError && <div role="alert" className="absolute inset-0 grid place-items-center bg-card px-8 text-center text-sm text-muted-foreground">{loadError}</div>}
        </div>
      </section>
    </main>
  );
}

function LogoUrlInput({ logo, onApply }: { logo: string | null; onApply: (logo: string | null) => void }) {
  const [value, setValue] = useState(logo ?? "");
  return (
    <form
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(resolveLogoUrl(value) ? value.trim() : null);
      }}
    >
      <label htmlFor="keycap-logo-url">Logo</label>
      <input
        id="keycap-logo-url"
        type="text"
        list="keycap-logos"
        title="Enter an image URL or a logo name from thesvg.org."
        placeholder="react or https://example.com/logo.svg"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-muted px-2 font-mono text-foreground"
      />
      <datalist id="keycap-logos">
        {LOGOS.map((name) => <option key={name} value={name} />)}
      </datalist>
      <button type="submit" className="h-8 rounded-lg border border-border bg-muted px-3 text-foreground">
        Apply
      </button>
    </form>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const btn =
    "grid size-8 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono text-muted-foreground">{label}</span>
      <div className="flex items-center rounded-lg border border-border bg-card">
        <button type="button" aria-label={`Decrease ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="size-3" />
        </button>
        <span className="w-6 text-center font-mono text-foreground">{value}</span>
        <button type="button" aria-label={`Increase ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      {children}
    </button>
  );
}
