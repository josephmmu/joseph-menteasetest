import React, { useMemo, useState } from "react";
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

export default function CancelBookingModal({
  isOpen,
  onClose,
  session,
  onConfirm,
}) {
  const getSessionStart = (s) => {
    if (s?.startISO) {
      const d = new Date(s.startISO);
      return isNaN(d.getTime()) ? null : d;
    }
    const raw = String(s?.date || "");
    const [datePart, timesPart] = raw.split(" - ");
    if (!datePart || !timesPart) return null;
    const startTime = timesPart.split(/[–-]/)[0]?.trim();
    const d = new Date(`${datePart} ${startTime}`);
    return isNaN(d.getTime()) ? null : d;
  };

  const sessionStart = useMemo(() => getSessionStart(session), [session]);

  const hoursUntil = useMemo(() => {
    if (!sessionStart) return null;
    return (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
  }, [sessionStart, isOpen]);

  const canCancel = hoursUntil !== null && hoursUntil >= 24;

  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);

  // teammates (names) if group
  const studentNames = extractStudentNames(
    session?.students || session?.members
  );
  const fromMembersOnly =
    !!session?.members &&
    !session?.students &&
    !session?.participants &&
    !session?.attendees &&
    !session?.group &&
    !session?.groupMembers;
  const isGroup =
    Boolean(session?.isGroup) ||
    studentNames.length > 1 ||
    (fromMembersOnly && studentNames.length >= 1);

  if (!isOpen || !session) return null;

  const handleConfirm = (e) => {
    e.preventDefault();
    if (!canCancel || !ack) return;
    if (!reason.trim()) return; // require a reason

    const payload = {
      subject: session.subject,
      section: session.section,
      mentor: session.mentor,
      date: session.date,
      reason: reason.trim(),
      notifyMentor: true,
      action: "cancel",
    };

    onConfirm?.(payload);
    onClose();
  };

  return (
    <div
      className="modal-overlay mentor-cancel"
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
            Cancellations are allowed up to <strong>24 hours before</strong> the
            session start time.
          </span>
        </span>

        <h2 id="cancel-title">Cancel Booking</h2>

        <p>
          <strong>{session.subject}</strong> — {session.section}
        </p>
        <p>Mentor: {session.mentor}</p>
        {isGroup && studentNames.length > 0 && (
          <p className="meta" style={{ marginTop: 3 }}>
            Group members: {studentNames.join(", ")}
          </p>
        )}
        <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

        {!canCancel ? (
          <>
            <p
              className="hint"
              role="alert"
              style={{ color: "#b91c1c", fontWeight: 600, marginTop: "1rem" }}
            >
              This session begins in less than 24 hours. Per policy, you can’t
              cancel it here. Please contact your mentor if you need to discuss
              options.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary btn--center-text"
                style={{ background: "#1e3a8a" }}
              >
                I Understand
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: "1rem" }}>
              The mentor will be <strong>automatically emailed</strong> about
              this cancellation.
            </p>

            <form onSubmit={handleConfirm}>
              <div className="row full">
                <label className="label" htmlFor="cancel-reason">Reason for cancellation</label>
                <textarea
                  id="cancel-reason"
                  name="reason"
                  rows="3"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., schedule conflict, urgent matter"
                />
              </div>

              <div className="row full checkbox-row">
                <input
                  id="acknowledge"
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <label htmlFor="acknowledge" className="checkbox-label">
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
                  className="btn btn-primary btn--center-text"
                  disabled={!ack || !reason.trim()}
                  style={{
                    background: "#dc2626",
                    opacity: !ack || !reason.trim() ? 0.6 : 1,
                    cursor: !ack || !reason.trim() ? "not-allowed" : "pointer",
                  }}
                  aria-disabled={!ack || !reason.trim()}
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}