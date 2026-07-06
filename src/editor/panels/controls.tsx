"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox as UICheckbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider as UISlider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  labelClass = "text-muted-foreground",
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
    <div className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded-md border border-input bg-input/30 px-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
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
        className="w-full min-w-0 bg-transparent text-right text-xs text-foreground outline-none"
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
    <Input
      className="h-6 rounded-md px-1.5 text-xs focus-visible:ring-2 focus-visible:ring-ring/40 md:text-xs"
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
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
      <UICheckbox
        className="size-3.5 [&_svg]:size-3"
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
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
      <UISlider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onCommit(v, true)}
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">
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
        className="h-6 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent"
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
  | {
      divider?: false;
      label: string;
      onSelect: () => void;
      checked?: boolean;
      icon?: LucideIcon;
      destructive?: boolean;
    };

export function Dropdown({
  button,
  items,
  disabled,
  title,
  align = "left",
  chevron = true,
  triggerClassName,
}: {
  button: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  title?: string;
  align?: "left" | "right";
  chevron?: boolean;
  triggerClassName?: string;
}) {
  // any item carrying `checked` makes this a picker: render check indicators
  const isPicker = items.some((it) => !it.divider && it.checked !== undefined);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          title={title}
          disabled={disabled}
          className={cn("max-w-full min-w-0 font-normal", triggerClassName)}
        >
          {button}
          {chevron && <ChevronDown className="text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align === "right" ? "end" : "start"}
        className="w-auto min-w-40"
      >
        {items.map((item, i) =>
          item.divider ? (
            <DropdownMenuSeparator key={i} />
          ) : isPicker ? (
            <DropdownMenuCheckboxItem
              key={i}
              checked={item.checked ?? false}
              onSelect={item.onSelect}
              className="text-xs"
            >
              {item.icon && <item.icon className="size-3.5 text-muted-foreground" />}
              {item.label}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={i}
              onSelect={item.onSelect}
              variant={item.destructive ? "destructive" : "default"}
              className="text-xs"
            >
              {item.icon && <item.icon className="size-3.5 text-muted-foreground" />}
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
