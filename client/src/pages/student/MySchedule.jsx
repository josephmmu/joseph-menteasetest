// src/pages/student/MySchedule.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./MySchedule.css";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import RescheduleSessionModal from "../../components/RescheduleSessionModal";
import CancelBookingModal from "../../components/CancelBookingModal";
import { useCourseColor } from "../../context/CourseColorContext";
import {
  getProgramFromCode,
  getYearFromSectionDigit,
  ordinal,
} from "../../utils/programYear";

/* =========================
   API helpers / utils
   ========================= */
const API = (
  import.meta?.env?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const tokenHeaders = () => {
  const t = localStorage.getItem("token");
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

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

const getMentorName = (course) => {
  const m =
    (typeof course?.assignedMentor === "string" && course.assignedMentor) ||
    (typeof course?.mentor === "string" && course.mentor) ||
    (typeof course?.mentorName === "string" && course.mentorName) ||
    (course?.mentor &&
      (course.mentor.name ||
        course.mentor.fullName ||
        [course.mentor.firstName, course.mentor.lastName]
          .filter(Boolean)
          .join(" "))) ||
    (typeof course?.mentorId === "object" &&
      (course.mentorId.name ||
        course.mentorId.fullName ||
        [course.mentorId.firstName, course.mentorId.lastName]
          .filter(Boolean)
          .join(" ")));
  return m || "—";
};

/** Normalize any student/participant array into display names */
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

/* Date + time range like "28 July 2025 - 8:30 PM–9:00 PM" (AM/PM times) */
const formatDateTimeRange = (startISO, endISO, fallbackMinutes = 30) => {
  if (!startISO) return "";
  const start = new Date(startISO);
  const end =
    endISO && !Number.isNaN(new Date(endISO).getTime())
      ? new Date(endISO)
      : new Date(start.getTime() + fallbackMinutes * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const dateStr = start.toLocaleDateString("en-GB", {
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

  return `${dateStr} - ${time(start)}–${time(end)}`;
};

/* Humanize ms for feedback ("Starts in 1h 12m") */
const humanizeMs = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || !h) parts.push(`${m}m`);
  return parts.join(" ");
};

/* Ensure https:// prefix for external links */
const ensureHttp = (url) => {
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/* ===== ensure a Session Note exists and return current text ===== */
const MAX_QS_TEXT = 1600;
async function ensureSessionNote(session) {
  try {
    const body = {
      sessionId: session.sessionId || session.id || session._id,
      subject: session.subject,
      section: session.section,
      mentorName: session.mentor,
      // keep sending start time to the API for note metadata
      dateTimeISO: session.startISO || new Date().toISOString(),
      topic: session.topic || "",
    };
    const res = await fetch(`${API}/api/session-notes/ensure`, {
      method: "POST",
      headers: tokenHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("ensure failed");
    const j = await res.json();
    const note = j?.note || {};
    return {
      topics: String(note.topicsDiscussed || "").slice(0, MAX_QS_TEXT),
      next: String(note.nextSteps || "").slice(0, MAX_QS_TEXT),
    };
  } catch (e) {
    console.warn("[ensureSessionNote] Continuing without prefill:", e?.message);
    return { topics: "", next: "" };
  }
}

function StatusBadge({ kind, reason }) {
  const [open, setOpen] = useState(false);
  const label = kind === "cancelled" ? "Cancelled" : "Rescheduled";
  const hasReason = Boolean(reason && String(reason).trim());

  return (
    <span
      className={`status-badge ${kind}`}
      tabIndex={hasReason ? 0 : -1}
      aria-haspopup={hasReason ? "true" : undefined}
      aria-label={hasReason ? `${label}. Why? ${reason}` : label}
      data-open={open && hasReason ? "true" : "false"}
      onClick={(e) => {
        if (!hasReason) return;
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onBlur={() => setOpen(false)}
    >
      {label}
      {hasReason && (
        <span className="status-tip" role="tooltip">
          <strong className="status-tip__title">Why?</strong>
          <span className="status-tip__body">{reason}</span>
        </span>
      )}
    </span>
  );
}

export default function MySchedule() {
  const [activeTab, setActiveTab] = useState("upcoming");

  // ===== Toast (single toast, portaled) =====
  const [toast, setToast] = useState(null); // { id, type, message }
  const toastTimerRef = useRef(null);
  const toastRafRef = useRef(0);

  const showToast = useCallback((message, type = "success", stayMs = 3000) => {
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

  // Layout / menus
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [dropUpIndex, setDropUpIndex] = useState(null);
  const menuRefs = useRef([]);
  const navigate = useNavigate();

  // Modals
  const [showResched, setShowResched] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showCancel, setShowCancel] = useState(false);

  // Meeting links (course default): local cache + server default
  const [meetingLinks, setMeetingLinks] = useState({});

  const isMobile = windowWidth <= 1152;
  const { getYearColor, normalizeCourseKey } = useCourseColor();

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const currentMenu = menuRefs.current[openMenuIndex];
      if (
        openMenuIndex !== null &&
        currentMenu &&
        !currentMenu.contains(event.target)
      ) {
        setOpenMenuIndex(null);
        setDropUpIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuIndex]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("meetingLinks");
      if (raw) setMeetingLinks(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to read meetingLinks from localStorage", e);
    }
  }, []);

  /* ========= fetch courses ========= */
  const [allCourses, setAllCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const res = await fetch(`${API}/api/courses/mine`, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        setAllCourses([]);
      } else {
        const data = await res.json();
        setAllCourses(pickArray(data));
      }
    } catch (e) {
      console.error("Failed to fetch courses:", e);
      setAllCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  /* ========= fetch sessions ========= */
  const [rawSessions, setRawSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API}/api/sessions/mine?as=student`, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        setRawSessions([]);
      } else {
        const data = await res.json();
        setRawSessions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
      setRawSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const accentVarsFor = (subject, section) => {
    const key = normalizeCourseKey(`${subject || ""} ${section || ""}`);
    const accent = getYearColor(key);
    return { "--accent": accent, "--accentRing": "rgba(0,0,0,0.08)" };
  };

  const courseById = useMemo(() => {
    const m = new Map();
    (allCourses || []).forEach((c) => {
      m.set(toIdString(c._id || c.id), c);
    });
    return m;
  }, [allCourses]);

  const normalizedSessions = useMemo(() => {
    const list = [];
    (rawSessions || []).forEach((s) => {
      const courseId =
        toIdString(s.offeringID) ||
        toIdString(s.courseId) ||
        toIdString(s.courseID) ||
        "";
      const course = courseById.get(courseId);

      const subject = course
        ? `${course.courseCode || ""} ${course.courseName || ""}`.trim()
        : "Course";
      const section = course?.section || "";
      const mentor = getMentorName(course);

      const startISO = s.scheduleStart || s.startISO;
      const endISO = s.scheduleEnd || s.endISO;

      const display = formatDateTimeRange(startISO, endISO);
      const start = startISO ? new Date(startISO) : null;
      const end = endISO ? new Date(endISO) : null;

      const duration =
        start && end ? Math.max(0, Math.round((end - start) / (60 * 1000))) : 30;

      const endTs =
        end && !Number.isNaN(end.getTime())
          ? end.getTime()
          : start && !Number.isNaN(start.getTime())
          ? start.getTime() + duration * 60 * 1000
          : NaN;

      const pairKey = `${subject}__${section}`;
      const meetLink =
        s.meetLink ||
        meetingLinks[pairKey] ||
        course?.defaultMeetLink ||
        "";

      const rawStudents =
        s.students ||
        s.participants ||
        s.attendees ||
        s.members ||
        s.group ||
        s.groupMembers ||
        [];
      const studentNames = extractStudentNames(rawStudents);

      const fromMembersOnly =
        !!s.members &&
        !s.students &&
        !s.participants &&
        !s.attendees &&
        !s.group &&
        !s.groupMembers;

      const isGroup =
        Boolean(s.isGroup) ||
        (s.capacity && s.capacity > 1) ||
        studentNames.length > 1 ||
        (fromMembersOnly && studentNames.length >= 1);

      const cancelReason =
        s.cancellationReason ||
        s.cancelReason ||
        s.cancel_note ||
        s.cancelNote ||
        s.meta?.cancelReason ||
        ((s.status || "").toLowerCase() === "cancelled" ? s.reason : "") ||
        "";

      const rescheduleReason =
        s.rescheduleReason ||
        s.rescheduledReason ||
        s.reschedule_note ||
        s.rescheduleNote ||
        s.meta?.rescheduleReason ||
        ((s.status || "").toLowerCase() === "rescheduled" ? s.reason : "") ||
        "";

      list.push({
        id: s.sessionId || s._id || `${courseId}-${startISO}`,
        sessionId: s.sessionId || s._id || `${courseId}-${startISO}`,
        date: display,
        startISO,
        endISO,
        _startTs: start ? start.getTime() : NaN,
        _endTs: endTs,
        subject,
        section,
        mentor,
        topic: s.topic || "—",
        duration,
        recordingUrl: (s.recordingUrl || "").trim(),
        status: typeof s.status === "string" ? s.status : "booked",
        meetLink,
        students: studentNames,
        isGroup,
        cancelReason,
        rescheduleReason,
        apiId: s.sessionId || s._id, // used by attendance beacon
      });
    });
    return list;
  }, [rawSessions, courseById, meetingLinks]);

  const { upcomingSorted, pastSorted } = useMemo(() => {
    const now = Date.now();
    const upcoming = [];
    const past = [];
    (normalizedSessions || []).forEach((x) => {
      if ((x.status || "").toLowerCase() === "cancelled") {
        past.push(x);
        return;
      }
      const endTs = Number(x._endTs);
      if (!Number.isFinite(endTs)) {
        upcoming.push(x);
        return;
      }
      if (endTs > now) upcoming.push(x);
      else past.push(x);
    });
    upcoming.sort((a, b) => (a._startTs || 0) - (b._startTs || 0));
    past.sort((a, b) => (b._endTs || 0) - (a._endTs || 0));
    return { upcomingSorted: upcoming, pastSorted: past };
  }, [normalizedSessions]);

  const [pageUpcoming, setPageUpcoming] = useState(1);
  const [pagePast, setPagePast] = useState(1);
  const perPage = 6;

  useEffect(() => {
    if (activeTab === "upcoming") setPageUpcoming(1);
    else setPagePast(1);
  }, [activeTab]);

  useEffect(() => {
    setPageUpcoming(1);
  }, [upcomingSorted.length]);
  useEffect(() => {
    setPagePast(1);
  }, [pastSorted.length]);

  useEffect(() => {
    setOpenMenuIndex(null);
    setDropUpIndex(null);
  }, [pageUpcoming, pagePast, activeTab]);

  const fullList = activeTab === "upcoming" ? upcomingSorted : pastSorted;
  const currentPage = activeTab === "upcoming" ? pageUpcoming : pagePast;
  const totalPages = Math.ceil(fullList.length / perPage) || 1;
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, fullList.length);
  const list = fullList.slice(startIndex, endIndex);
  const setPage = (p) => {
    if (activeTab === "upcoming")
      setPageUpcoming(Math.max(1, Math.min(totalPages, p)));
    else setPagePast(Math.max(1, Math.min(totalPages, p)));
  };

  const anyLoading = coursesLoading || sessionsLoading;

  // keep “now” fresh for live window detection & countdown hints
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const handleReschedule = useCallback(
    async (payload) => {
      try {
        const MIN_LEAD_MS = 24 * 60 * 60 * 1000;
        const newStartMs = new Date(payload?.startISO || "").getTime();
        if (!Number.isFinite(newStartMs)) {
          showToast("Invalid new start time.", "error");
          return false;
        }
        if (newStartMs - Date.now() < MIN_LEAD_MS) {
          showToast("New time must be at least 24 hours from now.", "error");
          return false;
        }

        const id =
          selectedSession?.sessionId ||
          selectedSession?.id ||
          selectedSession?._id;
        if (!id) return false;

        const res = await fetch(`${API}/api/sessions/${id}`, {
          method: "PATCH",
          headers: tokenHeaders(),
          credentials: "include",
          body: JSON.stringify({
            startISO: payload.startISO,
            endISO: payload.endISO,
            status: "rescheduled",
            rescheduleReason: payload.reason,
            sessionTopic: payload.topic,
          }),
        });

        if (!res.ok) return false;
        await fetchSessions();
        showToast("Session rescheduled.", "success");
        return true;
      } catch (e) {
        console.error("Reschedule PATCH failed:", e);
        return false;
      }
    },
    [selectedSession, fetchSessions, showToast]
  );

  const handleCancel = useCallback(
    async (payload) => {
      try {
        const id =
          selectedSession?.sessionId ||
          selectedSession?.id ||
          selectedSession?._id;
        if (!id) return false;

        const status = (selectedSession?.status || "").trim().toLowerCase();
        if (status === "cancelled") {
          showToast("This session is already cancelled.", "error");
          return false;
        }

        const msUntil =
          (typeof selectedSession?._startTs === "number"
            ? selectedSession._startTs
            : NaN) - Date.now();
        if (!Number.isFinite(msUntil) || msUntil < 24 * 60 * 60 * 1000) {
          showToast(
            "Cancellations must be made at least 24 hours prior to the scheduled session.",
            "error"
          );
          return false;
        }

        const reason = encodeURIComponent(payload?.reason || "");
        const url = `${API}/api/sessions/${id}?reason=${reason}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: tokenHeaders(),
          credentials: "include",
        });

        if (!res.ok) {
          let msg = "Failed to cancel session.";
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch (_) {}
          showToast(msg, "error");
          return false;
        }

        await fetchSessions();
        showToast("Booking cancelled.", "success");
        return true;
      } catch (e) {
        console.error("Cancel DELETE failed:", e);
        showToast("Network error while cancelling.", "error");
        return false;
      }
    },
    [selectedSession, fetchSessions, showToast]
  );

  const getPaginationItems = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const base = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - current) <= 1) base.push(i);
    }
    const items = [];
    let prev = 0;
    for (const p of base) {
      if (prev) {
        const gap = p - prev;
        if (gap === 2) items.push(prev + 1);
        else if (gap > 2) items.push("...");
      }
      items.push(p);
      prev = p;
    }
    return items;
  };

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />

      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="My Schedule" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>My Schedule</h2>

            <div className="tabs">
              <button
                className={`tab-button ${activeTab === "upcoming" ? "active" : ""}`}
                onClick={() => setActiveTab("upcoming")}
              >
                Upcoming
              </button>
              <button
                className={`tab-button ${activeTab === "past" ? "active" : ""}`}
                onClick={() => setActiveTab("past")}
              >
                Past
              </button>
            </div>

            <div
              className={`schedule-list ${!anyLoading && list.length === 0 ? "empty" : ""}`}
              aria-busy={anyLoading}
            >
              {anyLoading && (
                <>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={`skel-${i}`}
                      className="schedule-card skeleton-card"
                      aria-hidden="true"
                    >
                      <div className="year-chip-skel skeleton" />
                      <div className="schedule-info">
                        <div className="skeleton skel-line skel-date" />
                        <div className="skeleton skel-line skel-subject" />
                        <div className="skeleton skel-line skel-mentor" />
                        <div className="bottom-row">
                          <div className="skeleton skel-topic" />
                          <div className="skeleton skel-btn primary" />
                          <div className="skeleton skel-btn secondary" />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {!anyLoading &&
                list.map((session, i) => {
                  const vars = accentVarsFor(session.subject, session.section);

                  // live window: only true within [start, end)
                  const live =
                    activeTab === "upcoming" &&
                    Number.isFinite(session._startTs) &&
                    Number.isFinite(session._endTs) &&
                    nowTs >= session._startTs &&
                    nowTs < session._endTs;

                  const canJoin = live;

                  const program = getProgramFromCode(
                    session.subject,
                    normalizeCourseKey
                  );
                  const yrNum = getYearFromSectionDigit(session.section);
                  const chipLabel = `${
                    yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"
                  } — ${program}`;

                  const statusLower = (session.status || "").toLowerCase();
                  const isCancelled = statusLower === "cancelled";
                  const isRescheduled = statusLower === "rescheduled";

                  const recordingUrl = (session.recordingUrl || "").trim();
                  const hasRecording = !!recordingUrl;

                  return (
                    <div
                      key={`${activeTab}-${session.id}-${startIndex + i}`}
                      className={`schedule-card is-colored ${live ? "is-today" : ""} ${
                        activeTab === "upcoming" && !live ? "dimmed-not-live" : ""
                      }`}
                      style={vars}
                    >
                      <div
                        className="year-chip"
                        style={{ "--chip-bg": vars["--accent"] }}
                        aria-hidden="true"
                      >
                        {chipLabel}
                      </div>

                      <div className="schedule-info">
                        <p className="date">
                          {session.date}

                          {isCancelled && (
                            <StatusBadge
                              kind="cancelled"
                              reason={session.cancelReason}
                            />
                          )}

                          {session.isGroup && (
                            <>
                              {" "}
                              <span className="session-type-inline">
                                (Group)
                              </span>
                            </>
                          )}

                          {isRescheduled && (
                            <StatusBadge
                              kind="rescheduled"
                              reason={session.rescheduleReason}
                            />
                          )}
                        </p>

                        <p className="subject">
                          {session.subject} - {session.section}
                        </p>
                        <p className="mentor">Mentor: {session.mentor}</p>

                        <div className="bottom-row">
                          <div className="topic">
                            <span className="row-label">Topic:</span>{" "}
                            <span className="topic-value">{session.topic}</span>
                          </div>

                          <div className="actions">
                            {activeTab === "upcoming" ? (
                              <>
                                <button
                                  className="join-btn status-badge"
                                  data-disabled={!canJoin}
                                  title={canJoin ? "Join meeting" : undefined}
                                  tabIndex={0}
                                  aria-haspopup={!canJoin ? "true" : undefined}
                                  aria-label={
                                    !canJoin
                                      ? (() => {
                                          const hasTimes =
                                            Number.isFinite(session._startTs) && Number.isFinite(session._endTs);
                                          if (!hasTimes) return "Schedule time missing.";
                                          let msg = `Available only ${formatDateTimeRange(session.startISO, session.endISO)}`;
                                          if (nowTs < session._startTs) msg += ` • Starts in ${humanizeMs(session._startTs - nowTs)}`;
                                          else if (nowTs >= session._endTs) msg += " • Ended";
                                          return `When can I join? ${msg}`;
                                        })()
                                      : "JOIN NOW"
                                  }
                                  onClick={async () => {
                                    // HARD GUARDS — show validation toasts
                                    if (!Number.isFinite(session._startTs) || !Number.isFinite(session._endTs)) {
                                      showToast("Schedule time is missing. Please contact your mentor.", "error", 4200);
                                      return;
                                    }
                                    if (nowTs < session._startTs) {
                                      const eta = humanizeMs(session._startTs - nowTs);
                                      return;
                                    }
                                    if (nowTs >= session._endTs) {
                                      showToast("This session has already ended.", "error", 4200);
                                      return;
                                    }

                                    const url = (session.meetLink || "").trim();
                                    if (!url) {
                                      showToast("No meeting link set by mentor yet.", "error");
                                      return;
                                    }

                                    // Prefill from existing note (optional)
                                    const { topics, next } = await ensureSessionNote(session);

                                    // Pass the ACTUAL schedule window to the popup
                                    const qs = new URLSearchParams({
                                      id: session.sessionId || session.id,
                                      subject: session.subject,
                                      section: session.section,
                                      topic: session.topic || "",
                                      mentorName: session.mentor || "",
                                      startISO: session.startISO || "",
                                      endISO: session.endISO || "",
                                      studentNames: (session.students || []).join(", "),
                                      initialTopicsDiscussed: topics,
                                      initialNextSteps: next,
                                      hideBack: "1",
                                    }).toString();

                                    const notesWin = window.open(
                                      `/session-notes-popup?${qs}`,
                                      "MentEaseNotes",
                                      "width=560,height=640,left=100,top=100"
                                    );
                                    if (!notesWin) {
                                      showToast("Please allow pop-ups to open the Session Notes window.", "error");
                                      return;
                                    }

                                    // Go to meeting
                                    window.location.assign(ensureHttp(url));
                                  }}
                                >
                                  <span className="join-btn__label">JOIN NOW</span>

                                  {/* Same bubble as chips; rendered ONLY when not live */}
                                  {!canJoin && (
                                    <span className="status-tip" role="tooltip" aria-hidden="true">
                                      <strong className="status-tip__title">When can I join?</strong>
                                      <span className="status-tip__body">
                                        {(() => {
                                          const hasTimes =
                                            Number.isFinite(session._startTs) && Number.isFinite(session._endTs);
                                          if (!hasTimes) return "Schedule time missing.";
                                          let msg = `Available only ${formatDateTimeRange(session.startISO, session.endISO)}`;
                                          if (nowTs < session._startTs) msg += ` • Starts in ${humanizeMs(session._startTs - nowTs)}`;
                                          else if (nowTs >= session._endTs) msg += " • Ended";
                                          return msg;
                                        })()}
                                      </span>
                                    </span>
                                  )}
                                </button>

                                {/* (Not live chip removed) */}

                                <div
                                  className="ms-more-options"
                                  ref={(el) => (menuRefs.current[i] = el)}
                                >
                                  <button
                                    className="ms-more-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next =
                                        openMenuIndex === i ? null : i;
                                      setOpenMenuIndex(next);

                                      requestAnimationFrame(() => {
                                        if (next === null) {
                                          setDropUpIndex(null);
                                          return;
                                        }
                                        const wrap = menuRefs.current[i];
                                        const btn =
                                          wrap?.querySelector(".ms-more-btn");
                                        const menu =
                                          wrap?.querySelector(
                                            ".ms-menu-dropdown"
                                          );
                                        if (!btn || !menu) return;

                                        const btnRect =
                                          btn.getBoundingClientRect();
                                        const menuH = Math.min(
                                          menu.scrollHeight,
                                          260
                                        );
                                        const gap = 12;
                                        const spaceBelow =
                                          window.innerHeight -
                                          btnRect.bottom -
                                          gap;

                                        setDropUpIndex(
                                          menuH > spaceBelow ? i : null
                                        );
                                      });
                                    }}
                                  >
                                    More Options
                                  </button>
                                  <div
                                    className={`ms-menu-dropdown ${
                                      openMenuIndex === i ? "show" : ""
                                    } ${dropUpIndex === i ? "drop-up" : ""}`}
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const statusLower =
                                          (session.status || "")
                                            .toLowerCase()
                                            .trim();
                                        if (statusLower === "rescheduled") {
                                          showToast(
                                            "Rescheduling can only be done once.",
                                            "error"
                                          );
                                          setOpenMenuIndex(null);
                                          setDropUpIndex(null);
                                          return;
                                        }

                                        const msUntil =
                                          (typeof session._startTs === "number"
                                            ? session._startTs
                                            : NaN) - Date.now();
                                        if (
                                          !Number.isFinite(msUntil) ||
                                          msUntil < 24 * 60 * 60 * 1000
                                        ) {
                                          showToast(
                                            "Rescheduling is allowed up to 24 hours before the session.",
                                            "error"
                                          );
                                          setOpenMenuIndex(null);
                                          setDropUpIndex(null);
                                          return;
                                        }
                                        setSelectedSession(session);
                                        setShowResched(true);
                                        setOpenMenuIndex(null);
                                        setDropUpIndex(null);
                                      }}
                                    >
                                      Reschedule
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const msUntil =
                                          (typeof session._startTs === "number"
                                            ? session._startTs
                                            : NaN) - Date.now();
                                        if (
                                          !Number.isFinite(msUntil) ||
                                          msUntil < 24 * 60 * 60 * 1000
                                        ) {
                                          showToast(
                                            "Cancellations must be made at least 24 hours prior to the scheduled session.",
                                            "error"
                                          );
                                          setOpenMenuIndex(null);
                                          setDropUpIndex(null);
                                          return;
                                        }
                                        setSelectedSession(session);
                                        setShowCancel(true);
                                        setOpenMenuIndex(null);
                                        setDropUpIndex(null);
                                      }}
                                    >
                                      Cancel booking
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              hasRecording && (
                                <button
                                  className="view-recording-btn"
                                  onClick={() => {
                                    const href = ensureHttp(recordingUrl);
                                    if (/^https?:\/\//i.test(href)) {
                                      window.open(
                                        href,
                                        "_blank",
                                        "noopener,noreferrer"
                                      );
                                    } else {
                                      navigate(href);
                                    }
                                  }}
                                  title="Open recording"
                                >
                                  VIEW RECORDING
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {!anyLoading && list.length === 0 && (
                <p className="empty-msg">No {activeTab} sessions.</p>
              )}
            </div>

            {!anyLoading && fullList.length > 0 && (
              <div className="schedule-meta">
                <span className="schedule-meta__range">
                  Showing {fullList.length ? startIndex + 1 : 0}-{endIndex} of {fullList.length} {activeTab} sessions
                </span>
                {totalPages > 1 && (
                  <span className="schedule-meta__page">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>
            )}

            {!anyLoading && totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                  paddingBottom: "2rem",
                }}
              >
                <button
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background: currentPage === 1 ? "#f9fafb" : "white",
                    color: currentPage === 1 ? "#9ca3af" : "#374151",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    transition: "all 0.2s ease",
                  }}
                  aria-label="Previous page"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Previous
                </button>

                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {getPaginationItems(currentPage, totalPages).map((item, idx) =>
                    item === "..." ? (
                      <span
                        key={`dots-${idx}`}
                        style={{ padding: "0.5rem", color: "#9ca3af" }}
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`p-${item}`}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? "page" : undefined}
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: item === currentPage ? "#3b82f6" : "white",
                          color: item === currentPage ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          minWidth: "40px",
                          transition: "all 0.2s ease",
                        }}
                        title={`Go to page ${item}`}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background:
                      currentPage === totalPages ? "#f9fafb" : "white",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor:
                      currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    transition: "all 0.2s ease",
                  }}
                  aria-label="Next page"
                >
                  Next
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      <RescheduleSessionModal
        key={
          showResched
            ? (selectedSession?.id ||
               selectedSession?._id ||
               selectedSession?.startISO ||
               selectedSession?.date)
            : "resched-closed"
        }
        isOpen={showResched}
        onClose={() => {
          setShowResched(false);
          setSelectedSession(null);
        }}
        session={selectedSession}
        onReschedule={handleReschedule}
        onSuccess={() => fetchSessions()}
        showToast={showToast}
        viewerRole="student"
        source="MySchedule"
      />

      <CancelBookingModal
        key={
          showCancel
            ? (selectedSession?.id ||
               selectedSession?._id ||
               selectedSession?.startISO ||
               selectedSession?.date)
            : "cancel-closed"
        }
        isOpen={showCancel}
        onClose={() => {
          setShowCancel(false);
          setSelectedSession(null);
        }}
        session={selectedSession}
        onConfirm={handleCancel}
      />

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
    </div>
  );
}