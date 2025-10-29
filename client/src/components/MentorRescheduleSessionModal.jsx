import React, { useMemo, useState, useEffect } from "react";
import "./BookSessionModal.css";

export default function MentorRescheduleSessionModal({
  isOpen,
  onClose,
  session, // { date: "September 10, 2025 - 10:00 AM", subject, section, students, topic, duration? }
  onSubmit,
}) {
  // Helper function to format students display
  const formatStudentDisplay = (students) => {
    if (!students || students.length === 0) return "No students";
    return students.join(", ");
  };

  // Helper function to get the correct label (Student vs Students)
  const getStudentLabel = (students) => {
    return students && students.length === 1 ? "Student" : "Students";
  };

  // build 15‑min steps
  const timeOptions = useMemo(
    () =>
      Array.from(
        { length: 96 },
        (_, i) =>
          `${String(i >> 2).padStart(2, "0")}:${String((i % 4) * 15).padStart(
            2,
            "0"
          )}`
      ),
    []
  );

  const fmt12 = (t) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    const h = +hStr,
      m = +mStr;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  // parse "September 10, 2025 - 10:00 AM"
  const parseIncoming = (str) => {
    const [datePart, timePart] = String(str).split(" - ");
    const d = new Date(`${datePart} ${timePart}`);
    if (isNaN(d)) return { date: "", time: "" };
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}`, jsDate: d };
  };

  const initial = useMemo(() => {
    const { date, time } = parseIncoming(session?.date || "");
    return {
      date,
      time,
      duration: String(session?.duration || 60),
      topic: session?.topic || "",
      reason: "",
    };
  }, [session]);

  const [formData, setFormData] = useState(initial);
  useEffect(() => setFormData(initial), [initial]);

  // === 24h policy check (based on original scheduled start) ===
  const sessionStart = useMemo(
    () => parseIncoming(session?.date || "").jsDate,
    [session]
  );
  const nowRef = useMemo(() => new Date(), []); // capture when modal opens
  const hoursUntil = useMemo(() => {
    if (!sessionStart) return null;
    return (sessionStart.getTime() - nowRef.getTime()) / (1000 * 60 * 60);
  }, [sessionStart, nowRef]);
  const canReschedule = hoursUntil !== null && hoursUntil >= 24;

  if (!isOpen || !session) return null;

  const handleChange = (e) =>
    setFormData((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canReschedule) return; // guard
    if (!formData.date || !formData.time) return;

    const payload = {
      subject: session.subject,
      section: session.section,
      student: session.students,
      date: formData.date,
      time: formData.time,
      duration: Number(formData.duration),
      topic: formData.topic,
      reason: formData.reason?.trim(),
    };

    onSubmit?.(payload);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <span
          className="tip-wrapper top-right"
          aria-describedby="reschedule-tip"
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
          <span id="reschedule-tip" className="tip-text">
            Rescheduling is allowed up to <strong>24 hours before</strong> the
            session start time.
          </span>
        </span>

        <h2>Reschedule Session</h2>
        <p>
          <strong>{session.subject}</strong> — {session.section}
        </p>
        <p>
          {getStudentLabel(session.students)}:{" "}
          {formatStudentDisplay(session.students)}
        </p>
        <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

        {!canReschedule ? (
          <>
            <p
              className="hint"
              style={{ color: "#b91c1c", fontWeight: 600, marginTop: "1rem" }}
            >
              This session begins in less than 24 hours. Per policy, you can't
              reschedule it here. Please contact your{" "}
              {session?.students && session.students.length === 1
                ? "student"
                : "students"}{" "}
              if you need to discuss options.
            </p>
            <div
              className="modal-actions"
              style={{ marginTop: "1.5rem", width: "100%" }}
            >
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background:
                    "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  borderRadius: "8px",
                }}
              >
                I Understand
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: "1rem" }}>
              The{" "}
              {session?.students && session.students.length === 1
                ? "student"
                : "students"}{" "}
              will be <strong>automatically emailed</strong> about this
              reschedule.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="col">
                  <label className="label">New Date</label>
                  <input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="col">
                  <label className="label">New Time</label>
                  <select
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select time</option>
                    {timeOptions.map((t) => (
                      <option key={t} value={t}>
                        {fmt12(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="col">
                  <label className="label">Duration (minutes)</label>
                  <select
                    name="duration"
                    value={formData.duration}
                    onChange={handleChange}
                  >
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">60 minutes</option>
                    <option value="90">90 minutes</option>
                  </select>
                </div>
                <div className="col">
                  <label className="label">Topic</label>
                  <input
                    type="text"
                    name="topic"
                    value={formData.topic}
                    onChange={handleChange}
                    placeholder="Session topic"
                  />
                </div>
              </div>

              <div className="row full">
                <label className="label">
                  Reason for rescheduling (optional)
                </label>
                <textarea
                  name="reason"
                  rows="3"
                  value={formData.reason}
                  onChange={handleChange}
                  placeholder="e.g., schedule conflict, urgent matter"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Reschedule Session
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
