import React, { useMemo } from "react";
import "./BookSessionModal.css";

/**
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - activityType: 'session' | 'student' | 'mentor'
 *  - weekly: Array<any>
 *  - totals: Record<string, number>
 *  - totalPossible?: number
 *  - maxPerWeek?: number
 *  - perMentor?: Array<{ mentor:string; sessions:number; cancelled?:number; noShow?:number; avgPerWeek?:number }>
 */

export default function ActivityModal({
  isOpen,
  onClose,
  activityType,
  weekly = [],
  totals = {},
  totalPossible = 0,
  maxPerWeek = 10,
  perMentor = [],
}) {
  if (!isOpen || !activityType) return null;

  // --- shared modal shell styled like BookSessionModal ---
  const Shell = ({ title, children }) => (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, width: "100%" }}>
        {/* Header (blue h2 + ghost close) */}
        <div className="modal-header row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 0, position: "relative" }}>
          <h2 style={{ marginBottom: 0 }}>{title}</h2>

          <button className="btn btn-ghost" type="button" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        {children}

        <div className="modal-actions" style={{ justifyContent: "flex-end"}}>
          <button className="btn btn-ghost" onClick={onClose} type="button">Close</button>
        </div>
      </div>
    </div>
  );

  // Helper to build summary string from items
  function buildSummary(items) {
    return items.map(([label, value]) => `${label}: ${value}`).join(" • ");
  }

if (activityType === "session") {
    const summaryItems = [
      ["Total possible", totalPossible],
      ["Completed", totals.completed ?? 0],
      ["Scheduled", totals.scheduled ?? 0],
      ["Utilization", `${totalPossible ? Math.round((totals.completed / totalPossible) * 100) : 0}%`],
      ["Completion rate", `${totals.scheduled ? Math.round((totals.completed / totals.scheduled) * 100) : 0}%`],
      ["Cancellation rate", `${totals.scheduled ? Math.round((totals.cancelled / totals.scheduled) * 100) : 0}%`],
      ["No-show rate", `${totals.scheduled ? Math.round((totals.noShow / totals.scheduled) * 100) : 0}%`],
      ["Weeks", weekly.length || 0],
    ];
    return (
      <Shell title="Session Activity" tipSummary={buildSummary(summaryItems)}>
        <SummaryGrid items={summaryItems} />
        <Table
          headers={["Week", "Possible", "Scheduled", "Completed", "Cancelled", "No-show", "Completion %"]}
          rows={weekly.map((w) => {
            const comp = w.scheduled ? Math.round((w.completed / w.scheduled) * 100) : 0;
            return [`W${w.w}`, 10, w.scheduled, w.completed, w.cancelled, w.noShow, `${comp}%`];
          })}
        />
      </Shell>
    );
  }

   if (activityType === "student") {
    const totalStudents = (totals.active ?? 0) + (totals.inactive ?? 0);
    const participation = totalStudents ? Math.round((totals.active / totalStudents) * 100) : 0;
    const feedbackRate = (totals.active ?? 0) ? Math.round((totals.feedbackSubmitted / totals.active) * 100) : 0;
    const summaryItems = [
      ["Total students", totalStudents],
      ["Active (≥1 session)", totals.active ?? 0],
      ["Inactive", totals.inactive ?? 0],
      ["Feedback submitted", totals.feedbackSubmitted ?? 0],
      ["Participation", `${participation}%`],
      ["Feedback rate", `${feedbackRate}%`],
    ];
    return (
      <Shell title="Student Activity" tipSummary={buildSummary(summaryItems)}>
        <SummaryGrid items={summaryItems} />
        <Table
          headers={["Week", "Active", "Inactive", "Feedback submitted"]}
          rows={weekly.map((w) => [`W${w.w}`, w.active, w.inactive, w.feedbackSubmitted])}
        />
      </Shell>
    );
  }

  // default: mentor
  const avgPerWeek = totals.mentors ? (totals.sessions / totals.mentors / 12).toFixed(1) : "0.0";
  const summaryItems = [
    ["Mentors", totals.mentors ?? 0],
    ["Total sessions", totals.sessions ?? 0],
    ["Cancelled", totals.cancelled ?? 0],
    ["No-show", totals.noShow ?? 0],
    ["Avg / mentor / week", avgPerWeek],
  ];
  return (
    <Shell title="Mentor Activity" tipSummary={buildSummary(summaryItems)}>
      <SummaryGrid items={summaryItems} />
      <div className="table-wrap">
        <table className="simple-table">
          <thead>
            <tr>
              <th>Mentor</th>
              <th>Sessions</th>
              <th>Cancelled</th>
              <th>No-show</th>
              <th>Avg / week</th>
            </tr>
          </thead>
          <tbody>
            {perMentor.map((m, i) => (
              <tr key={i}>
                <td>{m.mentor}</td>
                <td>{m.sessions}</td>
                <td>{m.cancelled ?? 0}</td>
                <td>{m.noShow ?? 0}</td>
                <td>{m.avgPerWeek ?? (m.sessions / 12).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ================== tiny UI helpers ================== */
function SummaryGrid({ items = [] }) {
  // Add explanations for each summary metric
  const SUMMARY_TIPS = {
    "Total possible": "Maximum sessions that could be held.",
    "Completed": "Sessions that were finished.",
    "Scheduled": "Sessions that were planned.",
    "Utilization": "Completed sessions as a percentage of possible.",
    "Completion rate": "Completed out of scheduled sessions.",
    "Cancellation rate": "Scheduled sessions that were cancelled.",
    "No-show rate": "Scheduled sessions where no one attended.",
    "Weeks": "Number of weeks in the period.",
    "Total students": "All students in this group.",
    "Active (≥1 session)": "Students who attended at least one session.",
    "Inactive": "Students who did not attend any session.",
    "Feedback submitted": "Students who submitted feedback.",
    "Participation": "Active students as a percentage of total.",
    "Feedback rate": "Feedback submissions as a percentage of active.",
    "Mentors": "Total mentors in this group.",
    "Total sessions": "All sessions conducted by mentors.",
    "Cancelled": "Sessions cancelled by mentors.",
    "No-show": "Sessions where mentors did not attend.",
    "Avg / mentor / week": "Average sessions per mentor per week.",
  };

  // Use the same spacing system as BookSession: .row + our flex grid
  return (
    <>
      <style>{`
        .summary-tile .tip-wrapper:hover .tip-text,
        .summary-tile .tip-wrapper:focus .tip-text {
          display: block !important;
        }
      `}</style>
      <div className="summary-grid row" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: 12, justifyContent: "center" }}>
        {items.map(([label, value], i) => (
          <div key={i} className="summary-tile" style={{ minWidth: 120, position: "relative", textAlign: "center"}}>
            <div className="summary-label" style={{ color: "#0f172a", fontWeight: 400, display: "flex", alignItems: "center", gap: 6, justifyContent: "center", textAlign: "center", width: "100%" }}>
              {label}
              <span className="tip-wrapper top-right" aria-describedby="activity-tip" style={{position: "absoulute", right: 2, top: 2}}>
                <svg className="info-icon-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="#1e3a8a" />
                  <path
                    d="M12 7.2c-1.77 0-3.2 1.12-3.2 2.5 0 .41.33.75.75.75s.75-.34.75-.75c0-.62.77-1 1.7-1s1.7.5 1.7 1.2c0 .56-.33.87-.98 1.26-.74.46-1.72 1.07-1.72 2.42v.35c0 .41.34.75.75.75s.75-.34.75-.75v-.35c0-.7.35-1 .98-1.38.79-.47 1.97-1.19 1.97-2.65 0-1.64-1.45-2.95-3.45-2.95Z"
                    fill="#fff"
                  />
                  <circle cx="12" cy="16.8" r="1" fill="#fff" />
                </svg>
                <span id="activity-tip" className="tip-text" style={{ left: "auto", right: 0, minWidth: 220 }}>
                  {SUMMARY_TIPS[label] || ""}
                </span>
              </span>
            </div>
            <div className="summary-value" style={{ color: "#334155", textAlign: "center" }}>{value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Table({ headers = [], rows = [] }) {
  return (
    <div className="table-wrap row">
      <table className="simple-table">
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

