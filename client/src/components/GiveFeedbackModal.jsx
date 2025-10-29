import React, { useEffect, useRef, useState } from "react";
import "./GiveFeedbackModal.css";
import ConfirmFeedbackModal from "./ConfirmFeedbackModal";
import { useCourseColor } from "../context/CourseColorContext";

export default function GiveFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  onSessionComplete,
  onFeedbackUpdate,
  sessionId,
  initialFeedback = null,
  mentorName,
  subject,
  section,
  dateTime,
  topic,
  accentColor
}) {
  const [notes, setNotes] = useState("");
  const [submittedFeedback, setSubmittedFeedback] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ESC closes confirm first, then modal
  useEffect(() => {
    if (!isOpen && !showConfirm) return;
    const onEsc = (e) => {
      if (e.key === "Escape") {
        if (showConfirm) setShowConfirm(false);
        else {
          setNotes("");
          setIsEditing(false);
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, showConfirm, onClose]);

  // Load any persisted feedback when opening
  useEffect(() => {
    if (isOpen) {
      setSubmittedFeedback(initialFeedback || null);
      if (!isEditing) {
        setNotes("");
        setIsEditing(false);
      }
    }
  }, [isOpen, initialFeedback, isEditing]);

  if (!isOpen) return null;

  const handleCancel = () => {
    setNotes("");
    setIsEditing(false);
    onClose();
  };

  const handleDoneWithConfirmation = () => setShowConfirm(true);

  const finalizeSubmit = () => {
    if (onSessionComplete && submittedFeedback) {
      onSessionComplete(submittedFeedback);
    }
    setShowConfirm(false);
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!notes.trim()) {
      alert("Please provide feedback comments.");
      return;
    }

    const entry = {
      notes: notes.trim(),
      submittedAt:
        new Date().toLocaleDateString() + " at " + new Date().toLocaleTimeString(),
    };

    onSubmit?.({ notes: entry.notes });
    setSubmittedFeedback(entry);

    if (onFeedbackUpdate && sessionId) {
      onFeedbackUpdate(sessionId, entry);
    }

    setNotes("");
    setIsEditing(false);
  };


  return (
      <div className="modal-overlay" aria-modal="true" role="dialog">
        <div
          className="modal-content feedback-modal"
          role="document"
          aria-labelledby="gf-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="gf-close" aria-label="Close" onClick={handleCancel}>
            ×
          </button>
  
          <h2 id="gf-title" className="gf-title">Feedback for {mentorName}</h2>
          <p className="gf-sub">
            {subject} — {section}
          </p>
          <p className="gf-date">{dateTime}</p>
  
         <div
          style={{
            margin: "1.2rem 0 1rem",
            padding: "0.5rem 0.75rem",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            borderLeft: `3px solid ${accentColor || "#1d4ed8"}`,
            borderRadius: "8px",
            color: "#0f172a",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span style={{ color: "#64748b", fontSize: "0.9rem", fontWeight: 600 }}>
            Topic:
          </span>
          <span style={{ color: "#64748b", fontSize: "0.9rem", fontWeight: 600  }}>{topic || "—"}</span>
        </div>
  
          {submittedFeedback ? (
            <>
              {/* Submitted, read-only block */}
              <label className="label" style={{ display: "block" }}>
                Comment
                <span
                  style={{
                    color: "#16a34a",
                    fontSize: "0.9rem",
                    fontWeight: "normal",
                    marginLeft: "8px",
                  }}
                >
                  (Submitted at {submittedFeedback.submittedAt})
                </span>
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
                  marginTop: "0.25rem",
                }}
              >
                {submittedFeedback.notes}
              </div>
  
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setIsEditing(true);
                    setNotes(submittedFeedback.notes);
                    setSubmittedFeedback(null);
                    if (onFeedbackUpdate && sessionId) {
                      onFeedbackUpdate(sessionId, null);
                    }
                  }}
                >
                  Edit Feedback
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDoneWithConfirmation}
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            // Editing form uses .label, .gf-notes, .modal-actions like GiveFeedbackModal
            <form onSubmit={handleSubmit}>
              <label className="label">Tell us about your experience</label>
              <textarea
                className="gf-notes"
                rows="6"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What went well? Anything to improve?"
                required
              />
  
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Feedback
                </button>
              </div>
            </form>
          )}
        </div>
  
        <ConfirmFeedbackModal
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={finalizeSubmit}
          title="Are you sure you want to finalize this feedback submission?"
          preface="Once confirmed:"
          bullets={[
            "This feedback will be moved to your “Submitted” tab",
            "Changes can no longer be made to this feedback entry",
            "The student will receive your feedback notification",
          ]}
          postface={
            <>
              Click <strong>OK</strong> to finalize or <strong>Cancel</strong> to continue editing.
            </>
          }
          confirmText="OK"
          cancelText="Cancel"
        />
      </div>
    );
  }