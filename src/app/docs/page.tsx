import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Documentation | chibi",
  description: "Create a Chibi scene, export it, and add interactive 3D to your React app.",
};

const sections = [
  ["start", "Create and export"],
  ["installation", "Install the runtime"],
  ["embed", "Embed a scene"],
  ["interactions", "States and animation"],
  ["materials", "Change materials"],
  ["props", "Common props"],
  ["troubleshooting", "Troubleshooting"],
] as const;

function Code({ children }: { children: string }) {
  return <pre className="my-5 overflow-x-auto rounded-lg border border-border bg-card p-5 text-xs leading-6 text-foreground"><code>{children}</code></pre>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-border py-10">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader current="docs" />
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 md:grid-cols-[200px_minmax(0,1fr)] lg:gap-20">
        <aside>
          <nav aria-label="Documentation sections" className="md:sticky md:top-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">On this page</p>
            <div className="flex flex-wrap gap-x-5 gap-y-3 md:flex-col">
              {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</a>)}
            </div>
            <Link href="/demo" className="mt-8 inline-block text-sm text-primary underline underline-offset-4">Try the playground</Link>
          </nav>
        </aside>
        <main className="min-w-0 max-w-3xl text-sm leading-7 text-muted-foreground">
          <div className="pb-10">
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">Chibi documentation</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">From the editor<br />to your website.</h1>
            <p className="mt-5 max-w-xl text-base leading-7">Build a scene visually, export a file, and render it in React. Your objects, materials, animations, and interactions travel with the scene.</p>
          </div>

          <Section id="start" title="Create and export">
            <ol className="list-decimal space-y-3 pl-5 marker:text-primary">
              <li>Open the <Link href="/" className="text-foreground underline underline-offset-4">Chibi homepage</Link> and start a blank scene or choose a template. Prompt generation requires your own Mistral API key.</li>
              <li>Add objects, adjust their materials, and try your interactions in Preview.</li>
              <li>Export a <code className="text-foreground">.chibi.zip</code> file. It includes the scene and its assets. Place it in your app&apos;s public directory, for example <code className="text-foreground">public/scenes/hero.chibi.zip</code>.</li>
            </ol>
            <p className="mt-4">Editor scenes are saved locally in your browser. Export a copy to keep a portable backup.</p>
          </Section>

          <Section id="installation" title="Install the runtime">
            <p>The runtime uses React 19, React Three Fiber 9, and Three.js. In an existing React 19 app, install the runtime and its rendering peers:</p>
            <Code>{"pnpm add @chibi3d/runtime @react-three/fiber@^9.6.1 three@^0.185.1"}</Code>
            <p>The examples below use the core runtime API. The playground in this repository also includes development features that may be newer than the published package.</p>
          </Section>

          <Section id="embed" title="Embed a scene">
            <p>Give the scene a height. The canvas fills its container. In Next.js, put the component in a client file.</p>
            <Code>{`"use client";

import { ChibiScene } from "@chibi3d/runtime";

export default function HeroScene() {
  return (
    <ChibiScene
      src="/scenes/hero.chibi.zip"
      style={{ width: "100%", height: 480 }}
      fallback={<p>Loading scene…</p>}
      onError={(error) => console.error(error)}
    />
  );
}`}</Code>
            <p>Use <code>src</code> for a zip or JSON URL. Use <code>document</code> when you already have the parsed scene object. A standalone JSON file with external assets also needs an asset resolver.</p>
          </Section>

          <Section id="interactions" title="States and animation">
            <p>Hover and click actions authored in the editor work in the embed. You can also control the scene from ordinary buttons through an API ref.</p>
            <Code>{`"use client";

import { useRef } from "react";
import { ChibiScene, type ChibiSceneApi } from "@chibi3d/runtime";

export default function InteractiveScene() {
  const api = useRef<ChibiSceneApi>(null);

  return (
    <>
      <ChibiScene
        src="/scenes/hero.chibi.zip"
        api={api}
        onEvent={(event) => console.log(event)}
        style={{ height: 480 }}
      />
      <button onClick={() => api.current?.transitionTo("base")}>
        Reset states
      </button>
      <button onClick={() => api.current?.setPaused(true)}>
        Pause motion
      </button>
      <button onClick={() => api.current?.setPaused(false)}>
        Resume motion
      </button>
    </>
  );
}`}</Code>
            <p>Call <code>transitionTo(stateId)</code> to enter an authored state, or <code>play(animationId)</code> and <code>stop(animationId)</code> to control a clip. Use IDs from your scene file. Resetting states does not stop animation clips.</p>
            <p className="mt-3"><code>onEvent</code> reports interactions, state changes, and readiness. <code>getState()</code> returns the current state ID for each stateful node.</p>
            <Link href="/demo" className="mt-4 inline-block text-primary underline underline-offset-4">Try states and animation in the playground</Link>
          </Section>

          <Section id="materials" title="Change materials from your app">
            <p>Use a material&apos;s ID or name to change its color, roughness, or texture. These changes affect the mounted scene; they do not rewrite the exported file.</p>
            <Code>{`// With the API ref from the previous example,
// replace "Keycap" with a material name in your scene.
api.current?.setMaterial("Keycap", {
  color: "#8eb8a2",
  roughness: 0.65,
});`}</Code>
            <p>A shared material updates every object that uses it. Animated color or opacity may override a host change while an animation or transition runs.</p>
            <Link href="/demo/keycaps" className="mt-4 inline-block text-primary underline underline-offset-4">Try live colors and logos in the keycaps configurator</Link>
          </Section>

          <Section id="props" title="Common props">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] text-left text-sm">
                <caption className="sr-only">Frequently used ChibiScene props</caption>
                <thead className="bg-card text-foreground"><tr><th scope="col" className="p-3 font-medium">Prop</th><th scope="col" className="p-3 font-medium">What it does</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["src / document", "Load a scene URL or pass a parsed document."],
                    ["interactive", "Enable authored pointer interactions. Defaults to true."],
                    ["orbit", "Allow users to rotate the camera. Defaults to false."],
                    ["orthographic", "Use parallel projection matched to the scene camera. Available since runtime 0.5.0."],
                    ["environment", "Override rendering effects and lighting without resetting interactions. Available since runtime 0.5.0."],
                    ["transparent", "Composite the scene over the host page."],
                    ["pointerTargets / onPointerEvent", "Receive host input events for a stable list of node IDs."],
                    ["debug / onPerformance", "Inspect per-scene rendering diagnostics. Included in the unreleased 0.6.0 source."],
                    ["poster", "Show an image until the scene assets settle."],
                    ["lazy", "Wait to load until the scene approaches the viewport."],
                    ["pauseWhenOffscreen", "Pause rendering offscreen. Defaults to true."],
                    ["reducedMotion", "Disable pointer-driven motion. Follows the OS setting by default; click and hover transitions still play."],
                    ["dpr", "Set a pixel ratio or a range. Defaults to [1, 2]."],
                    ["onLoad / onError", "Handle settled assets or loading errors. Handle errors separately; settled does not mean every asset succeeded."],
                  ].map(([prop, description]) => <tr key={prop}><th scope="row" className="p-3 align-top font-mono text-xs font-normal text-foreground">{prop}</th><td className="p-3">{description}</td></tr>)}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="troubleshooting" title="If the scene does not appear">
            <ul className="list-disc space-y-3 pl-5 marker:text-primary">
              <li>Check that the container has a nonzero height.</li>
              <li>Open the scene URL directly to check the file is served. A path in your public folder starts with <code>/scenes/</code>, not <code>/public/scenes/</code>.</li>
              <li>Check <code>onError</code> and the browser console for invalid documents, missing assets, or WebGL errors.</li>
              <li>For remotely hosted scenes and textures, the host must allow cross-origin requests.</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-5 border-t border-border pt-6">
              <Link href="/demo" className="text-primary underline underline-offset-4">Scene playground</Link>
              <Link href="/demo/keyboard" className="text-primary underline underline-offset-4">Keyboard demo</Link>
              <Link href="/demo/keycaps" className="text-primary underline underline-offset-4">Keycaps configurator</Link>
              <Link href="/" className="text-primary underline underline-offset-4">Create a scene</Link>
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
