// src/pages/student/StudentDashboard.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import "./StudentDashboard.css";
/* NEW: reuse MySchedule look (green highlight, dim, tooltip, join button styles) */
import "./MySchedule.css";
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

// utility — pick first truthy trimmed string (from SessionNotes.jsx)
const pick = (...cands) => {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
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

/* NEW: humanize ms for countdown in toast */
const humanizeMs = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || !h) parts.push(`${m}m`);
  return parts.join(" ");
};

/* NEW: ensure https:// for meeting links */
const ensureHttp = (url) => {
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
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

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastRafRef.current) {
      cancelAnimationFrame(toastRafRef.current);
      toastRafRef.current = 0;
    }

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

      const res = await fetch(`${API}/api/sessions/mine?as=student`, {
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

  // keep “now” fresh for live window detection & countdown hints (same as MySchedule)
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    const byId = new Map((allCourses || []).map((c) => [toIdString(c._id || c.id), c]));

    const enriched = (rawSessions || []).map((s) => {
      const courseId =
        toIdString(s.offeringID) ||
        toIdString(s.courseId) ||
        toIdString(s.courseID) || ""; // NEW: include courseID shape too

      const course = byId.get(courseId);
      const subject = course
        ? `${course.courseCode || ""} ${course.courseName || ""}`.trim()
        : "Course";
      const section = course?.section || "";
      const mentor = getMentorName(course) || "—";

      const start = s.scheduleStart || s.startISO;
      const end   = s.scheduleEnd   || s.endISO || null;

      const startTs = new Date(start).getTime();
      const endTs   = end ? new Date(end).getTime()
                          : (Number.isFinite(startTs) ? startTs + 30 * 60 * 1000 : NaN);

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
        endTs,
        subject,
        section,
        mentor,
        meetLink: meet,
        status: s.status || "pending",
        topic: s.topic || "—",
      };
    })
    // CHANGE: include sessions that are live (endTs > now), not just those that start in the future
    .filter((s) => {
      const endOrStart = Number.isFinite(s.endTs) ? s.endTs : s.startTs;
      return Number.isFinite(endOrStart) && endOrStart > now && s.status !== "cancelled";
    })
    .sort((a, b) => a.startTs - b.startTs)
    .slice(0, 5);

    return enriched;
    // IMPORTANT: depend on nowTs so this recalculates as time passes
  }, [rawSessions, allCourses, meetingLinks, nowTs]);

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

  /* ============ Recent Session Notes from DB ============ */
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [recentNotes, setRecentNotes] = useState([]);

  const fetchRecentNotes = useCallback(async () => {
    setNotesLoading(true);
    setNotesError("");
    try {
      const token = localStorage.getItem("token") || "";
      const headers = token
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };

      const res = await fetch(`${API}/api/session-notes/mine`, {
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        setRecentNotes([]);
        setNotesError("Failed to load session notes.");
      } else {
        const data = await res.json();
        const apiNotes = Array.isArray(data?.notes) ? data.notes : Array.isArray(data) ? data : [];

        const normalized = apiNotes.map((n, idx) => {
          const rs = n.rawSession || {};
          const subject = pick(
            n.subject, n.subjectText,
            rs.subject?.code, rs.subject?.name,
            rs.subjectCode, rs.subjectName,
            rs.course?.code, rs.course?.name,
            rs.courseCode, rs.courseName
          );
          const section = pick(
            n.section, n.sectionText,
            rs.section?.name, rs.section?.code,
            rs.sectionName, rs.sectionCode, rs.block, rs.section
          );
          const mentorName = pick(n.mentorName, n.mentorNameText, rs.mentorName);

          const startISO = pick(
            rs.scheduleStart,
            n.dateTimeISO,
            n.startsAt && new Date(n.startsAt).toISOString(),
            rs.startISO,
            rs.startDateTime
          );
          const endISO = pick(
            rs.scheduleEnd,
            n.endISO,
            rs.endISO
          );

          const topic = pick(n.topic, rs.topic);

          return {
            id:
              toIdString(n.sessionId) ||
              toIdString(n.id) ||
              toIdString(n.noteId) ||
              `note-${idx}`,
            subject: subject || "—",
            section: section || "",
            mentorName: mentorName || "—",
            startISO: startISO || "",
            endISO: endISO || "",
            topic: topic || "—",
          };
        });

        const sorted = normalized
          .slice()
          .sort((a, b) => (new Date(b.startISO).getTime() || 0) - (new Date(a.startISO).getTime() || 0))
          .slice(0, 5);

        setRecentNotes(sorted);
      }
    } catch (err) {
      console.error("Error fetching session notes:", err);
      setRecentNotes([]);
      setNotesError("An error occurred while loading session notes.");
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentNotes();
  }, [fetchRecentNotes]);

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

                  // ====== LIVE WINDOW & JOIN GATING (toast-only UX) ======
                  const hasTimes =
                    Number.isFinite(s.startTs) && Number.isFinite(s.endTs);
                  const live =
                    hasTimes && nowTs >= s.startTs && nowTs < s.endTs;
                  const canJoin = live;

                  return (
                    <div
                      className={`card upcoming-session is-colored ${
                        live ? "is-today" : "dimmed-not-live"
                      }`}
                      key={s.id}
                      style={cardVars(`${s.subject} ${s.section}`)}
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

                      {/* JOIN — toast-based gating */}
                      <button
                        className="action-btn join-btn status-badge"
                        data-disabled={!canJoin}
                        aria-label="JOIN NOW"
                        onClick={() => {
                          // HARD GUARDS with toasts
                          if (!hasTimes) {
                            showToast("Schedule time is missing. Please contact your mentor.", "error", 4200);
                            return;
                          }
                          if (nowTs < s.startTs) {
                            showToast(
                              `Not yet — you can join only ${formatWhenRange(s.startISO, s.endISO)} • Starts in ${humanizeMs(s.startTs - nowTs)}`,
                              "info",
                              4200
                            );
                            return;
                          }
                          if (nowTs >= s.endTs) {
                            showToast("This session has already ended.", "error", 4200);
                            return;
                          }

                          const url = (link || "").trim();
                          if (!url) {
                            showToast("No meeting link set by mentor yet.", "error");
                            return;
                          }

                          // Open notes popup first (your dashboard’s behavior)
                          openFloatingNote({
                            id: s.id,
                            subject: s.subject,
                            section: s.section,
                            topic: s.topic,
                            mentor: s.mentor,
                            date: s.startISO,
                          });

                          // Then go to meeting
                          window.location.assign(ensureHttp(url));
                        }}
                      >
                        <span className="join-btn__label">JOIN NOW</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Session Notes — now from DB & topic preview */}
          <div className="section notes-section">
            <h2>Recent Session Notes</h2>

            {notesLoading ? (
              <div className="card-grid notes-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div className="card skeleton-card" key={`notes-skel-${i}`} aria-hidden="true">
                    <div className="skeleton-line title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : notesError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>{notesError}</p>
            ) : recentNotes.length === 0 ? (
              <p className="empty-msg">No session notes available.</p>
            ) : (
              <div className="card-grid notes-grid">
                {recentNotes.map((note) => (
                  <div
                    className="card notes-card is-colored"
                    key={note.id}
                    style={cardVars(note.subject)}
                  >
                    <div className="card-content">
                      <p className="notes-date">
                        {formatWhenRange(note.startISO, note.endISO)}
                      </p>
                      <p className="notes-subject">
                        {note.subject} {note.section ? `- ${note.section}` : ""}
                      </p>
                      <p className="notes-mentor">Mentor: {note.mentorName || "—"}</p>

                      <div className="note-preview">
                        <strong>Topic:</strong> {note.topic?.trim() || "—"}
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
            )}
          </div>
        </main>
      </div>

      <BookSessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        subject={selectedSubject.subject}
        section={selectedSubject.section}
        mentor={selectedSubject.mentor}
        onCreated={() => {
          fetchSessions();
          fetchRecentNotes(); // refresh notes list too
          // optional: instantly nudge header notifications
          window.__notifyNotificationsChanged && window.__notifyNotificationsChanged();
        }}
        onUpdated={() => {
          fetchSessions();
          fetchRecentNotes();
          window.__notifyNotificationsChanged && window.__notifyNotificationsChanged();
        }}
        onDeleted={() => {
          fetchSessions();
          fetchRecentNotes();
          window.__notifyNotificationsChanged && window.__notifyNotificationsChanged();
        }}
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