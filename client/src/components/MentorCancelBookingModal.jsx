// components/MentorCancelBookingModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./CancelBookingModal.css";

/** Normalize any array of strings/objects into display names */
const extractStudentNames = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => {
      if (typeof s === "string") return s.trim();
      if (s && typeof s === "object") {
        const u = s.user && typeof s.user === "object" ? s.user : null;
        const parts = [
          s.name,
          s.fullName,
          [s.firstName, s.lastName].filter(Boolean).join(" ").trim(),
          s.displayName,
          s.username,
          s.email,
          s.rollNo,
          u?.name,
          u?.fullName,
          [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim(),
          u?.displayName,
          u?.username,
          u?.email,
        ];
        const found = parts.find((p) => typeof p === "string" && p.trim());
        if (found) return found.trim();
      }
      return "";
    })
    .filter(Boolean);
};

export default function MentorCancelBookingModal({
  isOpen,
  onClose,
  session,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form each time the modal opens or the selected session changes
  useEffect(() => {
    if (!isOpen) return;
    setReason("");
    setAck(false);
    setSubmitting(false);
  }, [isOpen, session?.id, session?._id, session?.startISO, session?.date]);

  // Students / group display (mentor view)
  const studentNames = extractStudentNames(
    session?.students ||
      session?.members ||
      session?.participants ||
      session?.attendees ||
      session?.group ||
      session?.groupMembers
  );

  const fromMembersOnly =
    !!session?.members &&
    !session?.students &&
    !session?.participants &&
    !session?.attendees &&
    !session?.group &&
    !session?.groupMembers;

  const isGroup = useMemo(
    () =>
      Boolean(session?.isGroup) ||
      studentNames.length > 1 ||
      (fromMembersOnly && studentNames.length >= 1),
    [session?.isGroup, fromMembersOnly, studentNames]
  );

  if (!isOpen || !session) return null;

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!ack || !reason.trim() || submitting) return;

    const payload = {
      subject: session.subject,
      section: session.section,
      mentor: session.mentor,
      date: session.date,
      reason: reason.trim(),
      notifyStudents: true, // mentor-specific hint (parent may ignore)
      action: "cancel",
    };

    try {
      setSubmitting(true);
      const ok = await onConfirm?.(payload); // parent enforces 24h policy + calls API
      if (ok) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay mentor-cancel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-title"
      onClick={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div className="modal-content">
        {/* Policy reminder (enforced in parent with a toast) */}
        <span className="tip-wrapper top-right" aria-describedby="cancel-policy-tip">
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
            Cancellations are allowed up to <strong>24 hours before</strong> the
            session start time.
          </span>
        </span>

        <h2 id="cancel-title">Cancel Session</h2>

        <p>
          <strong>{session.subject}</strong> — {session.section}
        </p>
        {/* For mentors, show students instead of mentor name */}
        {isGroup ? (
          <p className="meta" style={{ marginTop: 3 }}>
            Students: {studentNames.length ? studentNames.join(", ") : "—"}
          </p>
        ) : (
          <p className="meta" style={{ marginTop: 3 }}>
            Student: {studentNames[0] || "—"}
          </p>
        )}
        <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

        {/* Always show the form; parent blocks <24h with a toast */}
        <p className="hint" style={{ marginTop: "1rem" }}>
          The student(s) will be <strong>automatically</strong> emailed about this cancellation.
        </p>

        <form onSubmit={handleConfirm}>
          <div className="row full">
            <label className="label" htmlFor="cancel-reason">
              Reason for cancellation
            </label>
            <textarea
              id="cancel-reason"
              name="reason"
              rows="3"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., unavoidable conflict, emergency, illness"
              disabled={submitting}
            />
          </div>

          <div className="row full checkbox-row">
            <input
              id="acknowledge"
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={submitting}
            />
            <label htmlFor="acknowledge" className="checkbox-label">
              I understand this action will notify all students and cannot be undone.
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={submitting}>
              Close
            </button>
            <button
              type="submit"
              className="btn btn-primary btn--center-text"
              disabled={!ack || !reason.trim() || submitting}
              style={{
                background: "#dc2626",
                opacity: !ack || !reason.trim() || submitting ? 0.6 : 1,
                cursor: !ack || !reason.trim() || submitting ? "not-allowed" : "pointer",
              }}
              aria-disabled={!ack || !reason.trim() || submitting}
            >
              {submitting ? "Cancelling…" : "Confirm Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}