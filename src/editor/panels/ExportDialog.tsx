"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Code2,
  Copy,
  FileArchive,
  FileJson,
  PackageOpen,
  Share2,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDoc } from "../store/document";
import { exportCurrentDocument, fileBase } from "../store/files";

type Panel = "code" | "file";

const SECTIONS: {
  title: string;
  items: { id: Panel; label: string; hint: string; icon: LucideIcon }[];
}[] = [
  {
    title: "Web",
    items: [{ id: "code", label: "Code Export", hint: "React", icon: Code2 }],
  },
  {
    title: "Files",
    items: [
      { id: "file", label: "chibi File", hint: "Save a local copy", icon: PackageOpen },
    ],
  },
];

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
      {children}
    </code>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted/40">
      <pre className="overflow-x-auto p-3 pr-9 text-[11px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1.5 right-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        title="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
    </div>
  );
}

/** two exports every scene supports: bundled zip (assets included) and plain json (assets forbidden) */
function DownloadButtons() {
  const hasAssets = useDoc((s) => !!s.doc && Object.keys(s.doc.assets).length > 0);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => exportCurrentDocument("zip")}>
        <FileArchive /> Download .chibi.zip
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={hasAssets}
        title={hasAssets ? "Scene has bundled assets — use .chibi.zip" : undefined}
        onClick={() => exportCurrentDocument("json")}
      >
        <FileJson /> Download .chibi.json
      </Button>
    </div>
  );
}

function CodeExportPanel() {
  const hasAssets = useDoc((s) => !!s.doc && Object.keys(s.doc.assets).length > 0);
  const name = useDoc((s) => s.doc?.name ?? "scene");
  const filename = `${fileBase(name)}.chibi.${hasAssets ? "zip" : "json"}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-medium text-foreground">1. Download the scene file</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <InlineCode>.chibi.zip</InlineCode> bundles any GLB models or textures the scene
          references; <InlineCode>.chibi.json</InlineCode> is the plain document, for scenes
          with no assets.
        </p>
        <div className="mt-2">
          <DownloadButtons />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">2. Install the runtime</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          <InlineCode>@chibi3d/runtime</InlineCode> is a single React component that plays
          back an exported scene — geometry, materials, animations, states and click/hover
          interactions included. Works in Next.js, Vite, Remix, or any React 19 app with{" "}
          <InlineCode>three</InlineCode> and <InlineCode>@react-three/fiber</InlineCode>{" "}
          installed.
        </p>
        <div className="mt-2">
          <CodeBlock code="npm install @chibi3d/runtime" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">3. Render it</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Put the downloaded file somewhere your app can fetch by URL (e.g.{" "}
          <InlineCode>public/{filename}</InlineCode>), then:
        </p>
        <div className="mt-2">
          <CodeBlock
            code={`import { ChibiScene } from "@chibi3d/runtime";

export default function Scene() {
  return <ChibiScene src="/${filename}" className="h-[600px]" />;
}`}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pass a ref via the <InlineCode>api</InlineCode> prop to drive it imperatively —{" "}
          <InlineCode>api.current.play(animationId)</InlineCode> and{" "}
          <InlineCode>api.current.transitionTo(stateId)</InlineCode> — or listen for scene
          events with <InlineCode>onEvent</InlineCode>.
        </p>
      </div>
    </div>
  );
}

function FilePanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Save the scene document to disk. <InlineCode>.chibi.zip</InlineCode> bundles any
        GLB/texture assets alongside the JSON; <InlineCode>.chibi.json</InlineCode> is the
        plain document, for scenes with no assets. Reopen either later via File → Open
        file…
      </p>
      <DownloadButtons />
    </div>
  );
}

export function ExportDialog() {
  const [panel, setPanel] = useState<Panel>("code");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="xs">
          <Share2 /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Get this scene running outside the editor.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[12rem_1fr]">
          <nav className="flex flex-col gap-4 border-r bg-muted/30 p-3">
            {SECTIONS.map((section) => (
              <div
                key={section.title}
                className="flex flex-col gap-0.5"
              >
                <span className="px-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {section.title}
                </span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPanel(item.id)}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      panel === item.id && "bg-primary/15 text-primary",
                    )}
                  >
                    <item.icon className="mt-0.5 size-3.5 shrink-0" />
                    <span className="flex flex-col">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="max-h-[65vh] overflow-y-auto p-4">
            {panel === "code" ? <CodeExportPanel /> : <FilePanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
