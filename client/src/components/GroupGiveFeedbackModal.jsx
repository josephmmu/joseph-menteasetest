import React, { useState, useEffect } from "react";
import "./GroupGiveFeedbackModal.css";
import "./GiveFeedbackModal.css";
import "./ViewFeedbackModal.css"; // for read-only feedback display styles
import ConfirmFeedbackModal from "./ConfirmFeedbackModal";

export default function GroupFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  onSessionComplete,
  onFeedbackUpdate,
  session,
  initialFeedback = {},
  accentColor,
  topic,
}) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [notes, setNotes] = useState("");
  const [draftNotes, setDraftNotes] = useState({});
  const [submittedFeedback, setSubmittedFeedback] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setNotes("");
        setIsEditing(false);
        onClose();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && session) {
      setSubmittedFeedback(initialFeedback);

      const studentsNeedingFeedback =
        session.students?.filter((s) => s.needsFeedback) || [];

      const firstIncompleteStudent = studentsNeedingFeedback.find(
        (student) => !initialFeedback[student.id]
      );

      if (studentsNeedingFeedback.length === 1) {
        setSelectedStudent(studentsNeedingFeedback[0]);
      } else if (firstIncompleteStudent) {
        setSelectedStudent(firstIncompleteStudent);
      } else {
        setSelectedStudent(null);
      }

      if (!isEditing) {
        setNotes("");
        setIsEditing(false);
      }
    }
  }, [isOpen, session, initialFeedback, isEditing]);

  useEffect(() => {
    if (selectedStudent) {
      setNotes(
        draftNotes[selectedStudent.id] ??
          submittedFeedback[selectedStudent.id]?.notes ??
          ""
      );
    }
  }, [selectedStudent, submittedFeedback, draftNotes]);

  // Update draft as user types
  const handleNotesChange = (e) => {
    const value = e.target.value;
    setNotes(value);
    if (selectedStudent) {
      setDraftNotes((prev) => ({
        ...prev,
        [selectedStudent.id]: value,
      }));
    }
  };

  if (!isOpen || !session) return null;

  const handleCancel = () => {
    setNotes("");
    setIsEditing(false);
    onClose();
  };

  const handleDoneWithConfirmation = () => {
    setShowConfirm(true);
  };

  const finalizeAllSubmissions = () => {
    if (onSessionComplete) {
      onSessionComplete(session, submittedFeedback);
    }
    setShowConfirm(false);
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedStudent) {
      alert("Please select a student to give feedback to.");
      return;
    }
    if (!notes.trim()) {
      alert("Please provide feedback comments.");
      return;
    }

    // Store studentId in the entry and send a keyed object to parent
    const feedbackEntry = {
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      notes: notes.trim(),
      submittedAt:
        new Date().toLocaleDateString() +
        " at " +
        new Date().toLocaleTimeString(),
    };

    const feedbackMap = {
      [selectedStudent.id]: feedbackEntry,
    };

    onSubmit?.(feedbackMap);

    const updatedSubmittedFeedback = {
      ...submittedFeedback,
      [selectedStudent.id]: feedbackEntry,
    };
    setSubmittedFeedback(updatedSubmittedFeedback);

    // Clear draft for this student
    setDraftNotes((prev) => {
      const updated = { ...prev };
      delete updated[selectedStudent.id];
      return updated;
    });

    if (onFeedbackUpdate) {
      onFeedbackUpdate(session.id, updatedSubmittedFeedback);
    }

    setNotes("");
    setIsEditing(false);
  };

  const studentsNeedingFeedback =
    session.students?.filter((s) => s.needsFeedback) || [];
  const isSingleStudent = studentsNeedingFeedback.length === 1;

  return (
    <div className="modal-overlay modal-overlay--scroll">
      <div
        className={`group-feedback-modal ${
          isSingleStudent ? "single-student" : ""
        }`}
        role="dialog"
        aria-modal="true"
      >
        <button className="ggf-close" aria-label="Close" onClick={handleCancel}>
          ×
        </button>

        <div className="ggf-content">
          {!isSingleStudent && (
            <div className="ggf-student-panel">
              <h3>Select Student</h3>
              <div className="student-list">
                {studentsNeedingFeedback.length === 0 ? (
                  <p className="no-students">
                    All students have received feedback for this session.
                  </p>
                ) : (
                  studentsNeedingFeedback.map((student) => {
                    const hasSubmitted = submittedFeedback[student.id];
                    return (
                      <button
                        key={student.id}
                        className={`student-item ${
                          selectedStudent?.id === student.id ? "selected" : ""
                        } ${hasSubmitted ? "completed" : ""}`}
                        onClick={() => setSelectedStudent(student)}
                      >
                        <span className="student-name">{student.name}</span>
                        <span className="student-status">
                          {hasSubmitted ? (
                            <span
                              style={{ color: "#16a34a", fontWeight: "600" }}
                            >
                              ✓ Completed
                            </span>
                          ) : (
                            "Needs feedback"
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="ggf-form-panel">
            {selectedStudent ? (
              <div
                className="ggf-feedback-content"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <h2 className="vf-title">
                  Feedback for {selectedStudent.name}
                </h2>
                <p className="vf-sub">
                  {session.subject} — {session.section}
                </p>
                <p className="vf-date">{session.date}</p>

                <div
                  style={{
                    margin: "1.2rem 0 1rem",
                    padding: "0.5rem 0.75rem",
                    background:
                      "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                    borderLeft: `3px solid ${accentColor || "#1d4ed8"}`,
                    borderRadius: "8px",
                    color: "#0f172a",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}
                  >
                    Topic:
                  </span>
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}
                  >
                    {topic || "—"}
                  </span>
                </div>

                {submittedFeedback[selectedStudent.id] ? (
                  <>
                    <div
                      className="vf-comment-block"
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div className="vf-comment-label">
                        Comment
                        <span
                          style={{
                            color: "#16a34a",
                            fontSize: "0.9rem",
                            fontWeight: "normal",
                            marginLeft: "8px",
                          }}
                        >
                          (Submitted on{" "}
                          {submittedFeedback[selectedStudent.id].submittedAt})
                        </span>
                      </div>
                      <div
                        className="vf-comment-box"
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
                        {submittedFeedback[selectedStudent.id].notes}
                      </div>
                    </div>

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setIsEditing(true);
                          setNotes(submittedFeedback[selectedStudent.id].notes);
                          const updatedSubmittedFeedback = {
                            ...submittedFeedback,
                          };
                          delete updatedSubmittedFeedback[selectedStudent.id];
                          setSubmittedFeedback(updatedSubmittedFeedback);

                          if (onFeedbackUpdate) {
                            onFeedbackUpdate(
                              session.id,
                              updatedSubmittedFeedback
                            );
                          }
                        }}
                      >
                        Edit Feedback
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          const remainingStudents =
                            studentsNeedingFeedback.filter(
                              (s) => !submittedFeedback[s.id]
                            );
                          if (remainingStudents.length > 0) {
                            setSelectedStudent(remainingStudents[0]);
                            setNotes("");
                          } else {
                            setSelectedStudent(null);
                          }
                        }}
                      >
                        Next Student
                      </button>
                    </div>
                  </>
                ) : (
                  <form
                    onSubmit={handleSubmit}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <label className="label">
                      Tell us about your experience
                    </label>
                    <textarea
                      className="gf-notes"
                      rows="6"
                      value={notes}
                      onChange={handleNotesChange}
                      placeholder="Share your observations about the student's engagement, understanding, areas for improvement, etc."
                      required
                      style={{ flex: 1, minHeight: "100px" }}
                    />

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleCancel}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary">
                        Submit Feedback
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="ggf-placeholder">
                {Object.keys(submittedFeedback).length ===
                  studentsNeedingFeedback.length &&
                studentsNeedingFeedback.length > 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <h3 style={{ color: "#16a34a", marginBottom: "1rem" }}>
                      ✓ All Feedback Submitted!
                    </h3>
                    <p style={{ marginBottom: "1rem", color: "#6b7280" }}>
                      You have successfully provided feedback for all{" "}
                      {studentsNeedingFeedback.length} students.
                    </p>
                    <div
                      className="modal-actions"
                      style={{ justifyContent: "center" }}
                    >
                      <button
                        className="btn btn-primary"
                        onClick={handleDoneWithConfirmation}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>
                    {isSingleStudent
                      ? "Loading..."
                      : "Select a student from the left panel to give feedback."}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reusable confirmation modal */}
      <ConfirmFeedbackModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={finalizeAllSubmissions}
        title="Are you sure you want to finalize all feedback submissions?"
        preface="Once confirmed:"
        bullets={[
          "All submitted feedback will be moved to your “Submitted” tab",
          "Changes can no longer be made to these feedback entries",
          "Students will receive your feedback notifications",
        ]}
        postface={
          <>
            Click <strong>OK</strong> to finalize or <strong>Cancel</strong> to
            continue editing.
          </>
        }
        confirmText="OK"
        cancelText="Cancel"
      />
    </div>
  );
}