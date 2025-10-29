import React, { useEffect, useState } from "react";
import "./GiveFeedbackModal.css";
import { useCourseColor } from "../context/CourseColorContext";

export default function ViewFeedbackModal({
  isOpen,
  onClose,
  feedback, // { date, subject, section, mentor, student, topic, comment, mentorComment, submittedAt, anonymous }
  viewerRole, // either "mentor" or "student"
  accentColor,
}) {
  const { getCourseColor } = useCourseColor();
  const [hover, setHover] = useState(false);
  const [hoverReady, setHoverReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Enable hover AFTER mount so it doesn’t trigger instantly under cursor
    const id = requestAnimationFrame(() => setHoverReady(true));
    return () => {
      cancelAnimationFrame(id);
      setHover(false);
      setHoverReady(false);
    };
  }, [isOpen]);

  if (!isOpen || !feedback || !viewerRole) return null;

  // Determine comment origin
  const isMentorComment = Boolean(feedback.mentorComment);
  const isStudentComment = Boolean(feedback.comment && !feedback.mentorComment);

  // Compute accent color from prop or fallback to subject/section
  const computedAccentColor =
    accentColor ||
    getCourseColor(feedback?.subject || feedback?.section) ||
    "#1d4ed8";

  let title = "Feedback";
  if (feedback.givenBy && feedback.givenTo) {
    title =
      feedback.givenBy === "You"
        ? `Feedback for ${feedback.givenTo}`
        : `Feedback from ${feedback.givenBy}`;
  }

  return (
    <div className="modal-overlay" aria-modal="true" role="dialog">
      <div
        className="modal-content feedback-modal"
        role="document"
        aria-labelledby="vf-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="vf-title" className="vf-title">
          {title}
        </h2>

        <p className="vf-sub">
          {feedback.subject} — {feedback.section}
        </p>
        <p className="vf-date">{feedback.date}</p>

        {feedback.anonymous && viewerRole === "mentor" && isStudentComment && (
          <div
            className="vf-badge"
            style={{
              marginTop: "0.75rem",
              display: "inline-block",
              background: "#fef3c7",
              color: "#92400e",
              padding: "0.3rem 0.6rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              borderRadius: "0.375rem",
            }}
          >
            Submitted Anonymously
          </div>
        )}

        {/* Topic block */}
        <div
          style={{
            margin: "1.5rem 0 2rem",
            padding: "0.5rem 0.75rem",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            borderLeft: `3px solid ${computedAccentColor}`,
            borderRadius: "8px",
            color: "#0f172a",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span
            style={{ color: "#64748b", fontSize: "0.9rem", fontWeight: 600 }}
          >
            Topic:
          </span>
          <span
            style={{ color: "#64748b", fontSize: "0.9rem", fontWeight: 600 }}
          >
            {feedback.topic || "—"}
          </span>
        </div>

        {/* Comment block */}
        <label className="label" style={{ display: "block" }}>
          Comment
          {feedback.submittedAt && (
            <span
              style={{
                color: "#16a34a",
                fontSize: "0.9rem",
                fontWeight: "normal",
                marginLeft: "8px",
              }}
            >
              (Submitted on {feedback.submittedAt})
            </span>
          )}
        </label>
        <div
          style={{
            width: "100%",
            padding: "0.6rem 0.7rem",
            border: "1px solid #0ea5e9",
            borderRadius: "10px",
            background: "#f0f9ff",
            color: "#0f172a",
            whiteSpace: "pre-wrap",
            minHeight: "120px",
            boxSizing: "border-box",
            marginTop: "1rem",
          }}
        >
          {feedback.mentorComment || feedback.comment || "—"}
        </div>

        {/* Footer close button */}
        <div className="modal-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            onClick={onClose}
            onMouseEnter={() => hoverReady && setHover(true)}
            onMouseLeave={() => hoverReady && setHover(false)}
            style={{
              background: hover ? "#1e3a8a" : "#fff",
              color: hover ? "#fff" : "#45588dff",
              border: "1px solid #93a7ddff",
              padding: "0.6rem 1.2rem",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
