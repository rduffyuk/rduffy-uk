import { useEffect, useRef } from "react";
import type { Milestone } from "./types";

interface TimelineProps {
  milestones: Milestone[];
  currentIndex: number;
  onMilestoneVisible: (index: number) => void;
}

export function Timeline({ milestones, currentIndex, onMilestoneVisible }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cards = containerRef.current.querySelectorAll("[data-milestone-index]");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.milestoneIndex);
            if (!isNaN(idx)) onMilestoneVisible(idx);
          }
        }
      },
      { threshold: 0.6, root: null }
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [milestones, onMilestoneVisible]);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 24, padding: "24px 0" }}>
      {milestones.map((m, i) => (
        <div
          key={m.date}
          data-milestone-index={i}
          style={{
            padding: "24px",
            background: i === currentIndex ? "rgba(168, 85, 247, 0.06)" : "#0f0f13",
            border: `1px solid ${i === currentIndex ? "rgba(168, 85, 247, 0.3)" : "#1e293b"}`,
            borderRadius: 12,
            transition: "all 0.4s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: i <= currentIndex ? "#a855f7" : "#334155",
                boxShadow: i === currentIndex ? "0 0 12px rgba(168, 85, 247, 0.6)" : "none",
                transition: "all 0.4s ease",
              }}
            />
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#94a3b8" }}>
              {m.date}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: i === currentIndex ? "#a855f7" : "#f1f5f9" }}>
            {m.title}
          </h3>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
            {m.description}
          </p>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.nodes.map((n) => (
              <span
                key={n.id}
                style={{
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "2px 8px",
                  borderRadius: 6,
                  border: `1px solid ${n.color}33`,
                  color: n.color,
                  background: `${n.color}10`,
                }}
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
              style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "#a855f7" }}
            >
              Read blog episode →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
