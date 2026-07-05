"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

function formatNumber(v: number): string {
  return String(Number(v.toFixed(3)));
}

export function DragNumber({
  value,
  onCommit,
  step = 0.1,
  min,
  max,
  label,
  labelClass = "text-ink-dim",
}: {
  value: number;
  onCommit: (v: number, merge: boolean) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
  labelClass?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ startValue: number; acc: number } | null>(null);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    drag.current = { startValue: value, acc: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onLabelPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    drag.current.acc += e.movementX;
    const scale = e.shiftKey ? 10 : 1;
    const raw = drag.current.startValue + drag.current.acc * step * 0.5 * scale;
    const snapped = step >= 1 ? Math.round(raw) : raw;
    onCommit(clamp(Number(snapped.toFixed(4))), true);
  };
  const onLabelPointerUp = () => {
    drag.current = null;
  };

  const commitText = (text: string) => {
    const parsed = parseFloat(text);
    if (!Number.isNaN(parsed)) onCommit(clamp(parsed), false);
    setEditing(null);
  };

  return (
    <div className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded bg-panel-2 px-1.5 focus-within:ring-1 focus-within:ring-accent">
      {label && (
        <span
          className={`cursor-ew-resize select-none text-[10px] font-semibold ${labelClass}`}
          onPointerDown={onLabelPointerDown}
          onPointerMove={onLabelPointerMove}
          onPointerUp={onLabelPointerUp}
        >
          {label}
        </span>
      )}
      <input
        className="w-full min-w-0 bg-transparent text-right text-xs text-ink outline-none"
        value={editing ?? formatNumber(value)}
        onFocus={(e) => {
          setEditing(formatNumber(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setEditing(e.currentTarget.value)}
        onBlur={(e) => commitText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setEditing(null);
            e.currentTarget.blur();
          }
          e.stopPropagation();
        }}
      />
    </div>
  );
}

export function TextInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <input
      className="h-6 w-full min-w-0 rounded bg-panel-2 px-1.5 text-xs text-ink outline-none focus:ring-1 focus:ring-accent"
      value={editing ?? value}
      placeholder={placeholder}
      onFocus={() => setEditing(value)}
      onChange={(e) => setEditing(e.currentTarget.value)}
      onBlur={(e) => {
        onCommit(e.currentTarget.value);
        setEditing(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setEditing(null);
          e.currentTarget.blur();
        }
        e.stopPropagation();
      }}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink">
      <input
        type="checkbox"
        className="accent-accent"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {label}
    </label>
  );
}

export function Slider({
  value,
  onCommit,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value: number;
  onCommit: (v: number, merge: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        className="min-w-0 flex-1 accent-accent"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onCommit(parseFloat(e.currentTarget.value), true)}
      />
      <span className="w-8 shrink-0 text-right text-xs text-ink">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function toFullHex(v: string): string {
  if (!HEX_RE.test(v)) return "#000000";
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return v.toLowerCase();
}

export function ColorInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string, merge: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        type="color"
        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-edge bg-transparent"
        value={toFullHex(value)}
        onChange={(e) => onCommit(e.currentTarget.value, true)}
      />
      <TextInput
        value={value}
        onCommit={(v) => {
          if (HEX_RE.test(v.trim())) onCommit(toFullHex(v.trim()), false);
        }}
      />
    </div>
  );
}

export type MenuItem =
  | { divider: true }
  | { divider?: false; label: string; onSelect: () => void };

export function Dropdown({
  button,
  items,
  disabled,
  title,
  align = "left",
}: {
  button: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1 rounded px-2 text-xs ${
          disabled
            ? "cursor-not-allowed text-ink-dim/50"
            : open
              ? "bg-panel-2 text-ink"
              : "text-ink hover:bg-panel-2"
        }`}
      >
        {button}
      </button>
      {open && (
        <div
          className={`absolute top-8 z-50 min-w-40 rounded-md border border-edge bg-panel py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 border-t border-edge" />
            ) : (
              <button
                key={i}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-panel-2"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
