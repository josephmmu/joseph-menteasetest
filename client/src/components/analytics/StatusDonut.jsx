import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import ChartHelpModal from "../ChartHelpModal";
import "./TipText.css";

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#9ca3af"];

export default function StatusDonut({ data = [], onClickSlice = null }) {
  const total = (data || []).reduce((s, d) => s + (d.value || 0), 0);
  const [isNarrow, setIsNarrow] = React.useState(
    typeof window !== "undefined" ? window.innerWidth <= 720 : false
  );
  const [helpOpen, setHelpOpen] = React.useState(false);

  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (!data || !data.length || total === 0) {
    return (
      <div style={{ padding: 12, color: "#64748b" }}>
        No status data available.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: 300,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        paddingBottom: 8,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 8,
          flex: "none",
        }}
      >
        <div>Session Status</div>
        {/* Hover tip (taken from CancelBookingModal pattern) */}
        <span className="tip-wrapper" aria-describedby="sessions-time-tip">
          <svg
            className="info-icon-svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="#1e3a8a" />
            <path
              d="M12 7.2c-1.77 0-3.2 1.12-3.2 2.5 0 .41.33.75.75.75s.75-.34.75-.75c0-.62.77-1 1.7-1s1.7.5 1.7 1.2c0 .56-.33.87-.98 1.26-.74.46-1.72 1.07-1.72 2.42v.35c0 .41.34.75.75.75s.75-.34.75-.75v-.35c0-.7.35-1 .98-1.38.79-.47 1.97-1.19 1.97-2.65 0-1.64-1.45-2.95-3.45-2.95Z"
              fill="#fff"
            />
            <circle cx="12" cy="16.8" r="1" fill="#fff" />
          </svg>
          <span id="sessions-time-tip" className="tip-text">
            The donut chart shows how sessions ended: completed, missed, or
            cancelled. Use this to quickly see overall student/mentor engagement
            and follow-up opportunities.
          </span>
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: 16,
          flexDirection: isNarrow ? "column" : "row",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {/* give the pie full room; legend will be rendered externally */}
            <PieChart margin={{ right: 16 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={isNarrow ? 28 : 36}
                outerRadius={isNarrow ? 56 : 80}
                paddingAngle={4}
                onClick={(entry) => onClickSlice && onClickSlice(entry?.name)}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`c-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            width: isNarrow ? "100%" : 260,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            paddingLeft: isNarrow ? 0 : 8,
            paddingTop: isNarrow ? 12 : 0,
            boxSizing: "border-box",
            alignItems: isNarrow ? "flex-start" : "stretch",
          }}
        >
          {data.map((d, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", marginBottom: 8 }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: COLORS[i % COLORS.length],
                  marginRight: 8,
                  borderRadius: 6,
                }}
              />
              <div style={{ color: "#0f172a", fontSize: 13 }}>{d.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
