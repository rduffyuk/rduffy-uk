import { useState, useEffect, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { GraphScene } from "./GraphScene";
import { DetailCard } from "./DetailCard";
import type { JourneyData, PositionedNode } from "./types";

interface Props {
  data: JourneyData;
}

export default function JourneyScrollytelling({ data }: Props) {
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
          <Canvas
            camera={{ position: [0, 0, 14], fov: 45 }}
            style={{ background: "#09090b" }}
          >
            <GraphScene
              data={data}
              currentIndex={currentIndex}
              onNodeClick={handleNodeClick}
            />
          </Canvas>

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
                i === currentIndex ? "rgba(168,85,247,0.06)" : "#0f0f13",
              borderColor:
                i === currentIndex
                  ? "rgba(168,85,247,0.3)"
                  : "var(--color-border, #1e293b)",
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
              {m.nodes.map((n) => (
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
