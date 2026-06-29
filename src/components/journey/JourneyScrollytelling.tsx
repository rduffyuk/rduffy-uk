import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { DetailCard } from "./DetailCard";
import type { JourneyData, PositionedNode } from "./types";

// Three.js graph is lazy-loaded so its ~1MB chunk doesn't block first paint.
const GraphCanvas = lazy(() => import("./GraphCanvas"));

interface Props {
  data: JourneyData;
}

// Track the site's light/dark theme (data-theme attribute, falling back to the
// OS preference) so the 3D canvas and cards follow the toggle.
function useIsDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const check = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light") return setDark(false);
      if (attr === "dark") return setDark(true);
      setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    check();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", check); observer.disconnect(); };
  }, []);
  return dark;
}

export default function JourneyScrollytelling({ data }: Props) {
  const dark = useIsDark();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState<PositionedNode | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardsRef.current) return;
    const cards = cardsRef.current.querySelectorAll("[data-idx]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.idx);
            if (!isNaN(idx)) setCurrentIndex(idx);
          }
        }
      },
      { threshold: 0.5 },
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [data]);

  const handleNodeClick = useCallback(
    (node: PositionedNode) => setSelectedNode(node),
    [],
  );

  const milestone = data.milestones[currentIndex];
  const selectedMilestone = selectedNode
    ? (data.milestones.find((m) =>
        m.nodes.some((n) => n.id === selectedNode.id),
      ) ?? null)
    : null;

  return (
    <div className="journey-layout">
      {/* Sticky graph */}
      <div className="journey-canvas">
        <div className="journey-canvas-inner">
          <Suspense
            fallback={
              <div
                className="journey-graph-skeleton"
                style={{ background: dark ? "#09090b" : "#f7f6f2" }}
              >
                <span className="journey-graph-skeleton-text">Loading the map…</span>
              </div>
            }
          >
            <GraphCanvas
              data={data}
              currentIndex={currentIndex}
              onNodeClick={handleNodeClick}
              dark={dark}
            />
          </Suspense>

          <div className="journey-overlay">
            <span className="journey-overlay-date">{milestone?.date}</span>
            <span className="journey-overlay-sep" />
            <span className="journey-overlay-title">{milestone?.title}</span>
          </div>

          <DetailCard
            node={selectedNode}
            milestone={selectedMilestone}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      </div>

      {/* Scrollable milestone cards */}
      <div ref={cardsRef} className="journey-cards">
        <p className="journey-hint">Scroll to explore the timeline</p>
        {data.milestones.map((m, i) => (
          <div
            key={m.date}
            data-idx={i}
            className="journey-card"
            style={{
              background:
                i === currentIndex ? "rgba(168,85,247,0.12)" : "var(--color-card)",
              borderColor:
                i === currentIndex
                  ? "rgba(168,85,247,0.45)"
                  : "var(--color-border)",
            }}
          >
            <div className="journey-card-header">
              <span
                className="journey-dot"
                style={{
                  background: i <= currentIndex ? "#a855f7" : "#334155",
                  boxShadow:
                    i === currentIndex
                      ? "0 0 10px rgba(168,85,247,0.5)"
                      : "none",
                }}
              />
              <span className="journey-card-date">{m.date}</span>
            </div>
            <h3 className="journey-card-title">{m.title}</h3>
            <p className="journey-card-desc">{m.description}</p>
            <div className="journey-card-tags">
              {(m.tags ?? m.nodes).map((n) => (
                <span
                  key={n.id}
                  style={{
                    border: `1px solid ${n.color}44`,
                    color: n.color,
                    background: `${n.color}15`,
                  }}
                  className="journey-tag"
                >
                  {n.label}
                </span>
              ))}
            </div>
            {m.link && (
              <a href={m.link.href} className="journey-card-link">
                {m.link.label} →
              </a>
            )}
            {m.blogEpisode && (
              <a
                href={m.blogEpisode}
                target="_blank"
                rel="noopener noreferrer"
                className="journey-card-link"
              >
                Read blog episode →
              </a>
            )}
          </div>
        ))}
        <div style={{ height: "30vh" }} />
      </div>
    </div>
  );
}
