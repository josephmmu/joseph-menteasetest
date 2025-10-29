import React, { useMemo } from "react";
import "./BookSessionModal.css"; // shared modal styles
import MultiDonut from "./MultiDonut";
import { buildMultiDonutSegments, getSuccessRate } from "./sessionSuccessData";

export default function SessionSuccessModal({ isOpen, onClose, data }) {
  const totals = data?.totals ?? {};
  const weekly = data?.weekly ?? [];
  const segments = useMemo(() => buildMultiDonutSegments(data), [data]);
  const successRate = useMemo(() => getSuccessRate(data), [data]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: 700, width: "100%" }}>
        <div className="modal-header">
          <h3 className="modal-title">Session Success Tracker</h3>
        </div>

        <div className="modal-body">
          {/* Quick summary */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>
              % of sessions with both notes & feedback
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{successRate}%</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {totals.withNotesAndFeedback}/{totals.totalSessions} sessions
            </div>
          </div>

          {/* Chart block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ color: "#334155", fontWeight: 600 }}>
              Percentage from sessions
            </div>
            <MultiDonut data={segments} />
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            {segments.map((s) => (
              <span
                key={s.name}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#334155",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: s.color,
                  }}
                />
                {s.name} — {s.percentage}%
              </span>
            ))}
          </div>

          {/* Weekly table */}
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 8,
                color: "#0f172a",
              }}
            >
              Weekly Breakdown
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <Th>Week</Th>
                    <Th>Total</Th>
                    <Th>Notes + Feedback</Th>
                    <Th>Notes Only</Th>
                    <Th>Feedback Only</Th>
                    <Th>No Submission</Th>
                    <Th>Success %</Th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.map((w, i) => {
                    const pct = w.total
                      ? Math.round((w.both / w.total) * 100)
                      : 0;
                    return (
                      <tr
                        key={i}
                        style={{ borderTop: "1px solid #e5e7eb" }}
                      >
                        <Td>{w.label}</Td>
                        <Td>{w.total}</Td>
                        <Td>{w.both}</Td>
                        <Td>{w.notesOnly}</Td>
                        <Td>{w.feedbackOnly}</Td>
                        <Td>{w.none}</Td>
                        <Td style={{ fontWeight: 700 }}>{pct}%</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 10px",
        fontSize: 13,
        color: "#475569",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }) {
  return (
    <td
      style={{
        padding: "8px 10px",
        fontSize: 13,
        color: "#334155",
        ...style,
      }}
    >
      {children}
    </td>
  );
}