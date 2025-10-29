import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import ChartHelpModal from "../ChartHelpModal";
import "./TipText.css";

export default function SessionsByProgram({ data = [] }) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [isNarrow, setIsNarrow] = React.useState(
    typeof window !== "undefined" ? window.innerWidth <= 720 : false
  );
  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (!data || !data.length) {
    return (
      <div style={{ padding: 12, color: "#64748b" }}>
        No program data available.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: 320,
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
        <div>Sessions by Program</div>
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
            This bar chart breaks down mentoring sessions by program. Each bar
            represents a program (BA, IT, GE) and is colored for clarity.
          </span>
        </span>
      </div>
      {/* program info mapping for legend labels and colors */}
      {(() => {
        const progInfo = {
          ba: { label: "BA (Business Administration)", color: "#10b981" },
          it: { label: "IT (Information Technology)", color: "#2563eb" },
          ge: { label: "GE (General Education)", color: "#f59e0b" },
        };

        const legendPayload = data.map((d) => {
          const key = (d.program || "").toString().toLowerCase();
          const info = progInfo[key] || {
            label: d.program || "Unknown",
            color: "#94a3b8",
          };
          return { value: info.label, type: "square", color: info.color };
        });

        return (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              gap: 16,
              flexDirection: isNarrow ? "column" : "row",
            }}
          >
            {/* Chart area */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  // reduce right margin: legend will be rendered outside the SVG
                  margin={{
                    top: 8,
                    right: 16,
                    left: isNarrow ? 12 : 36,
                    bottom: 12,
                  }}
                >
                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis dataKey="program" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" barSize={isNarrow ? 18 : 40}>
                    {data.map((entry, index) => {
                      const prog = (entry.program || "")
                        .toString()
                        .toLowerCase();
                      const color =
                        prog === "ba"
                          ? "#10b981"
                          : prog === "it"
                          ? "#2563eb"
                          : prog === "ge"
                          ? "#f59e0b"
                          : "#94a3b8"; // fallback gray
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* External legend rendered as DOM to the right of the chart */}
            <div
              style={{
                width: isNarrow ? "100%" : 260,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                paddingLeft: isNarrow ? 0 : 12,
                paddingTop: isNarrow ? 12 : 0,
                boxSizing: "border-box",
                alignItems: isNarrow ? "flex-start" : "stretch",
              }}
            >
              {legendPayload.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      background: item.color,
                      marginRight: 8,
                      borderRadius: 2,
                    }}
                  />
                  <div style={{ color: "#0f172a", fontSize: 13 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
