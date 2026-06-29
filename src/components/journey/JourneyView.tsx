import { useState, useEffect, lazy, Suspense } from "react";
import type { JourneyData } from "./types";

// Both views are lazy so a machine that lands in 2D never downloads the ~1MB
// Three.js chunk that JourneyScrollytelling pulls in, and vice-versa.
const JourneyScrollytelling = lazy(() => import("./JourneyScrollytelling"));
const Journey2D = lazy(() => import("./Journey2D"));

type Mode = "3d" | "2d";

// Decide the default. An explicit saved choice always wins. Otherwise fall back
// to 2D for machines that clearly can't do the 3D scene well: reduced-motion,
// no WebGL, or very low core/memory. (A mid-range GPU can't be reliably probed
// up front, so the manual toggle is the real escape hatch for those.)
function detectDefault(): Mode {
  try {
    const saved = localStorage.getItem("journey-mode");
    if (saved === "2d" || saved === "3d") return saved;
  } catch {
    /* localStorage blocked (private mode / managed browser) — fall through */
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "2d";
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 2 || mem <= 2) return "2d";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return "2d";
  } catch {
    return "2d";
  }
  return "3d";
}

const Skeleton = () => (
  <div className="journey-graph-skeleton" style={{ minHeight: "60vh" }}>
    <span className="journey-graph-skeleton-text">Loading the map…</span>
  </div>
);

export default function JourneyView({ data }: { data: JourneyData }) {
  // null until the client decides (keeps SSR + first paint deterministic).
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setMode(detectDefault());
  }, []);

  const choose = (m: Mode) => {
    try {
      localStorage.setItem("journey-mode", m);
    } catch {
      /* ignore */
    }
    setMode(m);
  };

  if (mode === null) return <Skeleton />;

  return (
    <>
      <div className="journey-mode-toggle" role="group" aria-label="Journey view mode">
        <button
          type="button"
          data-active={mode === "3d"}
          aria-pressed={mode === "3d"}
          onClick={() => choose("3d")}
        >
          3D
        </button>
        <button
          type="button"
          data-active={mode === "2d"}
          aria-pressed={mode === "2d"}
          onClick={() => choose("2d")}
        >
          2D
        </button>
      </div>
      <Suspense fallback={<Skeleton />}>
        {mode === "3d" ? <JourneyScrollytelling data={data} /> : <Journey2D data={data} />}
      </Suspense>
    </>
  );
}
