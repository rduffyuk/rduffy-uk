import { useState } from "react";

interface ContributionDay {
  date: string;
  github: number;
  gitlab: number;
  total: number;
}

interface ContributionWeek {
  days: ContributionDay[];
}

interface ContributionData {
  generatedAt: string;
  totalContributions: number;
  weeks: ContributionWeek[];
}

interface Props {
  variant: "compact" | "full";
  data: ContributionData;
}

const LEVELS = ["#1e1e2e", "#14532d", "#16a34a", "#4ade80", "#86efac"];
const LEVELS_LIGHT = ["#ebedf0", "#14532d", "#16a34a", "#4ade80", "#86efac"];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function getMonthLabels(
  weeks: ContributionWeek[],
): { label: string; col: number }[] {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = "";
  for (let i = 0; i < weeks.length; i++) {
    const firstDay = weeks[i].days[0];
    if (!firstDay) continue;
    const month = new Date(firstDay.date + "T00:00:00").toLocaleDateString(
      "en-GB",
      { month: "short" },
    );
    if (month !== lastMonth) {
      labels.push({ label: month, col: i });
      lastMonth = month;
    }
  }
  return labels;
}

export default function ContributionHeatmap({ variant, data }: Props) {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const weeks = variant === "compact" ? data.weeks.slice(-13) : data.weeks;

  const compactTotal =
    variant === "compact"
      ? weeks.reduce(
          (sum, w) => sum + w.days.reduce((s, d) => s + d.total, 0),
          0,
        )
      : data.totalContributions;

  const monthLabels = variant === "full" ? getMonthLabels(weeks) : [];
  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  const isDark =
    typeof document !== "undefined"
      ? !document.documentElement.hasAttribute("data-theme") ||
        document.documentElement.getAttribute("data-theme") === "dark"
      : true;
  const levels = isDark ? LEVELS : LEVELS_LIGHT;

  function handleMouseEnter(
    e: React.MouseEvent<HTMLDivElement>,
    day: ContributionDay,
  ) {
    if (day.total === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: `${formatDate(day.date)}: ${day.gitlab} GitLab · ${day.github} GitHub`,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="relative flex flex-col items-center">
      <div className="flex gap-0">
        {variant === "full" && (
          <div className="mr-1 flex flex-col gap-[2px]">
            {dayLabels.map((label, i) => (
              <div
                key={i}
                className="flex items-center justify-end"
                style={{
                  height: 12,
                  width: 28,
                  fontSize: 9,
                  fontFamily: "monospace",
                  color: "#64748b",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}

        <div>
          {variant === "full" && (
            <div className="relative mb-1" style={{ height: 14 }}>
              {monthLabels.map((m) => (
                <span
                  key={m.col}
                  className="absolute"
                  style={{
                    left: m.col * 14,
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: "#64748b",
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-[2px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.days.map((day, di) => (
                  <div
                    key={di}
                    onMouseEnter={(e) => handleMouseEnter(e, day)}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: levels[getLevel(day.total)],
                      cursor: day.total > 0 ? "pointer" : "default",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="mt-2 flex w-full items-center"
        style={{
          justifyContent: variant === "full" ? "space-between" : "center",
          paddingLeft: variant === "full" ? 30 : 0,
        }}
      >
        <span
          style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}
        >
          <span style={{ color: "#4ade80", fontWeight: 600 }}>
            {compactTotal.toLocaleString()}
          </span>{" "}
          contributions in the last{" "}
          {variant === "compact" ? "3 months" : "year"}
        </span>

        {variant === "full" && (
          <div className="flex items-center gap-1">
            <span
              style={{ fontFamily: "monospace", fontSize: 9, color: "#64748b" }}
            >
              Less
            </span>
            {levels.map((color, i) => (
              <div
                key={i}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: color,
                }}
              />
            ))}
            <span
              style={{ fontFamily: "monospace", fontSize: 9, color: "#64748b" }}
            >
              More
            </span>
          </div>
        )}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 hidden md:block"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            {tooltip.text}
          </div>
        </div>
      )}
    </div>
  );
}
