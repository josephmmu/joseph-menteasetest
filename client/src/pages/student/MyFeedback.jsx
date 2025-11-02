import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import GiveFeedbackModal from "../../components/GiveFeedbackModal";
import ViewFeedbackModal from "../../components/ViewFeedbackModal";
import "./MyFeedback.css";
import { useCourseColor } from "../../context/CourseColorContext";
import {
  getProgramFromCode,
  getYearFromSectionDigit,
  ordinal,
} from "../../utils/programYear";

/* =========================
   API helpers
   ========================= */
const API = (
  import.meta?.env?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

/**
 * Optional endpoint for loading Submitted/Received from backend.
 * Example: VITE_FEEDBACK_MINE_URL=/api/feedback/mine?as=student
 */
const FEEDBACK_MINE_URL =
  import.meta?.env?.VITE_FEEDBACK_MINE_URL ||
  process.env.REACT_APP_FEEDBACK_MINE_URL ||
  process.env.VITE_FEEDBACK_MINE_URL ||
  "";

const tokenHeaders = () => {
  const t = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
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

/* =========================
   Local persistence (until/alongside backend)
   ========================= */
const SUBMITTED_FLAG_KEY = "feedbackSubmittedBySession"; // { [sessionId]: true }
const SUBMITTED_ENTRIES_KEY = "feedbackSubmittedEntriesV1"; // array of submitted entries

const loadSubmittedMap = () => {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(SUBMITTED_FLAG_KEY) || "{}");
  } catch {
    return {};
  }
};
const saveSubmittedMap = (obj) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SUBMITTED_FLAG_KEY, JSON.stringify(obj || {}));
  } catch {}
};

const loadSubmittedEntries = () => {
  try {
    if (typeof localStorage === "undefined") return [];
    const a = JSON.parse(localStorage.getItem(SUBMITTED_ENTRIES_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const saveSubmittedEntries = (arr) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SUBMITTED_ENTRIES_KEY, JSON.stringify(arr || []));
  } catch {}
};

/* —— persist drafts locally so “Continue” survives refresh —— */
const DRAFTS_LS_KEY = "feedbackDraftsBySessionV1";
const loadDraftsLS = () => {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(DRAFTS_LS_KEY) || "{}");
  } catch {
    return {};
  }
};
const saveDraftsLS = (obj) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DRAFTS_LS_KEY, JSON.stringify(obj || {}));
  } catch {}
};

/* =========================
   SessionNotes-style Skeletons
   ========================= */
function FeedbackSkeletonCard() {
  return (
    <div className="schedule-card skeleton-card" aria-hidden="true">
      <div className="year-chip-skel skeleton" />
      <div className="schedule-info">
        <div className="skeleton skel-line skel-date" />
        <div className="skeleton skel-line skel-subject" />
        <div className="skeleton skel-line skel-mentor" />
        <div className="bottom-row">
          <div className="skeleton skel-topic" />
          <div className="skeleton skel-btn primary" />
        </div>
      </div>
    </div>
  );
}

function FeedbackSkeletonList({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <FeedbackSkeletonCard key={`skel-fb-${i}`} />
      ))}
    </>
  );
}

/* =========================
   Pagination helpers (MySchedule-style)
   ========================= */
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

/* =========================
   Component
   ========================= */
export default function Feedback() {
  const [activeTab, setActiveTab] = useState("awaiting"); // land user on Awaiting
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSubmitted, setSelectedSubmitted] = useState(null);

  // —— LS-backed drafts so “Continue” & anon survive refresh
  const [drafts, setDrafts] = useState(() => loadDraftsLS()); // { [sessionId]: {notes, anonymous, submittedAt?} }
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const { getCourseColor, normalizeCourseKey } = useCourseColor();
  const isMobile = windowWidth <= 1152;

  // courses + sessions
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // feedback data buckets
  const [awaiting, setAwaiting] = useState([]);
  // Server-only view for Submitted (no local cache merge)
  const [submitted, setSubmitted] = useState([]);
  const [received, setReceived] = useState([]); // from backend if available

  // submitted map for dedupe of Awaiting (flip only when finalized)
  const submittedMapRef = useRef(loadSubmittedMap());

  // ===== Pagination state per tab =====
  const [pageAwaiting, setPageAwaiting] = useState(1);
  const [pageSubmitted, setPageSubmitted] = useState(1);
  const [pageReceived, setPageReceived] = useState(1);
  const perPage = 6;

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastMsg("");
      toastTimer.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* =========================
     Fetch: courses + sessions + mine(received & submitted)
     ========================= */
  const fetchCourses = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/courses/mine`, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
    } catch {
      return [];
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/sessions/mine?as=student`, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }, []);

  const fetchMine = useCallback(async () => {
    const url = FEEDBACK_MINE_URL
      ? (FEEDBACK_MINE_URL.startsWith("http") ? FEEDBACK_MINE_URL : `${API}${FEEDBACK_MINE_URL}`)
      : `${API}/api/feedback/mine`;
    try {
      const r = await fetch(url, { headers: tokenHeaders(), credentials: "include" });
      if (!r.ok) return { submitted: [], received: [] };
      const j = await r.json();
      const submittedArr =
        Array.isArray(j?.submitted) ? j.submitted :
        Array.isArray(j?.data?.submitted) ? j.data.submitted :
        [];
      const receivedArr =
        Array.isArray(j?.received) ? j.received :
        Array.isArray(j?.data?.received) ? j.data.received :
        (Array.isArray(j) ? j : []);
      return { submitted: submittedArr, received: receivedArr };
    } catch {
      return { submitted: [], received: [] };
    }
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    const [c, s, mine] = await Promise.all([fetchCourses(), fetchSessions(), fetchMine()]);
    setCourses(c || []);
    setSessions(s || []);

    // Normalize mentor->student (Received) if backend provided
    const normalizedReceived = (mine.received || []).map((f, idx) => ({
      id: toIdString(f._id) || toIdString(f.id) || `recv-${idx}`,
      sessionId: toIdString(f.session) || toIdString(f.sessionId) || "",
      date:
        f.sessionStart || f.date
          ? formatDateTimeRange(f.sessionStart || f.date, f.sessionEnd)
          : (f.createdAt
              ? new Date(f.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric"
                }) + " - " +
                new Date(f.createdAt).toLocaleTimeString("en-US", {
                  hour: "numeric", minute: "2-digit", hour12: true
                })
              : ""),
      subject:
        (f.subjectCode && f.subjectName
          ? `${f.subjectCode} ${f.subjectName}`
          : f.subject) || "Course",
      section: f.section || f.sectionName || f.sectionCode || "",
      mentor:
        (typeof f.mentorName === "string" && f.mentorName) ||
        (f.from && (f.from.fullName || f.from.name)) ||
        "Mentor",
      topic: f.topic || "—",
      comment: f.notes || f.comment || "",
      anonymous: !!f.anonymous,
      finalized: true, // received implies visible/finalized
    }));
    // Add submittedAt for modal + fill subject/section fallback
    const normalizedReceivedFilled = normalizedReceived.map((e) => {
      const filled = {
        ...e,
        submittedAt:
          mine?.received?.find((r) => (toIdString(r._id) || toIdString(r.id)) === e.id)?.visibleToRecipientAt
            ? new Date(
                mine.received.find((r) => (toIdString(r._id) || toIdString(r.id)) === e.id)
                  .visibleToRecipientAt
              ).toLocaleDateString() +
              " at " +
              new Date(
                mine.received.find((r) => (toIdString(r._id) || toIdString(r.id)) === e.id)
                  .visibleToRecipientAt
              ).toLocaleTimeString()
            : e.submittedAt || "",
      };
      if (filled.subject !== "Course" && filled.section) return filled;
      const sessObj = (s || []).find(
        (sx) => (toIdString(sx._id) || toIdString(sx.id) || toIdString(sx.sessionId)) === e.sessionId
      );
      if (!sessObj) return filled;
      const courseIdKey =
        toIdString(sessObj.offeringID) ||
        toIdString(sessObj.offeringId) ||
        toIdString(sessObj.courseId) ||
        toIdString(sessObj.courseID) ||
        "";
      const crs = (c || []).find((cr) => (toIdString(cr._id) || toIdString(cr.id)) === courseIdKey);
      if (!crs) return filled;
      return {
        ...filled,
        subject: `${crs.courseCode || ""} ${crs.courseName || ""}`.trim() || filled.subject,
        section: crs.section || crs.sectionName || crs.sectionCode || filled.section,
      };
    });
    setReceived(normalizedReceivedFilled);

    // Normalize student->mentor Submitted (prefer server finals; fill subject/section if missing)
    const normalizedSubmitted = (mine.submitted || []).map((f, idx) => {
      const finalized = !!f.finalized || !!f.visibleToRecipientAt;
      const sessionId = toIdString(f.session) || toIdString(f.sessionId) || "";
      const obj = {
        id: toIdString(f._id) || toIdString(f.id) || `sub-${idx}`,
        sessionId,
        date:
          f.sessionStart || f.date
            ? formatDateTimeRange(f.sessionStart || f.date, f.sessionEnd)
            : (f.createdAt
                ? new Date(f.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric"
                  }) + " - " +
                  new Date(f.createdAt).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit", hour12: true
                  })
                : ""),
        subject:
          (f.subjectCode && f.subjectName
            ? `${f.subjectCode} ${f.subjectName}`
            : f.subject) || "Course",
        section: f.section || f.sectionName || f.sectionCode || "",
        mentor:
          (typeof f.mentorName === "string" && f.mentorName) ||
          (f.to && (f.to.fullName || f.to.name)) ||
          "Mentor",
        topic: f.topic || "-",
        comment: f.notes || f.comment || "",
        anonymous: !!f.anonymous,
        finalized,
        submittedAt:
          f.visibleToRecipientAt
            ? new Date(f.visibleToRecipientAt).toLocaleDateString() +
              " at " +
              new Date(f.visibleToRecipientAt).toLocaleTimeString()
            : (f.createdAt
                ? new Date(f.createdAt).toLocaleDateString() +
                  " at " +
                  new Date(f.createdAt).toLocaleTimeString()
                : ""),
      };

      // Fallback course/section from sessions + courses when API omitted
      if (obj.subject === "Course" || !obj.section) {
        const sessObj = (s || []).find(
          (sx) => (toIdString(sx._id) || toIdString(sx.id) || toIdString(sx.sessionId)) === sessionId
        );
        if (sessObj) {
          const courseIdKey =
            toIdString(sessObj.offeringID) ||
            toIdString(sessObj.offeringId) ||
            toIdString(sessObj.courseId) ||
            toIdString(sessObj.courseID) ||
            "";
          const crs = (c || []).find((cr) => (toIdString(cr._id) || toIdString(cr.id)) === courseIdKey);
          if (crs) {
            obj.subject = `${crs.courseCode || ""} ${crs.courseName || ""}`.trim() || obj.subject;
            obj.section = crs.section || crs.sectionName || crs.sectionCode || obj.section;
          }
        }
      }

      return obj;
    });

    // Seed server drafts into local drafts (so "Continue" button shows) — preserve anonymous flag
    if (normalizedSubmitted.length) {
      setDrafts((prev) => {
        const next = { ...prev };
        normalizedSubmitted.forEach((e) => {
          if (!e.finalized && e.sessionId) {
            next[e.sessionId] = {
              notes: e.comment || "",
              anonymous: !!e.anonymous,
              submittedAt:
                new Date().toLocaleDateString() +
                " at " +
                new Date().toLocaleTimeString(),
            };
          }
        });
        saveDraftsLS(next);
        return next;
      });
    }

    // Server-only Submitted: take only finalized items from server
    setSubmitted(
      (normalizedSubmitted || []).filter((e) => e.finalized)
    );

    setLoading(false);
  }, [fetchCourses, fetchSessions, fetchMine]);

  useEffect(() => {
    refreshData();
    const t = setInterval(refreshData, 60_000); // keep fresh
    return () => clearInterval(t);
  }, [refreshData]);

  // Refresh when the tab becomes visible (like mentor side)
  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshData();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [refreshData]);

  // Make switching to the Received tab fetch fresh data immediately
  useEffect(() => {
    if (activeTab === "received") {
      refreshData();
    }
  }, [activeTab, refreshData]);

  /* =========================
     Normalize: map sessions -> Awaiting (ended & not cancelled)
     ========================= */
  const coursesById = useMemo(() => {
    const m = new Map();
    (courses || []).forEach((c) => {
      const id = toIdString(c._id || c.id);
      if (id) m.set(id, c);
    });
    return m;
  }, [courses]);

  useEffect(() => {
    const now = Date.now();
    const alreadyAwaitingIds = new Set(awaiting.map((a) => a.id));
    const newly = [];

    for (const s of sessions || []) {
      const status = String(s.status || "").toLowerCase();
      if (status === "cancelled") continue;

      const startISO = s.scheduleStart || s.startISO;
      const endISO = s.scheduleEnd || s.endISO;
      const end = endISO ? new Date(endISO) : null;
      const endTs = end && !Number.isNaN(end.getTime()) ? end.getTime() : NaN;

      // only after session ended
      if (!Number.isFinite(endTs) || endTs > now) continue;

      // canonical session id
      const sid =
        toIdString(s._id) ||
        toIdString(s.sessionId) ||
        toIdString(s.apiId) ||
        toIdString(s.id);
      if (!sid) continue;

      // skip if already finalized-submitted (persisted flag) or already in awaiting
      if (submittedMapRef.current[sid] || alreadyAwaitingIds.has(sid)) continue;

      // get course info
      const course = coursesById.get(
        toIdString(s.offeringID) ||
        toIdString(s.offeringId) ||
        toIdString(s.courseId) ||
        toIdString(s.courseID)
      );
      const subject = course
        ? `${course.courseCode || ""} ${course.courseName || ""}`.trim() || "Course"
        : "Course";
      const section =
        (course && (course.section || course.sectionName || course.sectionCode)) || "";

      // Prefer mentorName returned by sessions API (from mentorId FK)
      const mentor =
        (typeof s.mentorName === "string" && s.mentorName.trim()) ||
        (course &&
          (course.mentor?.name ||
            course.mentor?.fullName ||
            [course.mentor?.firstName, course.mentor?.lastName]
              .filter(Boolean)
              .join(" ").trim())) ||
        "Mentor";

      const topic = s.topic || "—";
      const date = formatDateTimeRange(startISO, endISO);

      newly.push({
        id: sid,            // NOTE: card key id == sessionId for Awaiting
        sessionId: sid,
        date,
        subject,
        section,
        mentor,
        topic,
      });
    }

    if (newly.length) {
      setAwaiting((prev) => [...prev, ...newly]);
    }
  }, [sessions, coursesById, awaiting]); // keep dedupe set fresh

  /* =========================
     Pagination wiring
     ========================= */
  const dataByTab = useMemo(
    () => ({
      awaiting,
      submitted,
      received,
    }),
    [awaiting, submitted, received]
  );

  // reset page when switching tab
  useEffect(() => {
    if (activeTab === "awaiting") setPageAwaiting(1);
    if (activeTab === "submitted") setPageSubmitted(1);
    if (activeTab === "received") setPageReceived(1);
  }, [activeTab]);

  // reset page if the list for a tab changes length (e.g., after submit)
  useEffect(() => setPageAwaiting(1), [awaiting.length]);
  useEffect(() => setPageSubmitted(1), [submitted.length]);
  useEffect(() => setPageReceived(1), [received.length]);

  const fullList = dataByTab[activeTab] || [];
  const currentPage =
    activeTab === "awaiting"
      ? pageAwaiting
      : activeTab === "submitted"
      ? pageSubmitted
      : pageReceived;

  const totalPages = Math.ceil(fullList.length / perPage) || 1;
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, fullList.length);
  const pagedList = fullList.slice(startIndex, endIndex);

  const setPage = (p) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (activeTab === "awaiting") setPageAwaiting(clamped);
    else if (activeTab === "submitted") setPageSubmitted(clamped);
    else setPageReceived(clamped);
  };

  const labelForTab = (t) =>
    t === "awaiting" ? "awaiting" : t === "submitted" ? "submitted" : "received";

  // Helper to open modal for editing (works for Awaiting or Submitted Draft)
  const openEditModalForEntry = (entry) => {
    setSelectedEntry(entry);
    setShowFeedbackModal(true);
  };

  // Small helper: anonymous pill
  const AnonPill = ({ show }) =>
    !show ? null : (
      <span
        className="anon-pill"
        style={{
          fontSize: "0.75rem",
          padding: "0.15rem 0.5rem",
          borderRadius: "9999px",
          border: "1px solid var(--accent,#3b82f6)",
          color: "var(--accent,#3b82f6)",
          whiteSpace: "nowrap",
        }}
        title="Your name will be hidden from the mentor"
      >
        Anonymous
      </span>
    );

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="My Feedback" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>My Feedback</h2>

            <div className="tabs">
              <button
                className={`tab-button ${activeTab === "awaiting" ? "active" : ""}`}
                onClick={() => setActiveTab("awaiting")}
              >
                Awaiting
              </button>
              <button
                className={`tab-button ${activeTab === "submitted" ? "active" : ""}`}
                onClick={() => setActiveTab("submitted")}
              >
                Submitted
              </button>
              <button
                className={`tab-button ${activeTab === "received" ? "active" : ""}`}
                onClick={() => setActiveTab("received")}
              >
                Received
              </button>
            </div>

            <div
              className={`schedule-list ${!loading && pagedList.length === 0 ? "empty" : ""}`}
              aria-busy={loading}
              key={activeTab}
            >
              {loading ? (
                <FeedbackSkeletonList count={3} />
              ) : (
                <>
                  {pagedList.map((entry, i) => {
                    const accent = getCourseColor(entry.subject || entry.section);

                    const program = getProgramFromCode(
                      entry.subject,
                      normalizeCourseKey
                    );
                    const yrNum = getYearFromSectionDigit(entry.section);
                    const chipLabel = `${
                      yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"
                    } — ${program}`;

                    const isAwaiting = activeTab === "awaiting";
                    const isSubmittedTab = activeTab === "submitted";
                    const isDraft = !!entry.finalized === false && isSubmittedTab;

                    // determine if this row is currently anonymous (for pill)
                    const draftAnon =
                      drafts[entry.sessionId || entry.id]?.anonymous === true;
                    const rowAnon =
                      (isAwaiting && draftAnon) ||
                      (isSubmittedTab && !!entry.anonymous);

                    return (
                      <div
                        className="feedback-card is-colored"
                        key={entry.id || `${startIndex + i}`}
                        style={{ "--accent": accent }}
                      >
                        <div className="year-chip" aria-hidden="true">
                          {chipLabel}
                        </div>

                        <div className="schedule-info">
                          <p className="date">{entry.date}</p>
                          <p className="subject">
                            {entry.subject} - {entry.section}
                          </p>
                          <p className="mentor">
                            {isAwaiting ? entry.mentor : entry.mentor || "Mentor"}
                          </p>

                          <div className="bottom-row" style={{ gap: ".5rem", alignItems: "center" }}>
                            <div className="topic">Topic: {entry.topic}</div>
                            <AnonPill show={rowAnon} />

                            {activeTab === "awaiting" ? (
                              <button
                                className="join-btn"
                                onClick={() => openEditModalForEntry(entry)}
                              >
                                {drafts[entry.sessionId || entry.id] ? "Continue" : "Give Feedback"}
                              </button>
                            ) : activeTab === "submitted" ? (
                              entry.comment ? (
                                <button
                                  className="fb-view-btn"
                                  onClick={() => {
                                    const normalized =
                                      entry.mentorComment != null
                                        ? {
                                            ...entry,
                                            comment: entry.mentorComment ?? "",
                                            anonymous: !!entry.anonymous,
                                          }
                                        : entry;
                                    setSelectedSubmitted({
                                      ...normalized,
                                      givenBy: entry.anonymous ? "You (Anonymous)" : "You",
                                      givenTo: entry.mentor || "Mentor",
                                    });
                                    setShowViewModal(true);
                                  }}
                                >
                                  View Feedback
                                </button>
                              ) : null
                            ) : (
                              // Received
                              <button
                                className="fb-view-btn"
                                onClick={() => {
                                  const normalized =
                                    entry.mentorComment != null
                                      ? {
                                          ...entry,
                                          comment: entry.mentorComment ?? "",
                                          anonymous: !!entry.anonymous,
                                        }
                                      : entry;
                                  setSelectedSubmitted({
                                    ...normalized,
                                    givenBy: entry.anonymous ? "Anonymous" : (entry.mentor || "Mentor"),
                                    givenTo: "You",
                                  });
                                  setShowViewModal(true);
                                }}
                              >
                                View Feedback
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {!loading && fullList.length === 0 && (
                    <p className="empty-msg">No {labelForTab(activeTab)} feedback entries.</p>
                  )}
                </>
              )}
            </div>

            {/* Range + page meta */}
            {!loading && fullList.length > 0 && (
              <div className="schedule-meta">
                <span className="schedule-meta__range">
                  Showing {fullList.length ? startIndex + 1 : 0}-{endIndex} of {fullList.length} {labelForTab(activeTab)} entries
                </span>
                {totalPages > 1 && (
                  <span className="schedule-meta__page">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>
            )}

            {/* Pagination controls */}
            {!loading && totalPages > 1 && (
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
                    background: currentPage === totalPages ? "#f9fafb" : "white",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
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

        {/* ===== Give Feedback (student -> mentor) ===== */}
        <GiveFeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          /* === BRING BACK ANONYMOUS TOGGLE ===
             These props re-enable the toggle in the modal (modal should read either one):
             - showAnonymousToggle (preferred)
             - allowAnonymous (fallback for older modal versions)
             - defaultAnonymous initializes the switch from saved draft/server
          */
          showAnonymousToggle={true}
          allowAnonymous={true}
          defaultAnonymous={
            selectedEntry ? !!drafts[selectedEntry.sessionId || selectedEntry.id]?.anonymous : false
          }
          onSubmit={async (feedbackData) => {
            if (selectedEntry?.id) {
              const sid = selectedEntry.sessionId || selectedEntry.id;
              const entry = {
                notes: feedbackData.notes,
                anonymous: !!feedbackData.anonymous,
                submittedAt:
                  feedbackData.submittedAt ||
                  new Date().toLocaleDateString() +
                    " at " +
                    new Date().toLocaleTimeString(),
              };
              // local draft
              setDrafts((prev) => {
                const next = { ...prev, [sid]: entry };
                saveDraftsLS(next);
                return next;
              });

              // OPTIONAL: persist draft to DB so it survives logout/device change
              try {
                await fetch(`${API}/api/feedback/student/draft`, {
                  method: "POST",
                  headers: tokenHeaders(),
                  credentials: "include",
                  body: JSON.stringify({
                    sessionId: selectedEntry?.sessionId || selectedEntry?.id,
                    notes: feedbackData.notes,
                    anonymous: !!feedbackData.anonymous,
                  }),
                });
              } catch (e) {
                console.warn("Draft save failed (kept locally):", e);
              }
            }
          }}
          onSessionComplete={async (submittedFeedbackData) => {
            // 1) Try to persist FINAL to backend
            try {
              const resp = await fetch(`${API}/api/feedback/student`, {
                method: "POST",
                headers: tokenHeaders(),
                credentials: "include",
                body: JSON.stringify({
                  sessionId: selectedEntry?.sessionId || selectedEntry?.id,
                  notes: submittedFeedbackData.notes,
                  anonymous: !!submittedFeedbackData.anonymous,
                }),
              });
              if (!resp.ok) {
                console.warn("Feedback POST failed with status", resp.status);
              }
            } catch (e) {
              console.warn("Feedback POST failed; using local fallback", e);
            }

            // 2) Local flow (mark as submitted/finalized)
            const sid = selectedEntry?.sessionId || selectedEntry?.id;
            if (sid) {
              submittedMapRef.current = { ...submittedMapRef.current, [sid]: true };
              saveSubmittedMap(submittedMapRef.current);
            }

            // Remove from Awaiting (safe if not present)
            setAwaiting((prev) => prev.filter((s) => s.id !== sid && s.sessionId !== sid));

            // Update/append in Submitted
            const submittedEntry = {
              ...selectedEntry,
              id: selectedEntry.id, // feedback id when from server; may be sessionId when from awaiting
              sessionId: sid,
              comment: submittedFeedbackData.notes,
              anonymous: !!submittedFeedbackData.anonymous,
              submittedAt:
                submittedFeedbackData.submittedAt ||
                new Date().toLocaleDateString() + " at " + new Date().toLocaleTimeString(),
              finalized: true,
            };

            // Server-only: re-fetch instead of appending locally
            refreshData();

            // Clear local draft for that session
            setDrafts((prev) => {
              const updated = { ...prev };
              delete updated[sid];
              saveDraftsLS(updated);
              return updated;
            });

            setShowFeedbackModal(false);
            showToast("✓ Feedback submitted and moved to Submitted tab!");
          }}
          mentorName={selectedEntry?.mentor}
          subject={selectedEntry?.subject}
          section={selectedEntry?.section}
          dateTime={selectedEntry?.date}
          topic={selectedEntry?.topic}
          accentColor={getCourseColor(
            selectedEntry?.subject || selectedEntry?.section
          )}
          sessionId={selectedEntry?.sessionId || selectedEntry?.id}
          initialFeedback={
            selectedEntry ? drafts[selectedEntry.sessionId || selectedEntry.id] : null
          }
          onFeedbackUpdate={(id, entry) =>
            setDrafts((prev) => {
              const next = { ...prev, [id]: entry };
              saveDraftsLS(next);
              return next;
            })
          }
        />

        {/* ===== Read-only View Feedback ===== */}
        <ViewFeedbackModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          feedback={selectedSubmitted}
          viewerRole="student"
        />

        {toastMsg && (
          <div className="toast-success" role="status" aria-live="polite">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}

