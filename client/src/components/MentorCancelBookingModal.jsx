// src/components/MentorCancelBookingModal.jsx
import React, { useMemo, useState } from "react";
import "./MentorCancelBookingModal.css"; // scoped styles for this modal
import "./RescheduleSessionModal.css"; // reuse your .rs-compact (compact <24h) look

export default function MentorCancelBookingModal({
  isOpen,
  onClose,
  session,   // { date, subject, section, students: [..] }
  onConfirm, // (payload) => void
}) {
  const formatStudentDisplay = (students) =>
    !students || students.length === 0 ? "No students" : students.join(", ");

  const getStudentLabel = (students) =>
    students && students.length === 1 ? "Student" : "Students";

  const parseSessionDate = (str) => {
    if (!str) return null;
    const [datePart, timePart] = String(str).split(" - ");
    const d = new Date(`${datePart} ${timePart}`);
    return isNaN(d) ? null : d;
  };

  const sessionStart = useMemo(
    () => parseSessionDate(session?.date),
    [session]
  );

  const now = useMemo(() => new Date(), []);
  const hoursUntil = useMemo(() => {
    if (!sessionStart) return null;
    return (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  }, [sessionStart, now]);

  const canCancel = hoursUntil !== null && hoursUntil >= 24;

  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);

  if (!isOpen || !session) return null;

  const handleConfirm = (e) => {
    e.preventDefault();
    if (!canCancel || !ack) return;

    const payload = {
      subject: session.subject,
      section: session.section,
      student: session.students,
      date: session.date,      // keep the friendly string
      reason: reason.trim(),
      notifyStudent: true,     // mentor cancels → notify student(s)
      action: "cancel",
    };

    onConfirm?.(payload);
    onClose();
  };

  // ==========
  // < 24 hours — COMPACT (match Reschedule compact via .rs-compact)
  // ==========
  if (!canCancel) {
    return (
      <div className="rs-compact">
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
        >
          <div className="modal-content">
            {/* Policy tip (top-right) */}
            <span
              className="tip-wrapper top-right"
              aria-describedby="cancel-policy-tip"
            >
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
              <span id="cancel-policy-tip" className="tip-text">
                Cancellations are allowed up to{" "}
                <strong>24 hours before</strong> the session start time.
              </span>
            </span>

            <h2 id="cancel-title">Cancel Session</h2>

            <p>
              <strong>{session.subject}</strong> — {session.section}
            </p>
            <p>
              {getStudentLabel(session.students)}:{" "}
              {formatStudentDisplay(session.students)}
            </p>
            <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

            <p
              className="hint"
              role="alert"
              style={{ color: "#b91c1c", fontWeight: 600, marginTop: "0.75rem" }}
            >
              This session begins in less than 24 hours. Per policy, you can’t
              cancel it here. Please contact your{" "}
              {session?.students && session.students.length === 1
                ? "student"
                : "students"}{" "}
              if you need to discuss options.
            </p>

            <div className="modal-actions full" style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary btn-block"
                style={{
                  padding: "0.75rem 1rem",
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
                  color: "#fff",
                  border: "none",
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========
  // ≥ 24 hours — normal cancel flow (label above textarea; everything left-aligned)
  // ==========
  return (
    <div className="mentor-cancel">
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
      >
        <div className="modal-content">
          <span
            className="tip-wrapper top-right"
            aria-describedby="cancel-policy-tip"
          >
            <svg
              className="info-icon-svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" fill="#1e3a8a" />
              <path
                d="M12 7.2c-1.77 0-3.2 1.12-3.2 2.5 0 .41.33.75.75.75s.75-.34.75-.75c0-.62.77-1 1.7-1s1.7.5 1.7 1.2c0 .56-.33.87-.98 1.26-.74.46-1.72 1.07-1.72 2.42v.35c0 .41.34.75.75.75s.75-.34.75-.75v-.35c0-.7.35-1 .98-1.38.79-.47 1.97-1.19 1.97-2.65 0-1.64-1.45-2.95-3.45-2.95Z"
                fill="#fff"
              />
              <circle cx="12" cy="16.8" r="1" fill="#fff" />
            </svg>
            <span id="cancel-policy-tip" className="tip-text">
              Cancellations are allowed up to <strong>24 hours before</strong>{" "}
              the session start time.
            </span>
          </span>

          <h2 id="cancel-title" className="mc-title">Cancel Session</h2>

          <div className="mc-meta">
            <p><strong>{session.subject}</strong> — {session.section}</p>
            <p>
              {getStudentLabel(session.students)}:{" "}
              {formatStudentDisplay(session.students)}
            </p>
            <p className="mc-scheduled">Scheduled: {session.date}</p>
          </div>

          <p className="hint mc-notice">
            The{" "}
            {session?.students && session.students.length === 1
              ? "student"
              : "students"}{" "}
            will be <strong>automatically emailed</strong> about this
            cancellation.
          </p>

          <form onSubmit={handleConfirm} className="mc-form">
            {/* LABEL ABOVE FIELD (left-aligned) */}
            <div className="row full">
              <label className="label" htmlFor="mc-reason">
                Reason for cancellation
              </label>
              <textarea
                id="mc-reason"
                name="reason"
                rows="3"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., schedule conflict, urgent matter"
              />
            </div>

            {/* Checkbox + text inline, left-aligned */}
            <div className="row full checkbox-row">
              <input
                id="mc-ack"
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <label htmlFor="mc-ack" className="checkbox-label">
                I understand this action cannot be undone.
              </label>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost"
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!ack}
                aria-disabled={!ack}
                style={{
                  background:
                    "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
                  opacity: !ack ? 0.6 : 1,
                  cursor: !ack ? "not-allowed" : "pointer",
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}