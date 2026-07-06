"use client";

import { useState } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Settings,
  Trash2,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox as UICheckbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider as UISlider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ColorInput,
  Checkbox as DenseCheckbox,
  DragNumber,
  Dropdown,
  Slider as DenseSlider,
  TextInput,
} from "@/editor/panels/controls";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

export default function ComponentsPage() {
  const [checked, setChecked] = useState(true);
  const [denseChecked, setDenseChecked] = useState(false);
  const [sliderValue, setSliderValue] = useState([0.5]);
  const [denseSlider, setDenseSlider] = useState(0.5);
  const [dragNumber, setDragNumber] = useState(1);
  const [color, setColor] = useState("#7c9cff");
  const [align, setAlign] = useState("left");
  const [tab, setTab] = useState("transform");
  const [selectValue, setSelectValue] = useState("mesh");
  const [pickerChecked, setPickerChecked] = useState(true);

  return (
    <TooltipProvider delayDuration={300}>
      <main className="min-h-dvh bg-background px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Components
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every shadcn/ui primitive and shared dense control used across
              the editor.
            </p>
          </div>

          <Section title="Button">
            <Row label="Variant">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </Row>
            <Row label="Size">
              <Button size="xs">Extra small</Button>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row label="Icon">
              <Button size="icon-xs" variant="outline">
                <Settings />
              </Button>
              <Button size="icon-sm" variant="outline">
                <Settings />
              </Button>
              <Button size="icon" variant="outline">
                <Settings />
              </Button>
              <Button size="icon-lg" variant="outline">
                <Settings />
              </Button>
              <Button variant="destructive" size="icon-sm">
                <Trash2 />
              </Button>
              <Button disabled>Disabled</Button>
            </Row>
          </Section>

          <Section title="Toggle / Toggle group">
            <Row label="Toggle">
              <Toggle aria-label="Bold">
                <Bold />
              </Toggle>
              <Toggle aria-label="Italic" variant="outline">
                <Italic />
              </Toggle>
            </Row>
            <Row label="Toggle group">
              <ToggleGroup
                type="single"
                variant="outline"
                value={align}
                onValueChange={(v) => v && setAlign(v)}
              >
                <ToggleGroupItem value="left" aria-label="Align left">
                  <AlignLeft />
                </ToggleGroupItem>
                <ToggleGroupItem value="center" aria-label="Align center">
                  <AlignCenter />
                </ToggleGroupItem>
                <ToggleGroupItem value="right" aria-label="Align right">
                  <AlignRight />
                </ToggleGroupItem>
              </ToggleGroup>
            </Row>
          </Section>

          <Section title="Input">
            <Row label="Input">
              <Input placeholder="Scene name…" className="max-w-48" />
            </Row>
            <Row label="Dense (panel)">
              <TextInput
                value="Cube"
                onCommit={() => {}}
                placeholder="Node name…"
              />
            </Row>
          </Section>

          <Section title="Checkbox">
            <Row label="Checkbox">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <UICheckbox
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                />
                Visible
              </label>
            </Row>
            <Row label="Dense (panel)">
              <DenseCheckbox
                checked={denseChecked}
                onChange={setDenseChecked}
                label="Cast shadow"
              />
            </Row>
          </Section>

          <Section title="Slider">
            <Row label="Slider">
              <UISlider
                className="max-w-48"
                value={sliderValue}
                onValueChange={setSliderValue}
                min={0}
                max={1}
                step={0.01}
              />
            </Row>
            <Row label="Dense (panel)">
              <div className="max-w-48 flex-1">
                <DenseSlider value={denseSlider} onCommit={setDenseSlider} />
              </div>
            </Row>
            <Row label="Drag number">
              <div className="max-w-32">
                <DragNumber
                  value={dragNumber}
                  onCommit={setDragNumber}
                  label="X"
                />
              </div>
            </Row>
            <Row label="Color">
              <div className="max-w-48">
                <ColorInput value={color} onCommit={setColor} />
              </div>
            </Row>
          </Section>

          <Section title="Select">
            <Row label="Select">
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mesh">Mesh</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="camera">Camera</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section title="Tabs">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="transform">Transform</TabsTrigger>
                <TabsTrigger value="material">Material</TabsTrigger>
                <TabsTrigger value="states">States</TabsTrigger>
              </TabsList>
              <TabsContent value="transform" className="pt-2 text-muted-foreground">
                Position, rotation, scale.
              </TabsContent>
              <TabsContent value="material" className="pt-2 text-muted-foreground">
                Color, roughness, metalness.
              </TabsContent>
              <TabsContent value="states" className="pt-2 text-muted-foreground">
                Per-object states and transitions.
              </TabsContent>
            </Tabs>
          </Section>

          <Section title="Dropdown menu">
            <Row label="Raw primitive">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Actions
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem>Rename</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Row>
            <Row label="Dense (panel)">
              <Dropdown
                button={<span>Blend mode</span>}
                items={[
                  {
                    label: "Normal",
                    checked: pickerChecked,
                    onSelect: () => setPickerChecked(true),
                  },
                  {
                    label: "Additive",
                    checked: !pickerChecked,
                    onSelect: () => setPickerChecked(false),
                  },
                  { divider: true },
                  { label: "Delete", destructive: true, onSelect: () => {} },
                ]}
              />
            </Row>
          </Section>

          <Section title="Tooltip">
            <Row label="Tooltip">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-sm">
                    <Settings />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scene settings</TooltipContent>
              </Tooltip>
            </Row>
          </Section>

          <Section title="Separator">
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Horizontal</span>
              <Separator />
            </div>
            <div className="flex h-10 items-center gap-2">
              <span className="text-xs text-muted-foreground">Vertical</span>
              <Separator orientation="vertical" />
              <span className="text-xs text-muted-foreground">Right side</span>
            </div>
          </Section>

          <Section title="Scroll area">
            <ScrollArea className="h-32 rounded-lg border">
              <div className="flex flex-col gap-1 p-3">
                {Array.from({ length: 20 }, (_, i) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    Node {i + 1}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Section>
        </div>
      </main>
    </TooltipProvider>
  );
}
