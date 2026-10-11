import Link from "next/link";
import { Box } from "lucide-react";

export function SiteHeader({ current }: { current: "demo" | "keyboard" | "keycaps" | "docs" }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link href="/" aria-label="Chibi home" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Box aria-hidden="true" className="size-5 text-primary" /> chibi
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 text-sm">
          {([
            ["demo", "/demo", "Playground"],
            ["keyboard", "/demo/keyboard", "Keyboard"],
            ["keycaps", "/demo/keycaps", "Keycaps"],
          ] as const).map(([id, href, label]) => (
            <Link key={id} href={href} aria-current={current === id ? "page" : undefined}
              className={current === id ? "font-medium text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
              {label}
            </Link>
          ))}
          <Link href="/" className="rounded-md border border-border bg-card px-3 py-2 text-foreground transition-colors hover:bg-muted">
            Create a scene
          </Link>
        </nav>
      </div>
    </header>
  );
}
