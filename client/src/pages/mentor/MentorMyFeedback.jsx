import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import ViewFeedbackModal from "../../components/ViewFeedbackModal";
import GroupGiveFeedbackModal from "../../components/GroupGiveFeedbackModal";
import MentorGiveFeedbackModal from "../../components/MentorGiveFeedbackModal";
import "../student/MyFeedback.css";
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
 * Mentor "mine" endpoint. Should return { submitted: [], received: [] } for the current user.
 * Examples:
 *   VITE_FEEDBACK_MENTOR_MINE_URL=/api/feedback/mine?as=mentor
 *   REACT_APP_FEEDBACK_MENTOR_MINE_URL=/api/feedback/mine?as=mentor
 */
const FEEDBACK_MENTOR_MINE_URL =
  import.meta?.env?.VITE_FEEDBACK_MENTOR_MINE_URL ||
  process.env.REACT_APP_FEEDBACK_MENTOR_MINE_URL ||
  process.env.VITE_FEEDBACK_MENTOR_MINE_URL ||
  "/api/feedback/mine?as=mentor";

const tokenHeaders = () => {
  const t =
    typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
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
    if (val.userId) return String(val.userId).trim();
  }
  return String(val).trim();
};

const isNonEmptyId = (s) => typeof s === "string" && s.trim().length > 0;

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
   Local persistence (mentor-side)
   ========================= */
const M_SUBMITTED_FLAG_KEY = "mentorFeedbackSubmittedBySession"; // { [sessionId]: true }
const M_SUBMITTED_ENTRIES_KEY = "mentorFeedbackSubmittedEntriesV1"; // array of submitted entries

const loadSubmittedMap = () => {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(M_SUBMITTED_FLAG_KEY) || "{}");
  } catch {
    return {};
  }
};
const saveSubmittedMap = (obj) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(M_SUBMITTED_FLAG_KEY, JSON.stringify(obj || {}));
  } catch {}
};

const loadSubmittedEntries = () => {
  try {
    if (typeof localStorage === "undefined") return [];
    const a = JSON.parse(localStorage.getItem(M_SUBMITTED_ENTRIES_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const saveSubmittedEntries = (arr) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(M_SUBMITTED_ENTRIES_KEY, JSON.stringify(arr || []));
  } catch {}
};

/* =========================
   Student normalization helpers
   ========================= */
const nameFromObj = (st) =>
  (typeof st === "string" && st) ||
  st?.name ||
  st?.fullName ||
  [st?.firstName, st?.lastName].filter(Boolean).join(" ").trim() ||
  st?.user?.name ||
  st?.user?.fullName ||
  [st?.user?.firstName, st?.user?.lastName].filter(Boolean).join(" ").trim() ||
  st?.email ||
  "Student";

const emailFromObj = (st) =>
  st?.email || st?.user?.email || st?.contactEmail || st?.schoolEmail || "";

const idFromObj = (st) =>
  toIdString(
    st?._id ??
      st?.id ??
      st?.userId ??
      st?.user?._id ??
      st?.user?.id ??
      st?.accountId ??
      st?.studentId ??
      st?.studentID
  );

const normalizeStudents = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((st) => {
    const id = idFromObj(st);
    const name = nameFromObj(st);
    const email = emailFromObj(st);
    return {
      id: isNonEmptyId(id) ? id : null,
      name,
      email: typeof email === "string" ? email : "",
      needsFeedback: isNonEmptyId(id),
      _raw: st,
    };
  });
};

/* -------- Batch/Single user lookup to resolve IDs from email/name -------- */
async function lookupUsersByEmails(emails) {
  const unique = Array.from(new Set((emails || []).filter(Boolean)));
  if (unique.length === 0) return new Map();

  const headers = tokenHeaders();
  const results = new Map();

  // Try bulk POST endpoints first
  const bulkCandidates = [
    { url: `${API}/api/users/lookup`, body: { emails: unique } },
    { url: `${API}/api/users/bulk`, body: { emails: unique } },
  ];
  for (const cand of bulkCandidates) {
    try {
      const r = await fetch(cand.url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(cand.body),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const list = Array.isArray(j)
        ? j
        : Array.isArray(j?.users)
        ? j.users
        : Array.isArray(j?.data)
        ? j.data
        : Array.isArray(j?.data?.users)
        ? j.data.users
        : [];
      for (const u of list) {
        const email = (u?.email || "").toLowerCase();
        const id = toIdString(u?._id || u?.id || u?.userId);
        if (email && id) results.set(email, id);
      }
      if (results.size) return results;
    } catch {}
  }

  // Try single GET endpoints
  for (const email of unique) {
    const emailEnc = encodeURIComponent(email);
    const tries = [
      `${API}/api/users/lookup?email=${emailEnc}`,
      `${API}/api/users/by-email?email=${emailEnc}`,
      `${API}/api/users?email=${emailEnc}`, // may return array
    ];
    for (const url of tries) {
      try {
        const r = await fetch(url, { headers, credentials: "include" });
        if (!r.ok) continue;
        const j = await r.json();
        const cand = Array.isArray(j)
          ? j[0]
          : Array.isArray(j?.users)
          ? j.users[0]
          : Array.isArray(j?.data)
          ? j.data[0]
          : j;
        const id = toIdString(cand?._id || cand?.id || cand?.userId);
        if (id) {
          results.set(email.toLowerCase(), id);
          break;
        }
      } catch {}
    }
  }

  return results;
}

async function lookupUsersByNames(names) {
  const headers = tokenHeaders();
  const results = new Map();
  const unique = Array.from(new Set((names || []).filter(Boolean)));
  for (const name of unique) {
    const q = encodeURIComponent(name);
    const tries = [
      `${API}/api/users/search?q=${q}`,
      `${API}/api/users?name=${q}`,
    ];
    for (const url of tries) {
      try {
        const r = await fetch(url, { headers, credentials: "include" });
        if (!r.ok) continue;
        const j = await r.json();
        const list = Array.isArray(j)
          ? j
          : Array.isArray(j?.users)
          ? j.users
          : Array.isArray(j?.data)
          ? j.data
          : Array.isArray(j?.results)
          ? j.results
          : [];
        // Pick exact (case-insensitive) first
        const exact =
          list.find(
            (u) =>
              typeof (u?.fullName || u?.name) === "string" &&
              (u.fullName || u.name).toLowerCase() === name.toLowerCase()
          ) || list[0];
        const id = toIdString(exact?._id || exact?.id || exact?.userId);
        if (id) {
          results.set(name, id);
          break;
        }
      } catch {}
    }
  }
  return results;
}

async function resolveStudentsToIds(students) {
  if (!Array.isArray(students) || !students.length) return students || [];

  const unresolved = students.filter((s) => !isNonEmptyId(s.id));
  if (unresolved.length === 0) return students;

  const emails = unresolved
    .map((s) => (s.email || "").toLowerCase())
    .filter(Boolean);
  const names = unresolved.map((s) => s.name).filter(Boolean);

  const emailMap = await lookupUsersByEmails(emails);
  // Fill by email first
  let filled = students.map((s) => {
    if (isNonEmptyId(s.id)) return s;
    const id = s.email ? emailMap.get((s.email || "").toLowerCase()) : null;
    return id ? { ...s, id, needsFeedback: true } : s;
  });

  // Any still missing? Try name search
  const stillMissing = filled.filter((s) => !isNonEmptyId(s.id));
  if (stillMissing.length) {
    const nameMap = await lookupUsersByNames(stillMissing.map((s) => s.name));
    filled = filled.map((s) => {
      if (isNonEmptyId(s.id)) return s;
      const id = nameMap.get(s.name);
      return id ? { ...s, id, needsFeedback: true } : s;
    });
  }

  return filled;
}

/* -------- Flexible roster fetcher using sessionId and offeringId -------- */
async function fetchSessionRosterFlexible(entry) {
  const headers = tokenHeaders();
  const sessionId = entry?.sessionId || entry?.id;
  const offeringId = entry?.offeringId || entry?.offeringID || "";

  // 1) Try session-based endpoints
  const sessionEndpoints = sessionId
    ? [
        `${API}/api/sessions/${sessionId}/roster`,
        `${API}/api/sessions/${sessionId}`,
        `${API}/api/sessions/roster?sessionId=${encodeURIComponent(sessionId)}`,
        `${API}/api/sessions/${sessionId}/attendees`,
      ]
    : [];

  for (const url of sessionEndpoints) {
    try {
      const r = await fetch(url, { headers, credentials: "include" });
      if (!r.ok) continue;
      const j = await r.json();

      if (Array.isArray(j)) {
        const studs = j.filter((x) => {
          const role = String(x?.role || x?.userRole || "").toLowerCase();
          return !role || role === "student";
        });
        const normalized = normalizeStudents(studs);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.students)) {
        const normalized = normalizeStudents(j.students);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.data?.students)) {
        const normalized = normalizeStudents(j.data.students);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.attendees)) {
        const studs = (j.attendees || []).filter(
          (a) =>
            String(a?.role || a?.userRole || "").toLowerCase() === "student"
        );
        const normalized = normalizeStudents(studs);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.data?.attendees)) {
        const studs = j.data.attendees.map((a) => a?.user || a).filter(Boolean);
        const normalized = normalizeStudents(
          studs.filter(
            (a) =>
              String(a?.role || a?.userRole || "").toLowerCase() === "" ||
              String(a?.role || a?.userRole || "").toLowerCase() === "student"
          )
        );
        if (normalized.length) return normalized;
      }
      if (j?.session?.students && Array.isArray(j.session.students)) {
        const normalized = normalizeStudents(j.session.students);
        if (normalized.length) return normalized;
      }
    } catch {}
  }

  // 2) Try offering/course-based endpoints
  const offeringEndpoints = offeringId
    ? [
        `${API}/api/courses/${offeringId}/students`,
        `${API}/api/offerings/${offeringId}/students`,
        `${API}/api/course-instances/${offeringId}/students`,
        `${API}/api/courseInstances/${offeringId}/students`,
        `${API}/api/sections/${offeringId}/students`,
        `${API}/api/enrollments?offeringId=${encodeURIComponent(offeringId)}`,
      ]
    : [];

  for (const url of offeringEndpoints) {
    try {
      const r = await fetch(url, { headers, credentials: "include" });
      if (!r.ok) continue;
      const j = await r.json();

      if (Array.isArray(j)) {
        const normalized = normalizeStudents(j);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.students)) {
        const normalized = normalizeStudents(j.students);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.data?.students)) {
        const normalized = normalizeStudents(j.data.students);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.enrollments)) {
        const studs = j.enrollments
          .map((e) => e?.student || e?.user || e)
          .filter(Boolean);
        const normalized = normalizeStudents(studs);
        if (normalized.length) return normalized;
      }
      if (Array.isArray(j?.data?.enrollments)) {
        const studs = j.data.enrollments
          .map((e) => e?.student || e?.user || e)
          .filter(Boolean);
        const normalized = normalizeStudents(studs);
        if (normalized.length) return normalized;
      }
    } catch {}
  }

  return [];
}

/* =========================
   SessionNotes-style Skeletons (reuse)
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
   Pagination helpers (same as student)
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
export default function MentorMyFeedback() {
  const [activeTab, setActiveTab] = useState("awaiting");
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);

  const [showGroupFeedbackModal, setShowGroupFeedbackModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

  const [showSingleFeedbackModal, setShowSingleFeedbackModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const { getCourseColor, normalizeCourseKey } = useCourseColor();
  const isMobile = windowWidth <= 1152;

  // courses + sessions
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // mentor feedback data buckets
  const [awaiting, setAwaiting] = useState([]);
  const [submitted, setSubmitted] = useState(loadSubmittedEntries()); // mentor-given (merged with server on load)
  const [received, setReceived] = useState([]); // student->mentor (from backend)

  // persistent progress for modals
  const [persistentFeedback, setPersistentFeedback] = useState({});
  const [singleStudentFeedback, setSingleStudentFeedback] = useState({});

  // submitted map for dedupe of Awaiting
  const submittedMapRef = useRef(loadSubmittedMap());

  // roster prefetch tracker
  const rosterTriedRef = useRef(new Set());

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
     Fetch: courses + sessions + mine (submitted & received)
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
      const r = await fetch(`${API}/api/sessions/mine?as=mentor`, {
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

  // Mentor "mine" (both submitted & received)
  const fetchMine = useCallback(async () => {
    const url = FEEDBACK_MENTOR_MINE_URL.startsWith("http")
      ? FEEDBACK_MENTOR_MINE_URL
      : `${API}${FEEDBACK_MENTOR_MINE_URL}`;
    try {
      const r = await fetch(url, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      if (!r.ok) return { submitted: [], received: [] };
      const j = await r.json();
      const submittedArr = Array.isArray(j?.submitted)
        ? j.submitted
        : Array.isArray(j?.data?.submitted)
        ? j.data.submitted
        : [];
      const receivedArr = Array.isArray(j?.received)
        ? j.received
        : Array.isArray(j?.data?.received)
        ? j.data.received
        : Array.isArray(j)
        ? j
        : [];
      return { submitted: submittedArr, received: receivedArr };
    } catch {
      return { submitted: [], received: [] };
    }
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    const [c, s, mine] = await Promise.all([
      fetchCourses(),
      fetchSessions(),
      fetchMine(),
    ]);
    setCourses(c || []);
    setSessions(s || []);

    // Normalize "received" (student -> mentor)
    const normalizedReceived = (mine.received || []).map((f, idx) => ({
      id: toIdString(f._id) || toIdString(f.id) || `recv-${idx}`,
      sessionId: toIdString(f.session) || toIdString(f.sessionId) || "",
      date:
        f.sessionStart || f.date
          ? formatDateTimeRange(f.sessionStart || f.date, f.sessionEnd)
          : f.createdAt
          ? new Date(f.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }) +
            " - " +
            new Date(f.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "",
      subject:
        (f.subjectCode && f.subjectName
          ? `${f.subjectCode} ${f.subjectName}`
          : f.subject) || "Course",
      section: f.section || f.sectionName || f.sectionCode || "",
      student:
        (typeof f.studentName === "string" && f.studentName) ||
        (f.from && (f.from.fullName || f.from.name)) ||
        "Student",
      topic: f.topic || "—",
      comment: f.notes || f.comment || "",
      anonymous: !!f.anonymous,
      submittedAt: f.visibleToRecipientAt || f.createdAt || "",
    }));

    // Fill subject/section for received if missing (avoid gray cards)
    const normalizedReceivedFilled = normalizedReceived.map((e) => {
      if (e.subject !== "Course" && e.section) return e;
      const sessObj = (s || []).find(
        (sx) => (toIdString(sx._id) || toIdString(sx.id) || toIdString(sx.sessionId)) === e.sessionId
      );
      if (!sessObj) return e;
      const courseIdKey =
        toIdString(sessObj.offeringID) ||
        toIdString(sessObj.offeringId) ||
        toIdString(sessObj.courseId) ||
        toIdString(sessObj.courseID) ||
        "";
      const crs = (c || []).find((cr) => (toIdString(cr._id) || toIdString(cr.id)) === courseIdKey);
      if (!crs) return e;
      return {
        ...e,
        subject: (`${crs.courseCode || ''} ${crs.courseName || ''}`.trim()) || e.subject,
        section: crs.section || crs.sectionName || crs.sectionCode || e.section,
      };
    });
    setReceived(normalizedReceivedFilled);

    // Normalize mentor-given submissions (both drafts & finals)
    const normalizedSubmitted = (mine.submitted || []).map((f, idx) => {
      const finalized = !!f.finalized || !!f.visibleToRecipientAt;
      const obj = {
        id: toIdString(f._id) || `sub-${idx}`,
        sessionId: toIdString(f.session) || toIdString(f.sessionId) || "",
        studentId: toIdString(f.to) || "",
        date:
          f.sessionStart || f.date
            ? formatDateTimeRange(f.sessionStart || f.date, f.sessionEnd)
            : f.createdAt
            ? new Date(f.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }) +
              " - " +
              new Date(f.createdAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "",
        subject:
          (f.subjectCode && f.subjectName
            ? `${f.subjectCode} ${f.subjectName}`
            : f.subject) || "Course",
        section: f.section || f.sectionName || f.sectionCode || "",
        student:
          (typeof f.studentName === "string" && f.studentName) ||
          (f.to && (f.to.fullName || f.to.name)) ||
          "Student",
        topic: f.topic || "—",
        comment: f.notes || f.comment || "",
        anonymous: !!f.anonymous,
        finalized,
        createdAt: f.createdAt || null,
        submittedAt: f.visibleToRecipientAt
          ? new Date(f.visibleToRecipientAt).toLocaleDateString() +
            " at " +
            new Date(f.visibleToRecipientAt).toLocaleTimeString()
          : f.createdAt
          ? new Date(f.createdAt).toLocaleDateString() +
            " at " +
            new Date(f.createdAt).toLocaleTimeString()
          : "",
      };

      if (obj.subject === "Course" || !obj.section) {
        const sessObj = (s || []).find(
          (sx) =>
            (toIdString(sx._id) ||
              toIdString(sx.id) ||
              toIdString(sx.sessionId)) === obj.sessionId
        );
        if (sessObj) {
          const courseIdKey =
            toIdString(sessObj.offeringID) ||
            toIdString(sessObj.offeringId) ||
            toIdString(sessObj.courseId) ||
            toIdString(sessObj.courseID) ||
            "";
          const courseFromList = (c || []).find(
            (cr) => (toIdString(cr._id) || toIdString(cr.id)) === courseIdKey
          );
          if (courseFromList) {
            obj.subject =
              `${courseFromList.courseCode || ""} ${
                courseFromList.courseName || ""
              }`.trim() || obj.subject;
            obj.section =
              courseFromList.section ||
              courseFromList.sectionName ||
              courseFromList.sectionCode ||
              obj.section;
          }
        }
      }

      return obj;
    });

    // Seed server drafts into local progress so "Continue" shows up cross-device
    if (normalizedSubmitted.length) {
      const nextGroup = {};
      const nextSingle = {};
      normalizedSubmitted.forEach((e) => {
        if (!e.finalized && e.sessionId) {
          const sid = e.sessionId;
          const stid = e.studentId || "student";
          nextGroup[sid] = nextGroup[sid] || {};
          nextGroup[sid][stid] = {
            studentId: stid,
            studentName: e.student || "Student",
            notes: e.comment || "",
            submittedAt:
              (e.createdAt &&
                new Date(e.createdAt).toLocaleDateString() +
                  " at " +
                  new Date(e.createdAt).toLocaleTimeString()) ||
              undefined,
          };
          if (!nextSingle[sid]) {
            nextSingle[sid] = {
              notes: e.comment || "",
              submittedAt:
                (e.createdAt &&
                  new Date(e.createdAt).toLocaleDateString() +
                    " at " +
                    new Date(e.createdAt).toLocaleTimeString()) ||
                undefined,
            };
          }
        }
      });
      if (Object.keys(nextGroup).length) {
        setPersistentFeedback((prev) => ({ ...nextGroup, ...prev }));
      }
      if (Object.keys(nextSingle).length) {
        setSingleStudentFeedback((prev) => ({ ...nextSingle, ...prev }));
      }
    }

    // Server-only: take finalized submissions directly
    const merged = normalizedSubmitted.filter((e) => e.finalized);
    setSubmitted(merged);

    setLoading(false);
  }, [fetchCourses, fetchSessions, fetchMine]);

  useEffect(() => {
    refreshData();
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

  /* =========================
     Normalize: map mentor sessions -> Awaiting (ended & not cancelled)
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

      if (!Number.isFinite(endTs) || endTs > now) continue;

      const sid =
        toIdString(s._id) ||
        toIdString(s.sessionId) ||
        toIdString(s.apiId) ||
        toIdString(s.id);
      if (!sid) continue;

      if (submittedMapRef.current[sid] || alreadyAwaitingIds.has(sid)) continue;

      const courseIdKey =
        toIdString(s.offeringID) ||
        toIdString(s.offeringId) ||
        toIdString(s.courseId) ||
        toIdString(s.courseID);
      const course = coursesById.get(courseIdKey);
      const subject = course
        ? `${course.courseCode || ""} ${course.courseName || ""}`.trim() ||
          "Course"
        : "Course";
      const section =
        (course &&
          (course.section || course.sectionName || course.sectionCode)) ||
        "";

      // Try to read students from the session payload (many possible shapes)
      const primaryList =
        (Array.isArray(s.students) && s.students) ||
        (Array.isArray(s.attendees) &&
          s.attendees.filter(
            (a) =>
              String(a?.role || a?.userRole || "").toLowerCase() === "student"
          )) ||
        // Forgiving participants: allow p.user or p directly; exclude mentor; ignore cancelled
        (Array.isArray(s.participants) &&
          s.participants
            .filter((p) => p?.status !== "cancelled")
            .filter((p) => {
              const uid = toIdString(p.user || p.userId || p._id || p.id);
              const mentorId = toIdString(s.mentorId);
              return !mentorId || (uid && uid !== mentorId);
            })
            .map((p) => p.user || p)) ||
        [];

      const students = normalizeStudents(primaryList);

      const topic = s.topic || "—";
      const date = formatDateTimeRange(startISO, endISO);

      newly.push({
        id: sid,
        sessionId: sid,
        offeringId: toIdString(s.offeringID) || toIdString(s.offeringId) || "",
        date,
        subject,
        section,
        students,
        topic,
      });
    }

    if (newly.length) {
      setAwaiting((prev) => [...prev, ...newly]);
    }
  }, [sessions, coursesById, awaiting]);

  /* =========================
     Prefetch rosters for cards that have no students yet
     ========================= */
  useEffect(() => {
    (async () => {
      const targets = (awaiting || [])
        .filter((e) => !rosterTriedRef.current.has(e.id))
        .filter((e) => !e.students || e.students.length === 0)
        .slice(0, 4); // small batch
      for (const entry of targets) {
        rosterTriedRef.current.add(entry.id);
        let students = await fetchSessionRosterFlexible(entry);
        // If roster empty but we have names without IDs, try resolving
        if (
          (!students || students.length === 0) &&
          entry.students &&
          entry.students.length > 0
        ) {
          const resolved = await resolveStudentsToIds(entry.students);
          if (resolved.some((s) => s.needsFeedback)) {
            students = resolved;
          }
        }
        if (students && students.length) {
          setAwaiting((prev) =>
            prev.map((s) => (s.id === entry.id ? { ...s, students } : s))
          );
        }
      }
    })();
  }, [awaiting]);

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

  useEffect(() => {
    if (activeTab === "awaiting") setPageAwaiting(1);
    if (activeTab === "submitted") setPageSubmitted(1);
    if (activeTab === "received") setPageReceived(1);
  }, [activeTab]);

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
    t === "awaiting"
      ? "awaiting"
      : t === "submitted"
      ? "submitted"
      : "received";

  const formatStudentDisplay = (students) => {
    if (!students || !students.length) return "Students: Loading...";
    const names = students.map((s) => s.name).join(", ");
    if (students.length === 1) return `Student: ${names}`;
    return `Students: ${names}`;
  };

  /* =========================
     Backend calls (mentor -> student)
     ========================= */
  async function postMentorDraft({ sessionId, studentId, notes }) {
    const r = await fetch(`${API}/api/feedback/mentor/draft`, {
      method: "POST",
      headers: tokenHeaders(),
      credentials: "include",
      body: JSON.stringify({ sessionId, studentId, notes }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `Draft save failed (${r.status})`);
    return j;
  }

  async function postMentorFinal({ sessionId, studentId, notes }) {
    const r = await fetch(`${API}/api/feedback/mentor`, {
      method: "POST",
      headers: tokenHeaders(),
      credentials: "include",
      body: JSON.stringify({ sessionId, studentId, notes }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `Submit failed (${r.status})`);
    return j;
  }

  /* =========================
     Click handler: ensure students (with IDs) before opening modals
     ========================= */
  const onGiveFeedbackClick = async (entry) => {
    let students = entry.students || [];
    let needing = students.filter((s) => s.needsFeedback);

    // If no valid IDs yet, try fetching a roster just-in-time (session/offering)
    if (needing.length === 0) {
      const fetched = await fetchSessionRosterFlexible(entry);
      if (fetched.length) {
        students = fetched;
        setAwaiting((prev) =>
          prev.map((s) => (s.id === entry.id ? { ...s, students } : s))
        );
        needing = students.filter((s) => s.needsFeedback);
      }
    }

    // Still nothing? Try resolving IDs from emails/names visible on the card
    if (needing.length === 0 && students.length) {
      const resolved = await resolveStudentsToIds(students);
      if (resolved.some((s) => s.needsFeedback)) {
        students = resolved;
        setAwaiting((prev) =>
          prev.map((s) => (s.id === entry.id ? { ...s, students } : s))
        );
        needing = students.filter((s) => s.needsFeedback);
      }
    }

    if (needing.length === 0) {
      showToast(
        "Cannot give feedback: session has no students with valid user IDs. Ask admin to sync users."
      );
      return;
    }

    if (needing.length === 1) {
      const student = needing[0];
      setSelectedStudent({ student, session: entry });
      setShowSingleFeedbackModal(true);
    } else {
      setSelectedSession({ ...entry, students }); // pass refreshed list
      setShowGroupFeedbackModal(true);
    }
  };

  /* =========================
     Submit handlers (mentor -> student)
     ========================= */

  // SINGLE student — SAVE DRAFT
  const handleSingleFeedbackSubmit = async (feedbackData) => {
    if (!selectedStudent?.session?.id) return;
    const sessionId = selectedStudent.session.id;
    const studentId = selectedStudent.student.id;

    try {
      await postMentorDraft({
        sessionId,
        studentId,
        notes: feedbackData.notes,
      });
    } catch (e) {
      showToast(e.message || "Server rejected the draft.");
      return;
    }

    setSingleStudentFeedback((prev) => ({
      ...prev,
      [sessionId]: {
        notes: feedbackData.notes,
        submittedAt:
          feedbackData.submittedAt ||
          new Date().toLocaleDateString() +
            " at " +
            new Date().toLocaleTimeString(),
      },
    }));

    setPersistentFeedback((prev) => {
      const cur = { ...(prev[sessionId] || {}) };
      cur[studentId] = {
        studentId,
        studentName: selectedStudent.student.name || "Student",
        notes: feedbackData.notes,
        submittedAt:
          feedbackData.submittedAt ||
          new Date().toLocaleDateString() +
            " at " +
            new Date().toLocaleTimeString(),
      };
      return { ...prev, [sessionId]: cur };
    });

    showToast("Draft saved.");
  };

  // SINGLE student — FINAL SUBMIT
  const handleSingleFeedbackComplete = async (submittedFeedbackData) => {
    if (!selectedStudent) return;

    const sid = selectedStudent.session.sessionId || selectedStudent.session.id;
    const studentId = selectedStudent.student.id;

    try {
      await postMentorFinal({
        sessionId: sid,
        studentId,
        notes: submittedFeedbackData.notes,
      });
    } catch (e) {
      showToast(e.message || "Server rejected the submission.");
      return;
    }

    if (sid) {
      submittedMapRef.current = { ...submittedMapRef.current, [sid]: true };
      saveSubmittedMap(submittedMapRef.current);
    }

    setAwaiting((prev) =>
      prev.filter((s) => s.id !== selectedStudent.session.id)
    );

    const submittedEntry = {
      id: `${sid}-${studentId}-${Date.now()}`,
      sessionId: sid,
      studentId,
      date: selectedStudent.session.date,
      subject: selectedStudent.session.subject,
      section: selectedStudent.session.section,
      student: selectedStudent.student.name,
      topic: selectedStudent.session.topic,
      comment: submittedFeedbackData.notes,
      anonymous: false,
      finalized: true,
      submittedAt:
        submittedFeedbackData.submittedAt ||
        new Date().toLocaleDateString() +
          " at " +
          new Date().toLocaleTimeString(),
    };

    // Server-only list: fetch fresh instead of appending locally
    refreshData();

    setSingleStudentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[selectedStudent.session.id];
      return updated;
    });
    setPersistentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[selectedStudent.session.id];
      return updated;
    });

    setShowSingleFeedbackModal(false);
    showToast(
      `✓ Feedback submitted for ${selectedStudent.student.name} and moved to Submitted tab!`
    );
    refreshData();
  };

  // GROUP — SAVE DRAFT
  const handleGroupFeedbackSubmit = async (feedbackData) => {
    if (!selectedSession?.id || !feedbackData) return;
    const sessionId = selectedSession.id;

    const entries = Object.values(feedbackData);
    try {
      for (const fb of entries) {
        if (!fb || !isNonEmptyId(fb.studentId)) continue;
        await postMentorDraft({
          sessionId,
          studentId: fb.studentId,
          notes: fb.notes || "",
        });
      }
    } catch (e) {
      showToast(e.message || "Some drafts failed to save.");
      return;
    }

    setPersistentFeedback((prev) => ({
      ...prev,
      [sessionId]: {
        ...(prev[sessionId] || {}),
        ...feedbackData,
      },
    }));

    showToast("Drafts saved.");
  };

  // GROUP — FINAL SUBMIT
  const handleSessionComplete = async (
    completedSession,
    submittedFeedbackData
  ) => {
    const sid = completedSession.sessionId || completedSession.id;
    if (!sid || !submittedFeedbackData) return;

    const toAppend = [];
    try {
      for (const fb of Object.values(submittedFeedbackData)) {
        const studentId = fb.studentId || fb.studentID || "";
        if (!isNonEmptyId(studentId)) continue;

        await postMentorFinal({
          sessionId: sid,
          studentId,
          notes: fb.notes || "",
        });

        toAppend.push({
          id: `${sid}-${studentId}-${Date.now()}-${Math.random()}`,
          sessionId: sid,
          studentId,
          date: completedSession.date,
          subject: completedSession.subject,
          section: completedSession.section,
          student: fb.studentName || "Student",
          topic: completedSession.topic,
          comment: fb.notes || "",
          anonymous: false,
          finalized: true,
          submittedAt:
            fb.submittedAt ||
            new Date().toLocaleDateString() +
              " at " +
              new Date().toLocaleTimeString(),
        });
      }
    } catch (e) {
      showToast(e.message || "Some submissions failed.");
      return;
    }

    submittedMapRef.current = { ...submittedMapRef.current, [sid]: true };
    saveSubmittedMap(submittedMapRef.current);

    setAwaiting((prev) => prev.filter((s) => s.id !== completedSession.id));

    // Server-only list: fetch fresh instead of appending locally
    refreshData();

    setPersistentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[completedSession.id];
      return updated;
    });
    setSingleStudentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[completedSession.id];
      return updated;
    });

    const n = toAppend.length;
    showToast(
      `✓ Feedback submitted for ${n} ${
        n === 1 ? "student" : "students"
      } and moved to Submitted tab!`
    );
    refreshData();
  };

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
                className={`tab-button ${
                  activeTab === "awaiting" ? "active" : ""
                }`}
                onClick={() => setActiveTab("awaiting")}
              >
                Awaiting
              </button>
              <button
                className={`tab-button ${
                  activeTab === "submitted" ? "active" : ""
                }`}
                onClick={() => setActiveTab("submitted")}
              >
                Submitted
              </button>
              <button
                className={`tab-button ${
                  activeTab === "received" ? "active" : ""
                }`}
                onClick={() => setActiveTab("received")}
              >
                Received
              </button>
            </div>

            <div
              className={`schedule-list ${
                !loading && pagedList.length === 0 ? "empty" : ""
              }`}
              aria-busy={loading}
              key={activeTab}
            >
              {loading ? (
                <FeedbackSkeletonList count={3} />
              ) : (
                <>
                  {pagedList.map((entry, i) => {
                    const accent = getCourseColor(
                      entry.subject || entry.section
                    );

                    const program = getProgramFromCode(
                      entry.subject,
                      normalizeCourseKey
                    );
                    const yrNum = getYearFromSectionDigit(entry.section);
                    const chipLabel = `${
                      yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"
                    } — ${program}`;

                    const isAwaiting = activeTab === "awaiting";

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
                            {isAwaiting
                              ? formatStudentDisplay(entry.students)
                              : `Student: ${
                                  entry.anonymous ? "Anonymous" : entry.student
                                }`}
                          </p>

                          <div className="bottom-row">
                            <div className="topic">Topic: {entry.topic}</div>

                            {isAwaiting ? (
                              (() => {
                                const students = entry.students || [];
                                const needing = students.filter(
                                  (s) => s.needsFeedback
                                );
                                let hasProgress, buttonText;

                                if (needing.length <= 1) {
                                  hasProgress =
                                    !!singleStudentFeedback[entry.id];
                                  buttonText = hasProgress
                                    ? "Continue"
                                    : "Give Feedback";
                                } else {
                                  const sessionFeedback =
                                    persistentFeedback[entry.id] || {};
                                  const completedCount =
                                    Object.keys(sessionFeedback).length;
                                  const totalCount = needing.length;
                                  hasProgress = completedCount > 0;
                                  buttonText = hasProgress
                                    ? `Continue (${completedCount}/${totalCount})`
                                    : "Give Feedback";
                                }

                                return (
                                  <button
                                    className="join-btn"
                                    onClick={() => onGiveFeedbackClick(entry)}
                                  >
                                    {buttonText}
                                  </button>
                                );
                              })()
                            ) : entry.comment ? (
                              <button
                                className="fb-view-btn"
                                onClick={() => {
                                  setSelectedFeedback({
                                    ...entry,
                                    givenBy:
                                      activeTab === "received"
                                        ? entry.anonymous
                                          ? "Anonymous"
                                          : entry.student
                                        : "You",
                                    givenTo:
                                      activeTab === "submitted"
                                        ? entry.student
                                        : "You",
                                    accentColor: accent,
                                  });
                                  setShowViewModal(true);
                                }}
                              >
                                View Feedback
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {!loading && fullList.length === 0 && (
                    <p className="empty-msg">
                      No {labelForTab(activeTab)} feedback entries.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Range + page meta */}
            {!loading && fullList.length > 0 && (
              <div className="schedule-meta">
                <span className="schedule-meta__range">
                  Showing {fullList.length ? startIndex + 1 : 0}-{endIndex} of{" "}
                  {fullList.length} {labelForTab(activeTab)} entries
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
                  {getPaginationItems(currentPage, totalPages).map(
                    (item, idx) =>
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
                          aria-current={
                            item === currentPage ? "page" : undefined
                          }
                          style={{
                            padding: "0.5rem 0.75rem",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            background:
                              item === currentPage ? "#3b82f6" : "white",
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
                    cursor: "not-allowed",
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

        {/* ===== Read-only View Feedback ===== */}
        <ViewFeedbackModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          feedback={selectedFeedback}
          viewerRole={"mentor"}
          accentColor={selectedFeedback?.accentColor || "#1d4ed8"}
        />

        {/* ===== Group Give Feedback (mentor -> many students) ===== */}
        <GroupGiveFeedbackModal
          isOpen={showGroupFeedbackModal}
          onClose={() => {
            setShowGroupFeedbackModal(false);
            setSelectedSession(null);
          }}
          onSubmit={handleGroupFeedbackSubmit}
          onSessionComplete={handleSessionComplete}
          onFeedbackUpdate={(sessionId, feedbackData) => {
            setPersistentFeedback((prev) => ({
              ...prev,
              [sessionId]: feedbackData,
            }));
          }}
          session={selectedSession}
          initialFeedback={
            selectedSession?.id
              ? persistentFeedback[selectedSession.id] || {}
              : {}
          }
          topic={selectedSession?.topic}
          accentColor={
            getCourseColor(
              selectedSession?.subject || selectedSession?.section
            ) || "#1d4ed8"
          }
        />

        {/* ===== Single Student Give Feedback ===== */}
        <MentorGiveFeedbackModal
          isOpen={showSingleFeedbackModal}
          onClose={() => {
            setShowSingleFeedbackModal(false);
            setSelectedStudent(null);
          }}
          onSubmit={handleSingleFeedbackSubmit}
          onSessionComplete={handleSingleFeedbackComplete}
          onFeedbackUpdate={(sessionId, feedbackData) => {
            setSingleStudentFeedback((prev) => ({
              ...prev,
              [sessionId]: feedbackData,
            }));
          }}
          sessionId={selectedStudent?.session.id}
          initialFeedback={
            selectedStudent?.session.id
              ? singleStudentFeedback[selectedStudent.session.id] || null
              : null
          }
          studentName={selectedStudent?.student.name}
          subject={selectedStudent?.session.subject}
          section={selectedStudent?.session.section}
          dateTime={selectedStudent?.session.date}
          topic={selectedStudent?.session.topic}
          accentColor={
            selectedStudent?.accentColor ||
            getCourseColor(
              selectedStudent?.session.subject ||
                selectedStudent?.session.section
            ) ||
            "#1d4ed8"
          }
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