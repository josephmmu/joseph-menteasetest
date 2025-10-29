import React, { useEffect, useMemo } from "react";
// import "../components/BookSessionModal.css";
import "../components/AdminViewSessionLogsModal.css";
import { useSystemSettings } from "../context/SystemSettingsContext";

export default function AdminViewSessionLogsModal({
  isOpen,
  onClose,
  row,
  sessions,
}) {
  const { systemSettings } = useSystemSettings();

  const getCurrentPeriodDisplay = () => {
    const currentTerm = systemSettings?.currentTerm || 1;
    const currentAcademicYear = systemSettings?.currentAcademicYear || 3;

    const now = new Date();
    const currentYear = now.getFullYear();
    const base = now.getMonth() + 1 >= 6 ? currentYear : currentYear - 1;
    const startYear = base;
    const endYear = base + 1;
    const label = `${startYear}–${endYear}`;
    return `Term ${currentTerm} S.Y. ${label}`;
  };

  const items = useMemo(() => {
    if (!row || !sessions) return [];
    const ids = Array.isArray(row.sessionIds) ? row.sessionIds : [];
    return ids.map((id) => ({ sessionId: id }));
  }, [row, sessions]);

  const sessionLookup = useMemo(() => {
    if (!sessions) return new Map();
    const m = new Map();
    for (const s of sessions) {
      const dateStr = s?.date
        ? new Date(s.date).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "No date";
      const dateTime = s?.time ? `${dateStr} - ${s.time}` : dateStr;
      const studentsArr = Array.isArray(s.student)
        ? s.student
        : s.student
        ? [s.student]
        : [];
      m.set(s.id, {
        students: studentsArr,
        studentDisplay: studentsArr.length ? studentsArr.join(", ") : null,
        studentLabel: studentsArr.length > 1 ? "Students" : "Student",
        dateTime,
        status: s.status,
        sessionRef: s.sessionRef || `S-${s.id}`,
        topic: s.topic || null,
        subject: s.subject,
        section: s.section,
      });
    }
    return m;
  }, [sessions]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !row) return null;

  const handleExport = () => {
    // Create print content directly as HTML string
    const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Session Logs - ${row.subject} (${row.section})</title>
        <style>
          body { 
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial; 
            margin: 0; 
            padding: 16mm 14mm; 
            background: white; 
            color: black;
          }
          .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
          .logo { width: 44px; height: 44px; background: #1e3a8a; border-radius: 4px; }
          .title { font-size: 20px; font-weight: 800; color: #1e3a8a; }
          .subtitle { font-size: 13px; color: #64748b; font-weight: 600; }
          .divider { height: 2px; background: #1e3a8a; opacity: 0.15; border-radius: 2px; margin: 12px 0 16px; }
          .summary { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; text-align: center; margin-bottom: 16px; }
          .session-list { display: flex; flex-direction: column; gap: 10px; }
          .session-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
          .session-header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
          .session-date { font-weight: 700; font-size: 14px; }
          .session-meta { font-size: 13px; color: #64748b; display: flex; gap: 12px; }
          .session-details { font-size: 13px; color: #334155; }
          .footer { margin-top: 18px; display: flex; justify-content: space-between; color: #64748b; font-size: 12px; }
          .badge { display: inline-block; margin-left: 6px; padding: 2px 8px; border: 1px solid #e5e7eb; border-radius: 999px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo"></div>
          <div>
            <div class="title">Session Logs – ${row.subject} (${row.section})</div>
            <div class="subtitle">MentEase • ${getCurrentPeriodDisplay()}</div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="summary">
          <div style="font-size: 14px; color: #475569; margin-bottom: 4px;">
            Mentor: <b>${row.teacher || "—"}</b>
          </div>
          <div style="font-size: 15px;">
            <b>${items.length}</b> session log${items.length === 1 ? "" : "s"}
            <span class="badge">${row.subject}</span>
            <span class="badge">${row.section}</span>
          </div>
        </div>
        
        <div class="session-list">
          ${
            items.length === 0
              ? '<div class="session-item">No session logs yet for this course.</div>'
              : items
                  .map((f) => {
                    const lookup = sessionLookup?.get?.(f.sessionId);
                    const hasStudents = !!lookup?.studentDisplay;
                    return `
                <div class="session-item">
                  <div class="session-header">
                    <div class="session-date">${lookup?.dateTime || "No date"}</div>
                    <div class="session-meta">
                      ${
                        lookup?.status
                          ? `<span>Status: <b>${lookup.status}</b></span>`
                          : ""
                      }
                    </div>
                  </div>
                  <div class="session-details">
                    <div style="margin-bottom: 4px;">Subject: ${row.subject} • ${row.section}</div>
                    ${
                      hasStudents
                        ? `<div style="margin-bottom: 6px;">${lookup.studentLabel}: ${lookup.studentDisplay}</div>`
                        : ""
                    }
                    <div>Topic: ${lookup?.topic || "—"}</div>
                  </div>
                </div>
              `;
                  })
                  .join("")
          }
        </div>
        
        <div class="footer">
          <div>Generated: ${new Date().toLocaleString()}</div>
          <div>MentEase</div>
        </div>
      </body>
      </html>
    `;

    // Open in new window and print
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();

      printWindow.onload = function () {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    } else {
      // Fallback: create a temporary div and print

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = printHTML.match(/<body>(.*)<\/body>/s)[1];
      tempDiv.style.position = "fixed";
      tempDiv.style.top = "0";
      tempDiv.style.left = "0";
      tempDiv.style.width = "100%";
      tempDiv.style.height = "100%";
      tempDiv.style.background = "white";
      tempDiv.style.zIndex = "10000";
      document.body.appendChild(tempDiv);

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.removeChild(tempDiv);
        }, 1000);
      }, 100);
    }
  };

  return (
  <div className="admin-session-logs-modal">
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: "100%" }}
      >
        
          <div className="modal-header">
            <h3 className="modal-title">
              Session Logs – {row.subject} ({row.section})
            </h3>
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "0.95rem", color: "#475569" }}>
              <strong>Section {row.section || "—"}</strong>
              <span style={{ margin: "0 8px" }}>•</span>
              <strong>{row.teacher || "—"}</strong>
            </div>
            <div style={{ marginTop: 6, fontSize: "0.95rem" }}>
              <strong>{items.length}</strong> session log
              {items.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="modal-body" style={{ maxHeight: 420, overflow: "auto" }}>
          {items.length === 0 ? (
            <div
              style={{ color: "#64748b", textAlign: "center", padding: 16 }}
            >
              No session logs yet for this course.
            </div>
          ) : (
            <ul className="admin-session-logs-list">
              {items.map((it) => {
                const s = sessionLookup.get(it.sessionId) || {};

                return (
                  <li key={it.sessionId}>
                    <div className="admin-session-card">
                      <div className="admin-session-info">
                        {/* Status and Date layout - responsive */}
                        <div className="admin-session-date-row">
                          {/* Status chip */}
                          {s.status && (
                            <span
                              className="admin-session-status-badge"
                              style={{
                                background: s.status === "Completed"
                                  ? "#dcfce7"
                                  : s.status === "Missed - Student"
                                  ? "#fef3c7"
                                  : s.status === "Missed - Mentor"
                                  ? "#fee2e2"
                                  : s.status === "Cancelled"
                                  ? "#f3f4f6"
                                  : "#f3f4f6",
                                color: s.status === "Completed"
                                  ? "#166534"
                                  : s.status === "Missed - Student"
                                  ? "#92400e"
                                  : s.status === "Missed - Mentor"
                                  ? "#991b1b"
                                  : s.status === "Cancelled"
                                  ? "#374151"
                                  : "#6b7280",
                              }}
                            >
                              {s.status === "Completed"
                                ? "✓ Completed"
                                : s.status === "Missed - Student"
                                ? "👤 Student Missed"
                                : s.status === "Missed - Mentor"
                                ? "👨🏫 Mentor Missed"
                                : s.status === "Cancelled"
                                ? "⚪ Cancelled"
                                : s.status}
                            </span>
                          )}
                          
                          {/* Date */}
                          <p className="admin-session-date">{s.dateTime}</p>
                        </div>

                          <p className="admin-session-subject">
                          {s.subject} - {s.section}
                        </p>

                        <p className="admin-session-students">
                          {s.studentDisplay
                            ? `${s.studentLabel}: ${s.studentDisplay}`
                            : "—"}
                        </p>

                        <div className="admin-session-bottom">
                          <div className="admin-session-topic">
                            Topic: {s.topic || "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>
    </div>
  </div>
);
}