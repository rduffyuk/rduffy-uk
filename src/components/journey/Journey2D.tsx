import { useState, useEffect } from "react";
import type { JourneyData } from "./types";

interface Props {
  data: JourneyData;
}

export default function Journey2D({ data }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (activeIndex >= data.milestones.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setActiveIndex((i) => i + 1), 2200);
    return () => clearTimeout(timer);
  }, [playing, activeIndex, data.milestones.length]);

  const allNodes = data.milestones.flatMap((m, mi) =>
    m.nodes.map((n) => ({ ...n, milestoneIndex: mi }))
  );

  const visibleNodes = allNodes.filter((n) => n.milestoneIndex <= activeIndex);
  const visibleEdges = data.milestones
    .slice(0, activeIndex + 1)
    .flatMap((m) => m.edges)
    .filter((e) => visibleNodes.some((n) => n.id === e.from) && visibleNodes.some((n) => n.id === e.to));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 11, padding: "6px 16px", borderRadius: 8,
            border: "1px solid rgba(168,85,247,0.3)", background: "#0f0f13", color: "#a855f7", cursor: "pointer",
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play All"}
        </button>
        <button
          onClick={() => { setActiveIndex(0); setPlaying(false); }}
          style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 11, padding: "6px 16px", borderRadius: 8,
            border: "1px solid #1e293b", background: "#0f0f13", color: "#94a3b8", cursor: "pointer",
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Node cloud */}
      <div style={{
        background: "#0f0f13", border: "1px solid #1e293b", borderRadius: 16, padding: 32,
        display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", minHeight: 120, marginBottom: 32,
      }}>
        {visibleNodes.map((n) => (
          <span
            key={n.id}
            style={{
              fontSize: 12, fontFamily: "JetBrains Mono, monospace", padding: "6px 14px", borderRadius: 8,
              border: `1px solid ${n.color}55`, color: n.color, background: `${n.color}12`,
              transition: "all 0.5s ease", animation: "fadeIn 0.5s ease",
            }}
          >
            {n.label}
          </span>
        ))}
        {visibleNodes.length === 0 && (
          <span style={{ color: "#64748b", fontSize: 13 }}>Click Play to begin...</span>
        )}
      </div>

      {/* Connection count */}
      <div style={{ textAlign: "center", marginBottom: 32, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#64748b" }}>
        {visibleNodes.length} components · {visibleEdges.length} connections
      </div>

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: 24 }}>
        {/* Vertical line */}
        <div style={{
          position: "absolute", left: 11, top: 0, bottom: 0, width: 2,
          background: `linear-gradient(180deg, #a855f7 ${((activeIndex + 1) / data.milestones.length) * 100}%, #1e293b ${((activeIndex + 1) / data.milestones.length) * 100}%)`,
          transition: "background 0.5s ease",
        }} />

        {data.milestones.map((m, i) => (
          <div
            key={m.date}
            onClick={() => { setActiveIndex(i); setPlaying(false); }}
            style={{
              position: "relative", marginBottom: 24, paddingLeft: 32, cursor: "pointer",
              opacity: i <= activeIndex ? 1 : 0.4, transition: "opacity 0.4s ease",
            }}
          >
            {/* Dot */}
            <div style={{
              position: "absolute", left: -1, top: 6, width: 12, height: 12, borderRadius: "50%",
              background: i <= activeIndex ? "#a855f7" : "#1e293b",
              border: i === activeIndex ? "2px solid #a855f7" : "2px solid #1e293b",
              boxShadow: i === activeIndex ? "0 0 12px rgba(168,85,247,0.5)" : "none",
              transition: "all 0.4s ease",
            }} />

            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00d4ff" }}>{m.date}</span>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: i === activeIndex ? "#a855f7" : "#f1f5f9", margin: "4px 0", transition: "color 0.3s" }}>
              {m.title}
            </h3>
            <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5, margin: 0 }}>{m.description}</p>

            {i <= activeIndex && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {m.nodes.map((n) => (
                  <span key={n.id} style={{
                    fontSize: 10, fontFamily: "JetBrains Mono, monospace", padding: "1px 6px", borderRadius: 4,
                    border: `1px solid ${n.color}44`, color: n.color, background: `${n.color}10`,
                  }}>
                    {n.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
