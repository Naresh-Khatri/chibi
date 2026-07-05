import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-ink">chibi</h1>
          <p className="mt-2 max-w-md text-sm text-ink-dim">
            A web-native 3D editor. Design interactive scenes in the browser,
            ship them as React components.
          </p>
        </div>
        <Link
          href="/editor/draft"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/85"
        >
          New scene
        </Link>
        <p className="text-xs text-ink-dim/70">
          Recent documents arrive in M3 — for now everything autosaves to the
          draft scene.
        </p>
      </div>
    </main>
  );
}
