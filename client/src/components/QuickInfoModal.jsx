import React from "react";
import { createPortal } from "react-dom";
import HalfDount from "./HalfDonut";           // same component you use in AdminDashboard
import "./BookSessionModal.css";               // your existing CSS

export default function QuickInfoModal({ isOpen, kind, seeds, onClose }) {
  if (!isOpen) return null;

  const data =
    kind === "upcoming"  ? seeds.upcoming  :
    kind === "completed" ? seeds.completed :
    kind === "feedback"  ? seeds.feedback  : null;

  if (!data) return null;

  const stop = (e) => e.stopPropagation();

  const content = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={stop}  style={{ fontFamily: 'Inter, sans-serif', maxWidth: 1200, width: "100%" }}>
        {/* Title follows your .modal-content h2 rule */}
        <div className="modal-header">
            <h2>{data.title}</h2>
        </div>

        {/* UPCOMING */}
        {kind === "upcoming" && (
          <>
            {/* summary tiles (light gray border + centered via your classes) */}
            <div className="summary-grid">
              <div className="summary-tile">
                <div className="summary-label">Total Upcoming</div>
                <div className="summary-value">{data.summary.totalUpcoming}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Next 7 Days</div>
                <div className="summary-value">{data.summary.nextWithin7Days}</div>
              </div>
            </div>

            {/* table */}
            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject - Section</th>
                    <th>Mentor</th>
                    <th>Topic</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>{s.subject} - {s.section}</td>
                      <td>{s.mentor}</td>
                      <td>{s.topic}</td>
                      <td>
                        <a className="btn btn-primary" href={s.meetLink || "#"}>
                          Join
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* COMPLETED */}
        {kind === "completed" && (
          <>
            <div className="summary-grid">
              <div className="summary-tile">
                <div className="summary-label">Total</div>
                <div className="summary-value">{data.summary.totalCompleted}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">This Month</div>
                <div className="summary-value">{data.summary.completedThisMonth}</div>
              </div>
              <div className="summary-tile">
                <div className="summary-label">Avg / Week</div>
                <div className="summary-value">{data.summary.avgPerWeek}</div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject - Section</th>
                    <th>Mentor</th>
                    <th>Topic</th>
                    <th>Notes</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>{s.subject} - {s.section}</td>
                      <td>{s.mentor}</td>
                      <td>{s.topic}</td>
                      <td>{s.notesLink ? <a className="btn btn-ghost" href={s.notesLink}>View</a> : "-"}</td>
                      <td>{s.feedbackSubmitted ? "Submitted" : "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* FEEDBACK */}
        {kind === "feedback" && (
          <>
            <div className="summary-grid">
              <div className="summary-tile" style={{ flex: "1 1 220px" }}>
                <div className="summary-label">Submitted / Completed</div>
                <div className="summary-value">
                  {data.gauge.value} / {data.gauge.maxValue}
                </div>
              </div>
              <div className="summary-tile" style={{ flex: "1 1 220px" }}>
                <div className="summary-label">Overall Rate</div>
                <div className="summary-value">{data.summary.ratePct}%</div>
              </div>
            </div>

            {/* keep the donut centered using flexbox */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "0.75rem" }}>
              <HalfDount value={data.gauge.value} maxValue={data.gauge.maxValue} />
            </div>

            {/* Missing list */}
            <h3 style={{ marginTop: "1rem", color: "#0f172a", fontSize: "1rem" }}>Missing Feedback ({data.summary.missingCount})</h3>
            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject - Section</th>
                    <th>Mentor</th>
                    <th>Student</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missing.map((m) => (
                    <tr key={m.id}>
                      <td>{m.date}</td>
                      <td>{m.subject} - {m.section}</td>
                      <td>{m.mentor}</td>
                      <td>{m.student}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* By subject */}
            <h3 style={{ marginTop: "1rem", color: "#0f172a", fontSize: "1rem" }}>By Subject</h3>
            <div className="table-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Submitted</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySubject.map((s, i) => (
                    <tr key={i}>
                      <td>{s.subject}</td>
                      <td>{s.submitted}</td>
                      <td>{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-actions" style={{ justifyContent: "flex-end"}}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );

  // Portal keeps your CSS but avoids parent stacking issues
const host =
  (typeof document !== "undefined" && document.querySelector(".page-wrapper")) ||
  document.body;

  return createPortal(content, host);
}
