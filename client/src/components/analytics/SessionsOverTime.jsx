import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import ChartHelpModal from "../ChartHelpModal";
import "./TipText.css";

// data: [{ period: 'SY 2025 T1', count: 12 }, ...]
export default function SessionsOverTime({ data = [] }) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [isNarrow, setIsNarrow] = React.useState(
    typeof window !== "undefined" ? window.innerWidth <= 720 : false
  );
  React.useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // simple two-line tick renderer: first line = SY (e.g. "SY 2025"), second line = term (e.g. "T3").
  // Avoid dynamic wrapping so the SY and term remain stable and predictable.
  const renderTick = React.useCallback((props) => {
    const { x, y, payload } = props;
    const v = (payload && payload.value) || "";

    const parts = v.trim().split(/\s+/);
    let sy = "";
    let term = "";

    // Prefer to show school year in short form: "SY 25-26" for 2025
    if (parts.length >= 2 && parts[0].toLowerCase() === "sy") {
      // Find the term token (e.g. 'T1', 'T2') anywhere in the parts
      const termToken = parts.find((p) => /^T\d+$/i.test(p)) || "";

      // Extract the first 4-digit year found in the entire string (handles 'SY 2023 - 2024')
      const yearMatches = (v && v.match(/(\d{4})/g)) || [];
      let syRange = "";
      if (yearMatches.length >= 1) {
        const start = parseInt(yearMatches[0], 10);
        const next = start + 1;
        const a = String(start % 100).padStart(2, "0");
        const b = String(next % 100).padStart(2, "0");
        syRange = `${a}-${b}`;
      } else {
        // Fallback: try to pull a 2-digit year token from parts[1]
        const twoMatch = (parts[1] || "").match(/(\d{2})/);
        if (twoMatch) {
          const start = parseInt(twoMatch[1], 10);
          const next = (start + 1) % 100;
          syRange = `${String(start).padStart(2, "0")}-${String(next).padStart(
            2,
            "0"
          )}`;
        } else {
          syRange = parts[1] || "";
        }
      }

      sy = `${parts[0]} ${syRange}`; // e.g. "SY 25-26"
      term = termToken || "";
    } else {
      // Fallback: first token on top, rest on bottom
      sy = parts[0] || v;
      term = parts.slice(1).join(" ");
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" fontSize={isNarrow ? 11 : 12} fill="#374151">
          <tspan x={0} dy={0}>
            {sy}
          </tspan>
          <tspan x={0} dy={isNarrow ? 14 : 18}>
            {term}
          </tspan>
        </text>
      </g>
    );
  }, []);

  if (!data || !data.length) {
    return (
      <div style={{ padding: 12, color: "#64748b" }}>
        No session data for the selected period.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: 350, // keep the original container height
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        paddingBottom: 0, // remove bottom padding so chart can sit lower
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
          fontSize: isNarrow ? 13 : 14,
          fontWeight: 700,
          marginBottom: 8,
          flex: "none",
        }}
      >
        <div>Sessions over time</div>
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
            This chart shows the total number of mentoring sessions grouped by
            school year and term. Use it to spot trends and understand seasonal
            spikes or drops in session activity.
          </span>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            // reduce margins so the plot area can grow while still reserving room for ticks
            margin={{ top: 6, right: 20, left: 0, bottom: isNarrow ? 48 : 36 }}
          >
            <CartesianGrid stroke="#f1f5f9" />
            {/* two-line tick renderer: SY on top, Term below */}
            <XAxis
              dataKey="period"
              height={isNarrow ? 48 : 36}
              tick={renderTick}
            />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#1e3a8a"
              strokeWidth={2}
              dot={{ r: isNarrow ? 2 : 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
