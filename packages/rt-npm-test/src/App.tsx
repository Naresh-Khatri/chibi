import { useEffect, useRef, useState } from "react";
import {
  ChibiScene,
  loadDocument,
  type ChibiSceneApi,
  type LoadedScene,
  type RuntimeEvent,
} from "@chibi3d/runtime";

type LogEntry = { id: number; at: string; json: string };

type SceneMeta = {
  file: string;
  title: string;
  blurb: string;
};

const SCENES: SceneMeta[] = [
  {
    file: "keyboard",
    title: "Cute keyboard",
    blurb:
      "A lowpoly keyboard — hover any key to press it. Each key owns its own per-node state + hoverEnter/hoverExit interactions. The mascot blinks on a loop.",
  },
  {
    file: "orrery",
    title: "Orrery",
    blurb:
      "Hierarchy stress: moons of moons and a 12-level comet-tail chain of nested groups, all driven by one clip with dozens of rotation tracks. Click a planet to select it.",
  },
  {
    file: "metropolis",
    title: "Metropolis",
    blurb:
      "Node-count stress: ~900 nodes of foggy night city, spot-lit streets, step-keyframe beacon blinks and a patrolling blimp. Hover a tall tower to lift it out of the fog.",
  },
  {
    file: "gallery",
    title: "Gallery",
    blurb:
      "Material/geometry stress: every geometry kind at extreme params, a 7×7 metalness×roughness sweep (~74 materials), breathing glass opacity and an animated neon sign. Hover an exhibit.",
  },
  {
    file: "arcade",
    title: "Arcade",
    blurb:
      "Interaction stress: a 5×5 lights-out board of click-toggled tiles, simon pads layering hover + click on the same node, 9 overlapping whack-a-mole bonk clips and a lever whose knob drives its parent group.",
  },
  {
    file: "hyrule",
    title: "Hyrule",
    blurb:
      "Lowpoly Zelda-style overworld, all flat-shaded primitives. Click the sword to draw it (one-shot clip), click the chest to open its pivot-group lid, click rupees to collect them (scale-0 = uncollectable again), hover the shrine eye.",
  },
  {
    file: "hero",
    title: "Hero",
    blurb: "The hand-authored demo scene from the main app.",
  },
];

function App() {
  const api = useRef<ChibiSceneApi>(null);
  const [sceneFile, setSceneFile] = useState<string>(SCENES[0].file);
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const logSeq = useRef(0);

  useEffect(() => {
    let active = true;
    let loaded: LoadedScene | null = null;
    setScene(null);
    setLog([]);
    setPaused(false);
    loadDocument(`/scenes/${sceneFile}.chibi.json`).then((res) => {
      if (!active) {
        res.dispose();
        return;
      }
      loaded = res;
      setScene(res);
    });
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, [sceneFile]);

  const doc = scene?.doc;
  const meta = SCENES.find((s) => s.file === sceneFile) ?? SCENES[0];

  const pushEvent = (e: RuntimeEvent) => {
    const entry: LogEntry = {
      id: logSeq.current++,
      at: new Date().toLocaleTimeString(undefined, { hour12: false }),
      json: JSON.stringify(e),
    };
    setLog((prev) => [entry, ...prev].slice(0, 30));
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0b0b0f", color: "#d4d4d8" }}>
      <div style={{ flex: "1 1 75%", position: "relative" }}>
        {doc && (
          <ChibiScene
            key={sceneFile}
            document={doc}
            resolveAsset={scene?.resolveAsset}
            api={api}
            orbit
            onEvent={pushEvent}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        {!doc && (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "#71717a" }}>
            loading scene…
          </div>
        )}
      </div>

      <div style={{ flex: "1 1 25%", maxWidth: 420, padding: 24, overflowY: "auto", fontFamily: "monospace", fontSize: 12 }}>
        <h1 style={{ fontSize: 16, marginBottom: 4 }}>@chibi3d/runtime — npm smoke test</h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
          {SCENES.map((s) => (
            <button
              key={s.file}
              onClick={() => setSceneFile(s.file)}
              style={{
                ...btnStyle,
                ...(s.file === sceneFile
                  ? { background: "#312e81", border: "1px solid #6366f1", color: "#e0e7ff" }
                  : {}),
              }}
            >
              {s.title}
            </button>
          ))}
        </div>

        <p style={{ color: "#71717a", marginBottom: 8 }}>{meta.blurb}</p>
        {doc && (
          <p style={{ color: "#52525b", marginBottom: 16 }}>
            {Object.keys(doc.nodes).length} nodes · {Object.keys(doc.materials).length} materials ·{" "}
            {Object.keys(doc.animations).length} animations · {Object.keys(doc.states).length} states ·{" "}
            {doc.interactions.length} interactions
          </p>
        )}

        {doc && (
          <>
            <div style={{ color: "#71717a", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 8 }}>
              animations
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {Object.values(doc.animations).map((a) => (
                <button key={a.id} onClick={() => api.current?.play(a.id)} style={btnStyle}>
                  play("{a.name}")
                </button>
              ))}
              {Object.values(doc.animations).map((a) => (
                <button key={`stop-${a.id}`} onClick={() => api.current?.stop(a.id)} style={btnStyle}>
                  stop("{a.name}")
                </button>
              ))}
              <button
                onClick={() => {
                  api.current?.setPaused(!paused);
                  setPaused(!paused);
                }}
                style={btnStyle}
              >
                setPaused({String(!paused)})
              </button>
            </div>
          </>
        )}

        <div style={{ color: "#71717a", textTransform: "uppercase", letterSpacing: 1, fontSize: 10, marginBottom: 8 }}>
          onEvent log
        </div>
        <div style={{ height: 200, overflowY: "auto", border: "1px solid #27272a", borderRadius: 8, padding: 8 }}>
          {log.length === 0 && <div style={{ color: "#52525b" }}>waiting for events…</div>}
          {log.map((entry) => (
            <div key={entry.id} style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "#52525b" }}>{entry.at}</span> {entry.json}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  color: "#d4d4d8",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 11,
};

export default App;
