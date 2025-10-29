// src/pages/student/StudentDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import "./StudentDashboard.css";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import BookSessionModal from "../../components/BookSessionModal";
import ProgramSelectionModal from "../../components/ProgramSelectionModal";
import { useCourseColor } from "../../context/CourseColorContext";
import { useAuth } from "../../context/AuthContext";
import { useSystemSettings } from "../../context/SystemSettingsContext";
import SessionNotesFloatingModal from "../../components/SessionNotesFloatingModal";

// ============== API helpers ==============
const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");

const pickArray = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.courses)) return json.courses;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.results)) return json.results;
  return [];
};

const toIdString = (val) => {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    if (val._id) return String(val._id).trim();
    if (val.$oid) return String(val.$oid).trim();
    if (val.$id) return String(val.$id).trim();
    if (val.id) return String(val.id).trim();
  }
  return String(val).trim();
};

// Robust mentor name resolver
const getMentorName = (course) => {
  const m =
    (typeof course?.assignedMentor === "string" && course.assignedMentor) ||
    (typeof course?.mentor === "string" && course.mentor) ||
    (typeof course?.mentorName === "string" && course.mentorName) ||
    (course?.mentor &&
      (course.mentor.name ||
        course.mentor.fullName ||
        [course.mentor.firstName, course.mentor.lastName].filter(Boolean).join(" "))) ||
    (typeof course?.mentorId === "object" &&
      (course.mentorId.name ||
        course.mentorId.fullName ||
        [course.mentorId.firstName, course.mentorId.lastName].filter(Boolean).join(" ")));
  return m || "—";
};

// Format a start–end range like: "28 July 2025 - 8:30 PM–9:00 PM" (AM/PM times)
const formatWhenRange = (startISO, endISO, fallbackMinutes = 30) => {
  if (!startISO) return "";
  const start = new Date(startISO);
  const end =
    endISO && !Number.isNaN(new Date(endISO).getTime())
      ? new Date(endISO)
      : new Date(start.getTime() + fallbackMinutes * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const date = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = (d) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  return `${date} - ${time(start)}–${time(end)}`;
};

export default function StudentDashboard() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState({});

  const { getCourseColor, normalizeCourseKey } = useCourseColor();
  const { user, updateUser } = useAuth();
  const { academicTerm } = useSystemSettings();

  const [showProgramModal, setShowProgramModal] = useState(false);

  /* ========= Toast (single, centered, portaled) ========= */
  const [toast, setToast] = useState(null); // { id, type, message }
  const toastTimerRef = useRef(null);
  const toastRafRef = useRef(0);

  const showToast = useCallback((message, type = "info", stayMs = 3000) => {
    if (!message) return;

    // Clear any existing timers/raf so the animation restarts cleanly
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastRafRef.current) {
      cancelAnimationFrame(toastRafRef.current);
      toastRafRef.current = 0;
    }

    // Clear current toast to reset CSS animation, then set the new one on next frame
    setToast((t) => (t ? { ...t, message: "" } : { id: null, type, message: "" }));

    toastRafRef.current = requestAnimationFrame(() => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToast({ id, type, message });
      toastTimerRef.current = setTimeout(() => setToast(null), stayMs);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (toastRafRef.current) cancelAnimationFrame(toastRafRef.current);
    };
  }, []);

  // Meeting links (JOIN)
  const [meetingLinks, setMeetingLinks] = useState({});

  // Notes modal
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesSession, setNotesSession] = useState(null);

  // Program modal gating
  useEffect(() => {
    if (user && (!user.program || user.program === "" || user.program === null)) {
      setShowProgramModal(true);
    } else {
      setShowProgramModal(false);
    }
  }, [user]);

  const handleProgramSelected = (updatedUser) => {
    updateUser(updatedUser);
    setShowProgramModal(false);
    showToast("Program selected successfully!", "success");
  };

  // Resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const isMobile = windowWidth <= 1152;

  // Hydrate meeting links from storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("meetingLinks");
      if (raw) setMeetingLinks(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to read meetingLinks from localStorage", e);
    }
  }, []);

  // ============== Load subjects ==============
  const [allCourses, setAllCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState("");

  const studentId = toIdString(user?._id || user?.id);

  const fetchCourses = useCallback(async () => {
    if (!studentId) {
      setIsLoadingCourses(false);
      setCoursesError("");
      setAllCourses([]);
      return;
    }

    setIsLoadingCourses(true);
    setCoursesError("");

    const token = localStorage.getItem("token");
    const headers = token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };

    try {
      const url = `${API}/api/courses/mine`;
      const res = await fetch(url, { headers, credentials: "include" });
      if (!res.ok) {
        setCoursesError("Failed to load subjects. Please try again.");
        setAllCourses([]);
        return;
      }
      const data = await res.json();
      setAllCourses(pickArray(data));
    } catch (err) {
      console.error("Error fetching courses:", err);
      setCoursesError("An error occurred while loading subjects.");
    } finally {
      setIsLoadingCourses(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // My Subjects
  const mySubjectsData = useMemo(() => {
    const mapped = (allCourses || []).map((c) => {
      const subject = `${c.courseCode || ""} ${c.courseName || ""}`.trim();
      const mentorName = getMentorName(c);

      return {
        _id: c._id || c.id,
        subject: subject || c.courseName || c.courseCode || "Untitled Course",
        section: c.section || "",
        mentor: mentorName,
        defaultMeetLink: c.defaultMeetLink || "",
        raw: c,
      };
    });

    const ml = { ...(meetingLinks || {}) };
    mapped.forEach((m) => {
      const key = `${m.subject}__${m.section}`;
      if (m.defaultMeetLink) ml[key] = m.defaultMeetLink;
    });
    try {
      localStorage.setItem("meetingLinks", JSON.stringify(ml));
    } catch {}
    setMeetingLinks(ml);

    return mapped;
  }, [allCourses]); // intentionally not depending on meetingLinks to avoid loop

  // ===== sessions: fetch & derive "upcoming" =====
  const [rawSessions, setRawSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionsError("");
    try {
      const token = localStorage.getItem("token");
      const headers = token
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };

      const res = await fetch(`${API}/api/sessions/mine`, {
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        setRawSessions([]);
        setSessionsError("Failed to load sessions.");
      } else {
        const data = await res.json();
        setRawSessions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Error fetching sessions:", e);
      setRawSessions([]);
      setSessionsError("An error occurred while loading sessions.");
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const cardVars = (subject) => {
    const base = getCourseColor(normalizeCourseKey(subject || ""));
    return {
      borderTop: `4px solid ${base}`,
      "--accent": base,
      "--accentHover": base,
      "--accentRing": "rgba(0,0,0,0.08)",
    };
  };

  // Derive upcoming from rawSessions + allCourses
  const upcomingSessions = useMemo(() => {
    const now = Date.now();

    const byId = new Map(
      (allCourses || []).map((c) => [toIdString(c._id || c.id), c])
    );

    const enriched = (rawSessions || [])
      .map((s) => {
        const courseId =
          toIdString(s.offeringID) || toIdString(s.courseId) || "";
        const course = byId.get(courseId);
        const subject = course
          ? `${course.courseCode || ""} ${course.courseName || ""}`.trim()
          : "Course";
        const section = course?.section || "";
        const mentor = getMentorName(course) || "—";
        const start = s.scheduleStart || s.startISO;
        const end = s.scheduleEnd || s.endISO || null;
        const startTs = new Date(start).getTime();
        const meet =
          s.meetLink ||
          (meetingLinks[`${subject}__${section}`] || "") ||
          course?.defaultMeetLink ||
          "";

        return {
          id: s.sessionId || s._id || `${courseId}-${start}`,
          startISO: start,
          endISO: end,
          startTs,
          subject,
          section,
          mentor,
          meetLink: meet,
          status: s.status || "pending",
          topic: s.topic || "—",
        };
      })
      .filter((s) => s.startTs && s.startTs >= now && s.status !== "cancelled")
      .sort((a, b) => a.startTs - b.startTs)
      .slice(0, 5);

    return enriched;
  }, [rawSessions, allCourses, meetingLinks]);

  const deriveExcerptFromTopics = (text = "") => {
    const firstMeaningful = (text || "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l) || "";
    const cleaned = firstMeaningful
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\)\s+/, "")
      .replace(/^\d+\.\s+/, "");
    const MAX = 100;
    return cleaned.length > MAX ? `${cleaned.slice(0, MAX).trim()}…` : cleaned;
  };

  const openFloatingNote = (payload) => {
    const d = new Date(payload.startISO || payload.date || payload.dateTime);
    const safeISO = (isNaN(d.getTime()) ? new Date() : d).toISOString();

    const qs = new URLSearchParams({
      id: payload.id
        ? payload.id
        : `${normalizeCourseKey(`${payload.subject} ${payload.section}`)}__${safeISO}`,
      subject: payload.subject || "",
      section: payload.section || "",
      topic: payload.topic || "",
      mentorName: payload.mentor || payload.mentorName || "",
      dateTimeISO: safeISO,
    }).toString();

    const win = window.open(
      `/session-notes-popup?${qs}`,
      "MentEaseNotes",
      "width=560,height=640,left=100,top=100"
    );
    if (!win) {
      showToast("Please allow pop-ups to open the Session Notes window.", "error");
    } else {
      try {
        win.focus();
      } catch {}
    }
  };

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />

      {/* Toast (single, centered, portaled) */}
      {toast &&
        createPortal(
          <div
            key={toast.id}
            className={`toast ${toast.type}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {toast.message}
          </div>,
          document.body
        )}

      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Dashboard" />}

        <main className="dashboard-main scrollable-content">
          {/* My Subjects */}
          <div
            className="section subjects-section"
            aria-busy={isLoadingCourses}
            aria-live="polite"
          >
            <h2>My Subjects</h2>

            {isLoadingCourses ? (
              <div className="card-grid mysubjects-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="card skeleton-card" key={`skeleton-${i}`} aria-hidden="true">
                    <div className="skeleton-line title" />
                    <div className="skeleton-chip" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : coursesError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>{coursesError}</p>
            ) : mySubjectsData.length === 0 ? (
              <p className="empty-msg">No assigned subjects yet.</p>
            ) : (
              <div className="card-grid mysubjects-grid">
                {mySubjectsData.map((item) => (
                  <div
                    className="card is-colored"
                    key={item._id || `${item.subject}-${item.section}`}
                    style={cardVars(`${item.subject} ${item.section}`)}
                  >
                    <p className="subject-title">
                      {item.subject}
                      {item.section ? ` - ${item.section}` : ""}
                    </p>
                    <p className="mentor-name">Mentor: {item.mentor}</p>
                    <button
                      className="action-btn"
                      onClick={() => {
                        setSelectedSubject(item);
                        setModalOpen(true);
                      }}
                    >
                      BOOK SESSION
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Sessions */}
          <div className="section sessions-section">
            <h2>Upcoming Sessions</h2>
            {isLoadingSessions ? (
              <div className="card-grid sessions-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div className="card skeleton-card" key={`sess-skel-${i}`} aria-hidden="true">
                    <div className="skeleton-line title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : sessionsError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>{sessionsError}</p>
            ) : upcomingSessions.length === 0 ? (
              <p className="empty-msg">No upcoming sessions.</p>
            ) : (
              <div className="card-grid sessions-grid">
                {upcomingSessions.map((s) => {
                  const key = `${s.subject}__${s.section}`;
                  const link = s.meetLink || meetingLinks[key] || "";
                  return (
                    <div
                      className="card upcoming-session is-colored"
                      key={s.id}
                      style={cardVars(s.subject)}
                    >
                      {/* 1) Date/Time (start–end) */}
                      <p className="session-date">
                        {formatWhenRange(s.startISO, s.endISO)}
                      </p>

                      {/* 2) Subject & Section */}
                      <p className="session-subject">
                        {s.subject} {s.section ? `- ${s.section}` : ""}
                      </p>

                      {/* 3) Topic */}
                      <div className="session-topic">
                        <span className="row-label">Topic:</span>
                        <span className="topic-text">{s.topic || "—"}</span>
                      </div>

                      {/* 4) Mentor */}
                      <p className="session-people">Mentor: {s.mentor}</p>

                      {/* Join */}
                      <button
                        className="action-btn"
                        onClick={() => {
                          if (!link) {
                            showToast("No meeting link set by mentor yet.", "error");
                            return;
                          }
                          openFloatingNote({
                            id: s.id,
                            subject: s.subject,
                            section: s.section,
                            topic: s.topic,
                            mentor: s.mentor,
                            date: s.startISO,
                          });
                          window.location.assign(link);
                        }}
                      >
                        JOIN NOW
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Session Notes (demo) */}
          <div className="section notes-section">
            <h2>Recent Session Notes</h2>
            <div className="card-grid notes-grid">
              {[
                {
                  id: "it115-s3103-2025-07-28-2046",
                  subject: "MO-IT115 Object-Oriented Analysis and Design",
                  section: "S3103",
                  mentor: "Mr. Nestor Villanueva",
                  dateTime: "July 28, 2025 - 8:46 PM",
                  excerpt: "08:46 — Recap: inconsistent actor lifelines on prior draft",
                },
                {
                  id: "it161-a1303-2025-07-30-1530",
                  subject: "MO-IT161 Web Systems and Technology",
                  section: "A3103",
                  mentor: "Mr. Bryan Reyes",
                  dateTime: "July 30, 2025 - 3:30 PM",
                  excerpt: "Covered principles of responsive web design using flex and grid.",
                },
              ]
                .map((n) => ({ ...n, _dt: new Date(n.dateTime) }))
                .filter((n) => n._dt)
                .sort((a, b) => b._dt - a._dt)
                .slice(0, 5)
                .map((note) => (
                  <div
                    className="card notes-card is-colored"
                    key={note.id}
                    style={cardVars(note.subject)}
                  >
                    <div className="card-content">
                      <p className="notes-date">{note.dateTime}</p>
                      <p className="notes-subject">
                        {note.subject} - {note.section}
                      </p>
                      <p className="notes-mentor">{note.mentor}</p>
                      <div className="note-preview">
                        {deriveExcerptFromTopics(note.excerpt)}
                      </div>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => openFloatingNote(note)}
                      >
                        View Session Notes
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </main>
      </div>

      <BookSessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        subject={selectedSubject.subject}
        section={selectedSubject.section}
        mentor={selectedSubject.mentor}
        onCreated={fetchSessions}
        onUpdated={fetchSessions}
        onDeleted={fetchSessions}
      />

      <ProgramSelectionModal
        isOpen={showProgramModal}
        onClose={() => {}} // user must pick a program
        user={user}
        onProgramSelected={handleProgramSelected}
      />

      <SessionNotesFloatingModal
        mode="modal"
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
        session={notesSession}
        currentUser={{ id: toIdString(user?._id || user?.id), name: user?.name || "" }}
        onAutosave={async () => {}}
        onFinalize={async () => {}}
      />
    </div>
  );
}