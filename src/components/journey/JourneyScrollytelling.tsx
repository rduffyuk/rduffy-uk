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
      { threshold: 0.5 }
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [data]);

  const handleNodeClick = useCallback((node: PositionedNode) => setSelectedNode(node), []);

  const milestone = data.milestones[currentIndex];
  const selectedMilestone = selectedNode
    ? data.milestones.find((m) => m.nodes.some((n) => n.id === selectedNode.id)) ?? null
    : null;

  return (
    <div>
      {/* Sticky graph */}
      <div style={{ position: "sticky", top: 57, height: "60vh", zIndex: 5 }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderBottom: "1px solid #1e293b" }}>
          <Canvas camera={{ position: [0, 0, 14], fov: 45 }} style={{ background: "#09090b" }}>
            <GraphScene data={data} currentIndex={currentIndex} onNodeClick={handleNodeClick} />
          </Canvas>

          {/* Current milestone overlay */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 24px",
            background: "linear-gradient(transparent, rgba(9,9,11,0.95))",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00d4ff" }}>{milestone?.date}</span>
            <span style={{ width: 1, height: 16, background: "#1e293b" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{milestone?.title}</span>
          </div>

          <DetailCard node={selectedNode} milestone={selectedMilestone} onClose={() => setSelectedNode(null)} />
        </div>
      </div>

      {/* Scrollable milestone cards */}
      <div ref={cardsRef} style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 32 }}>
          Scroll to explore the timeline
        </p>
        {data.milestones.map((m, i) => (
          <div
            key={m.date}
            data-idx={i}
            style={{
              marginBottom: 32,
              padding: 24,
              background: i === currentIndex ? "rgba(168,85,247,0.06)" : "#0f0f13",
              border: `1px solid ${i === currentIndex ? "rgba(168,85,247,0.3)" : "#1e293b"}`,
              borderRadius: 12,
              transition: "all 0.4s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i <= currentIndex ? "#a855f7" : "#334155",
                boxShadow: i === currentIndex ? "0 0 10px rgba(168,85,247,0.5)" : "none",
                transition: "all 0.4s ease",
              }} />
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00d4ff" }}>{m.date}</span>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", margin: 0 }}>{m.title}</h3>
            <p style={{ fontSize: 14, color: "#cbd5e1", marginTop: 6, lineHeight: 1.6 }}>{m.description}</p>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {m.nodes.map((n) => (
                <span key={n.id} style={{
                  fontSize: 10, fontFamily: "JetBrains Mono, monospace", padding: "2px 8px", borderRadius: 6,
                  border: `1px solid ${n.color}44`, color: n.color, background: `${n.color}15`,
                }}>
                  {n.label}
                </span>
              ))}
            </div>
            {m.blogEpisode && (
              <a href={m.blogEpisode} target="_blank" rel="noopener noreferrer"
                 style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#a855f7" }}>
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
