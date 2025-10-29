import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "../student/MySchedule.css";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import MentorRescheduleSessionModal from "../../components/RescheduleSessionModal";
import MentorCancelBookingModal from "../../components/MentorCancelBookingModal";
import SetMeetingLinkModal from "../../components/SetMeetingLinkModal";
import MentorAvailabilityCalendar from "../../components/MentorAvailabilityCalendar";
import { useCourseColor } from "../../context/CourseColorContext";
import { useAuth } from "../../context/AuthContext";
import { getProgramFromCode, getYearFromSectionDigit, ordinal } from "../../utils/programYear";

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
        [course.mentor.firstName, course.mentor.lastName].filter(Boolean).join(" "))) ||
    (typeof course?.mentorId === "object" &&
      (course.mentorId.name ||
        course.mentorId.fullName ||
        [course.mentorId.firstName, course.mentorId.lastName].filter(Boolean).join(" ")));
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

/* Helper: ensure a proper https:// prefix for external links */
const ensureHttp = (url) => {
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/* Date + time range like "28 July 2025 - 8:30 PM–9:00 PM" */
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

export default function MentorMySchedule() {
  /* ====================== Auth, theme, nav ====================== */
  const { user } = useAuth();
  const { getYearColor, normalizeCourseKey } = useCourseColor();
  const navigate = useNavigate();

  /* ====================== UI State ====================== */
  const [activeTab, setActiveTab] = useState("upcoming");

  // ===== Toast (same as MySchedule: single, portaled) =====
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

  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const menuRefs = useRef([]);
  const isMobile = windowWidth <= 1152;

  const [showResched, setShowResched] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showCancel, setShowCancel] = useState(false);

  // Meeting links (server-backed; localStorage fallback)
  const [meetingLinks, setMeetingLinks] = useState({});
  const [showSetLink, setShowSetLink] = useState(false);

  // ✅ Recording link modal (server-backed, per-session)
  const [showSetRecordingLink, setShowSetRecordingLink] = useState(false);
  const [selectedRecordingTarget, setSelectedRecordingTarget] = useState(null); // { sessionId, subject, section, link }
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState(null); // { sessionId, subject, section }

  // Unified Manage menu + panels
  const [showManageMenu, setShowManageMenu] = useState(false);
  const manageWrapRef = useRef(null);
  const [showManageLinks, setShowManageLinks] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [showManageAvailability, setShowManageAvailability] = useState(false);

  /* ====================== Window + outside click ====================== */
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    const handleClickOutside = (event) => {
      const currentMenu = menuRefs.current[openMenuIndex];
      const clickedInsideRowMenu =
        openMenuIndex !== null && currentMenu && currentMenu.contains(event.target);
      if (!clickedInsideRowMenu) setOpenMenuIndex(null);

      if (!manageWrapRef.current?.contains(event.target)) {
        setShowManageMenu(false);
        setShowManageLinks(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowManageMenu(false);
        setShowManageLinks(false);
        setShowConfirmDelete(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ====================== Local storage hydration (course meeting links only) ====================== */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("meetingLinks");
      if (raw) setMeetingLinks(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to read meetingLinks from localStorage", e);
    }
  }, []);

  /* ====================== Courses (DB) ====================== */
  const [dbCourses, setDbCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [pairToCourse, setPairToCourse] = useState({}); // "SUBJECT__SECTION" -> courseId

  const meId = String(user?._id || user?.id || "").trim();
  const meName = String(user?.name || "").toLowerCase().trim();
  const meEmail = String(user?.email || "").toLowerCase().trim();

  const isMine = useCallback(
    (c) => {
      if (!c) return false;
      let mentorId = c.mentor?._id ?? c.mentorId ?? c.mentor ?? c.assignedMentorId ?? null;
      if (mentorId && typeof mentorId === "object" && mentorId._id) {
        mentorId = mentorId._id;
      }
      const mentorIdStr = mentorId != null ? String(mentorId).trim() : "";
      const mentorName = String(c.assignedMentor || c.mentorName || "").toLowerCase().trim();
      const mentorEmail = String(c.mentorEmail || "").toLowerCase().trim();

      return (
        (!!meId && !!mentorIdStr && mentorIdStr === meId) ||
        (!!meName && !!mentorName && mentorName === meName) ||
        (!!meEmail && !!mentorEmail && mentorEmail === meEmail)
      );
    },
    [meId, meName, meEmail]
  );

  const normalizeCourse = (c) => ({
    _id: c?._id || c?.id,
    courseCode: c?.courseCode || c?.code || "",
    courseName: c?.courseName || c?.name || "",
    section: c?.section || "",
    defaultMeetLink: c?.defaultMeetLink || "",
    scheduleDaysStr: (c?.schedule?.days || "").toUpperCase().trim(),
    scheduleTimeStr: (c?.schedule?.time || "").trim(), // ✅ NEW
    mentorId:
      typeof c?.mentorId === "object" && c?.mentorId?._id
        ? String(c.mentorId._id)
        : c?.mentorId
        ? String(c.mentorId)
        : "",
    mentorName: c?.mentorName || c?.assignedMentor || "",
    mentorEmail: c?.mentorEmail || "",
  });

  const loadCourses = useCallback(async () => {
    if (!user) return;
    setIsLoadingCourses(true);
    setCoursesError("");
    try {
      // Prefer server endpoint filtered by logged mentor.
      let res = await fetch(`${API}/api/courses/mine`, {
        headers: tokenHeaders(),
        credentials: "include",
      });
      let list = [];
      if (res.ok) {
        const data = await res.json();
        list = pickArray(data);
      } else {
        // Fallback: fetch all then filter locally.
        res = await fetch(`${API}/api/courses`, {
          headers: tokenHeaders(),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        list = (Array.isArray(data) ? data : []).filter(isMine);
      }

      const norm = list.map(normalizeCourse);
      setDbCourses(norm);

      // Build pair->courseId and server-provided meeting links
      const nextPair = {};
      const serverLinks = {};
      norm.forEach((c) => {
        const subject = `${c.courseCode} ${c.courseName}`.trim();
        const key = `${subject}__${c.section}`;
        nextPair[key] = c._id;
        if (c.defaultMeetLink) serverLinks[key] = c.defaultMeetLink; // ✅ fix: use key, not k
      });
      setPairToCourse(nextPair);

      // Merge with pruning: for any loaded pair, remove stale cached link if server has none
      setMeetingLinks((prev) => {
        const next = { ...prev };
        Object.keys(nextPair).forEach((k) => {
          if (serverLinks[k]) {
            next[k] = ensureHttp(serverLinks[k]);
          } else {
            delete next[k];
          }
        });
        try {
          localStorage.setItem("meetingLinks", JSON.stringify(next));
        } catch {}
        return next;
      });

      setIsLoadingCourses(false);
    } catch (e) {
      console.error(e);
      setDbCourses([]);
      setPairToCourse({});
      setIsLoadingCourses(false);
      setCoursesError("Failed to load assigned courses.");
    }
  }, [user, isMine]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  /* ====================== Sessions (DB) ====================== */
  const [rawSessions, setRawSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      // Backend returns sessions where the user is mentor/creator/participant
      const res = await fetch(`${API}/api/sessions/mine?as=mentor`, {
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

  /* ====================== Helpers for schedule list ====================== */
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const isTodayTs = (ts) => {
    if (!ts || Number.isNaN(ts)) return false;
    const d = new Date(ts);
    const now = new Date();
    return dateKey(d) === dateKey(now);
  };

  const accentVarsFor = (subject, section) => {
    const key = normalizeCourseKey(`${subject || ""} ${section || ""}`);
    const accent = getYearColor(key);
    return { "--accent": accent, "--accentRing": "rgba(0,0,0,0.08)" };
  };

  // Build a map of course by id for quick lookups
  const courseById = useMemo(() => {
    const m = new Map();
    (dbCourses || []).forEach((c) => {
      m.set(toIdString(c._id || c.id), c);
    });
    return m;
  }, [dbCourses]);

  // Derive normalized sessions into the UI model the page expects
  const normalizedSessions = useMemo(() => {
    const list = [];
    (rawSessions || []).forEach((s) => {
      const courseId =
        toIdString(s.offeringID) || toIdString(s.courseId) || toIdString(s.courseID) || "";
      const course = courseById.get(courseId);

      const subject = course ? `${course.courseCode || ""} ${course.courseName || ""}`.trim() : "Course";
      const section = course?.section || "";
      const mentor = getMentorName(course);

      const startISO = s.scheduleStart || s.startISO;
      const endISO = s.scheduleEnd || s.endISO;

      const display = formatDateTimeRange(startISO, endISO);
      const start = startISO ? new Date(startISO) : null;
      const end = endISO ? new Date(endISO) : null;

      const duration = start && end ? Math.max(0, Math.round((end - start) / (60 * 1000))) : 30;

      // compute END timestamp with safe fallback (start + duration)
      const endTs =
        end && !Number.isNaN(end.getTime())
          ? end.getTime()
          : start && !Number.isNaN(start.getTime())
          ? start.getTime() + duration * 60 * 1000
          : NaN;

      const meetLink =
        s.meetLink || meetingLinks[`${subject}__${section}`] || course?.defaultMeetLink || "";

      const rawStudents =
        s.students || s.participants || s.attendees || s.members || s.group || s.groupMembers || [];
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

      list.push({
        id: s.sessionId || s._id || `${courseId}-${startISO}`,
        date: display,
        startISO,
        endISO,
        _startTs: start ? start.getTime() : NaN,
        _endTs: endTs, // <-- used for Upcoming/Past classification (END time)
        subject,
        section,
        mentor,
        topic: s.topic || "—",
        duration,
        recordingUrl: s.recordingUrl || "",
        status: typeof s.status === "string" ? s.status : "booked",
        meetLink,
        students: studentNames,
        isGroup,
      });
    });
    return list;
  }, [rawSessions, courseById, meetingLinks]);

  // Split into upcoming/past:
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

    // Upcoming: soonest first (by start time)
    upcoming.sort((a, b) => (a._startTs || 0) - (b._startTs || 0));
    // Past: most recently finished first (by end time)
    past.sort((a, b) => (b._endTs || 0) - (a._endTs || 0));

    return { upcomingSorted: upcoming, pastSorted: past };
  }, [normalizedSessions]);

  /* ====================== Pagination (mentor) ====================== */
  const [pageUpcoming, setPageUpcoming] = useState(1);
  const [pagePast, setPagePast] = useState(1);
  const perPage = 6;

  useEffect(() => {
    if (activeTab === "upcoming") setPageUpcoming(1);
    else setPagePast(1);
    setOpenMenuIndex(null);
  }, [activeTab]);

  useEffect(() => {
    setPageUpcoming(1);
  }, [upcomingSorted.length]);
  useEffect(() => {
    setPagePast(1);
  }, [pastSorted.length]);

  const fullList = activeTab === "upcoming" ? upcomingSorted : pastSorted;
  const currentPage = activeTab === "upcoming" ? pageUpcoming : pagePast;
  const totalPages = Math.ceil(fullList.length / perPage) || 1;
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, fullList.length);
  const list = fullList.slice(startIndex, endIndex);
  const setPage = (p) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (activeTab === "upcoming") setPageUpcoming(clamped);
    else setPagePast(clamped);
    setOpenMenuIndex(null);
  };

  const anyLoading = isLoadingCourses || sessionsLoading;

  /* ====================== live highlight tick (15s) ====================== */
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  /* ====================== Meeting link save/clear (DB first) ====================== */
  const handleSaveLink = async (subject, section, link) => {
    const key = `${subject}__${section}`;
    const cid = pairToCourse[key];
    const trimmed = (link || "").trim();

    // CLEAR case
    if (!trimmed) {
      if (cid) {
        try {
          await fetch(`${API}/api/courses/${cid}/link`, {
            method: "PATCH",
            headers: tokenHeaders(),
            credentials: "include",
            body: JSON.stringify({ defaultMeetLink: "" }),
          });
        } catch (e) {
          console.warn("Clear link PATCH failed:", e);
        }
      }
      setMeetingLinks((prev) => {
        const next = { ...prev };
        delete next[key];
        try {
          localStorage.setItem("meetingLinks", JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast("✅ Meeting link removed.", "success");
      return;
    }

    // SAVE/UPDATE case
    const finalLink = ensureHttp(trimmed);
    if (!finalLink.startsWith("https://meet.google.com/")) {
      showToast("⚠️ Please enter a valid Google Meet link.", "error");
      return;
    }

    if (cid) {
      try {
        const res = await fetch(`${API}/api/courses/${cid}/link`, {
          method: "PATCH",
          headers: tokenHeaders(),
          credentials: "include",
          body: JSON.stringify({ defaultMeetLink: finalLink }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch (e) {
        showToast("❌ Failed to save meeting link.", "error");
        return;
      }
    } else {
      // Local fallback if no course id
      try {
        const raw = localStorage.getItem("meetingLinks");
        const obj = raw ? JSON.parse(raw) : {};
        obj[key] = finalLink;
        localStorage.setItem("meetingLinks", JSON.stringify(obj));
      } catch {}
    }

    setMeetingLinks((prev) => {
      const next = { ...prev, [key]: finalLink };
      try {
        localStorage.setItem("meetingLinks", JSON.stringify(next));
      } catch {}
      return next;
    });
    showToast("✅ Meeting link saved.", "success");
  };

  /* ====================== Recording links (server-backed, per-session) ====================== */
  const openSetRecordingLinkModal = (session) => {
    setSelectedRecordingTarget({
      sessionId: session.id || session.sessionId,
      subject: session.subject,
      section: session.section,
      link: session.recordingUrl || "",
    });
    setShowSetRecordingLink(true);
  };

  const handleSaveRecordingLink = async (sessionId, link) => {
    const final = ensureHttp((link || "").trim());
    try {
      const res = await fetch(`${API}/api/sessions/${sessionId}/recording`, {
        method: "PATCH",
        headers: tokenHeaders(),
        credentials: "include",
        body: JSON.stringify({ recordingUrl: final }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      showToast("Recording link saved.", "success");
      await fetchSessions();
    } catch (e) {
      console.error(e);
      showToast("Failed to save recording link.", "error");
    }
  };

  const handleRemoveRecordingLink = async (sessionId) => {
    try {
      const res = await fetch(`${API}/api/sessions/${sessionId}/recording`, {
        method: "PATCH",
        headers: tokenHeaders(),
        credentials: "include",
        body: JSON.stringify({ recordingUrl: "" }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      showToast("Recording link removed.", "success");
      await fetchSessions();
    } catch (e) {
      console.error(e);
      showToast("Failed to remove recording link.", "error");
    }
  };

  /* ====================== Subject–Section list for Manage panels ====================== */

  // Local parser identical to the calendar's rules (WF => Wed/Fri; TTHS => Thu/Sat)
  const parseDays = (raw = "") => {
    let s = String(raw).toUpperCase().replace(/\s+/g, "");
    s = s.replace(/T{2,}HS/g, "THS").replace(/T{2,}H/g, "TH");
    const out = [];
    for (let i = 0; i < s.length; ) {
      if (s.startsWith("TH", i)) {
        out.push(4); // Thu
        i += 2;
        continue;
      }
      const ch = s[i];
      const map = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
      if (map[ch] !== undefined) out.push(map[ch]);
      i += 1;
    }
    return [...new Set(out)].sort((a, b) => a - b);
  };

  const subjectSectionPairs = useMemo(() => {
    const fromDb = dbCourses
      .map((c) => {
        const subject = `${c.courseCode} ${c.courseName}`.trim();
        const section = c.section || "";
        const daysStr = c.scheduleDaysStr || "";
        const timeStr = c.scheduleTimeStr || ""; // ✅ pass schedule.time
        return {
          subject,
          section,
          daysStr,
          timeStr,
          allowedDow: parseDays(daysStr),
        };
      })
      .filter((x) => x.subject && x.section);

    if (fromDb.length > 0) {
      return fromDb.sort((a, b) =>
        `${a.subject} ${a.section}`.localeCompare(`${b.subject} ${b.section}`)
      );
    }

    // fallback to what we see in sessions
    const all = [...normalizedSessions];
    const map = new Map();
    all.forEach((s) => {
      const key = `${s.subject}__${s.section}`;
      if (!map.has(key))
        map.set(key, {
          subject: s.subject,
          section: s.section,
          daysStr: "",
          timeStr: "",
          allowedDow: [],
        });
    });
    return Array.from(map.values()).sort((a, b) =>
      `${a.subject} ${a.section}`.localeCompare(`${b.subject} ${b.section}`)
    );
  }, [dbCourses, normalizedSessions]);

  const filterPairs = (pairs, q) => {
    const query = q.trim().toLowerCase();
    if (!query) return pairs;
    return pairs.filter(({ subject, section }) =>
      `${subject} ${section}`.toLowerCase().includes(query)
    );
  };
  const filteredPairs = useMemo(
    () => filterPairs(subjectSectionPairs, manageSearch),
    [manageSearch, subjectSectionPairs]
  );

  /* ====================== Row helpers ====================== */
  const formatStudentDisplay = (students, isSchedulePage = false) => {
    if (!students || students.length === 0) return "No students";
    if (students.length === 1) return `Student: ${students[0]}`;
    return isSchedulePage ? `Students: ${students.join(", ")}` : `Students: ${students[0]}, ${students.length - 1}+`;
  };

  /* ====================== Reschedule / Cancel (DB) ====================== */
  const handleReschedule = useCallback(
    async (payload) => {
      try {
        // NEW: guard — new start must be at least 24h from now
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

        const id = selectedSession?.sessionId || selectedSession?.id || selectedSession?._id;
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

        if (!res.ok) {
          showToast("Failed to reschedule.", "error");
          return false;
        }

        await fetchSessions();
        showToast("Session rescheduled.", "success");
        return true;
      } catch (e) {
        console.error("Reschedule PATCH failed:", e);
        showToast("Network error while rescheduling.", "error");
        return false;
      }
    },
    [selectedSession, fetchSessions, showToast]
  );

  const handleCancel = useCallback(
    async (payload) => {
      try {
        const id = selectedSession?.sessionId || selectedSession?.id || selectedSession?._id;
        if (!id) return false;

        const status = (selectedSession?.status || "").trim().toLowerCase();
        if (status === "cancelled") {
          showToast("This session is already cancelled.", "error");
          return false;
        }

        // 24h rule
        const msUntil =
          (typeof selectedSession?._startTs === "number" ? selectedSession._startTs : NaN) - Date.now();
        if (!Number.isFinite(msUntil) || msUntil < 24 * 60 * 60 * 1000) {
          showToast("Cancellations must be made at least 24 hours prior to the scheduled session.", "error");
          return false;
        }

        const reason = encodeURIComponent(payload?.reason || "");
        const res = await fetch(`${API}/api/sessions/${id}?reason=${reason}`, {
          method: "DELETE",
          headers: tokenHeaders(),
          credentials: "include",
        });

        if (!res.ok) {
          let msg = "Failed to cancel session.";
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch {}
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

  /* ====================== Render ====================== */
  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />

      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="My Schedule" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <div className="schedule-header">
              <h2>My Schedule</h2>

              {/* Unified Manage menu */}
              <div className="header-actions" ref={manageWrapRef}>
                <button
                  className="manage-btn"
                  aria-haspopup="menu"
                  aria-expanded={showManageMenu || showManageLinks}
                  onClick={() => {
                    if (showManageLinks) {
                      setShowManageLinks(false);
                      setShowManageMenu(false);
                    } else {
                      setShowManageMenu((v) => !v);
                    }
                  }}
                >
                  Manage ▾
                </button>

                <div className={`manage-menu-popover ${showManageMenu ? "show" : ""}`} role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowManageMenu(false);
                      setShowManageAvailability(true);
                    }}
                  >
                    Manage Availability
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowManageMenu(false);
                      setShowManageLinks(true);
                    }}
                  >
                    Manage Meeting Links
                  </button>
                </div>

                {/* Manage Meeting Links (DB-backed) */}
                <div className={`manage-links-menu ${showManageLinks ? "show" : ""}`} role="menu">
                  <div className="manage-menu-head">
                    <div className="manage-menu-title">Manage Meeting Links</div>
                    <input
                      className="manage-search"
                      placeholder="Search subject/section…"
                      value={manageSearch}
                      onChange={(e) => setManageSearch(e.target.value)}
                    />
                  </div>

                  <div className="manage-list" role="group" aria-label="Subjects">
                    {isLoadingCourses && <div className="manage-empty">Loading courses…</div>}
                    {!isLoadingCourses && coursesError && (
                      <div className="manage-empty" style={{ color: "#ef4444" }}>
                        {coursesError}
                      </div>
                    )}
                    {!isLoadingCourses && !coursesError && filteredPairs.length === 0 && (
                      <div className="manage-empty">No matches</div>
                    )}

                    {!isLoadingCourses &&
                      !coursesError &&
                      filteredPairs.map(({ subject, section }) => {
                        const key = `${subject}__${section}`;
                        const hasLink = !!meetingLinks[key];
                        const vars = accentVarsFor(subject, section);

                        return (
                          <button
                            key={key}
                            className="manage-item"
                            style={vars}
                            onClick={() => {
                              setSelectedSession({
                                subject,
                                section,
                                link: meetingLinks[key] || "",
                              });
                              setShowSetLink(true);
                              setShowManageLinks(false);
                            }}
                            role="menuitem"
                            title={hasLink ? "Modify default link" : "Set default link"}
                          >
                            <div className="mi-left">
                              <div className="mi-title">{subject}</div>
                              <div className="mi-sub">
                                <span className="mi-section">{section}</span>
                                <span className={`status-badge ${hasLink ? "linked" : "unset"}`}>
                                  {hasLink ? "Linked" : "Not set"}
                                </span>
                              </div>
                            </div>
                            <span className="mi-cta">Modify</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
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

            {/* List */}
            <div className={`schedule-list ${!anyLoading && list.length === 0 ? "empty" : ""}`} aria-busy={anyLoading}>
              {anyLoading && (
                <>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skel-${i}`} className="schedule-card skeleton-card" aria-hidden="true">
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
                  const pairKey = `${session.subject}__${session.section}`;

                  // live highlight (only during exact start–end window)
                  const live =
                    activeTab === "upcoming" &&
                    Number.isFinite(session._startTs) &&
                    Number.isFinite(session._endTs) &&
                    nowTs >= session._startTs &&
                    nowTs < session._endTs;

                  const program = getProgramFromCode(session.subject, normalizeCourseKey);
                  const yrNum = getYearFromSectionDigit(session.section);
                  const chipLabel = `${yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"} — ${program}`;

                  const recordingUrl = (session.recordingUrl || "").trim();
                  const hasRecordingLink = !!recordingUrl;
                  const isCancelled = (session.status || "").toLowerCase() === "cancelled";

                  return (
                    <div
                      key={`${activeTab}-${session.id}-${startIndex + i}`}
                      className={`schedule-card is-colored ${live ? "is-today" : ""}`}
                      style={vars}
                    >
                      <div className="year-chip" aria-hidden="true">
                        {chipLabel}
                      </div>

                      <div className="schedule-info">
                        <p className="date">
                          {session.date}
                          {(session.status || "").toLowerCase() === "cancelled" && (
                            <span className="status-badge cancelled" title="This session was cancelled">
                              Cancelled
                            </span>
                          )}
                          {(session.status || "").toLowerCase() === "rescheduled" && (
                            <span className="status-badge rescheduled" title="This session was rescheduled">
                              Rescheduled
                            </span>
                          )}
                          {session.isGroup && (
                            <>
                              {" "}
                              <span className="session-type-inline">(Group)</span>
                            </>
                          )}
                        </p>
                        <p className="subject">
                          {session.subject} - {session.section}
                        </p>
                        <p className="mentor">{formatStudentDisplay(session.students, true)}</p>

                        <div className="bottom-row">
                          <div className="topic">Topic: {session.topic}</div>

                          <div className="actions">
                            {activeTab === "upcoming" ? (
                              <>
                                <button
                                  className="join-btn"
                                  onClick={() => {
                                    const url = session.meetLink || meetingLinks[pairKey] || "";
                                    if (!url) {
                                      setSelectedSession({ ...session, link: "" });
                                      setShowSetLink(true);
                                      return;
                                    }

                                    const sourceISO = session.startISO || new Date().toISOString();
                                    const qs = new URLSearchParams({
                                      id: `${normalizeCourseKey(`${session.subject} ${session.section}`)}__${sourceISO}`,
                                      subject: session.subject,
                                      section: session.section,
                                      topic: session.topic || "",
                                      studentName: session.students.join(", "),
                                      dateTimeISO: sourceISO,
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
                                    window.location.assign(ensureHttp(url));
                                  }}
                                >
                                  JOIN NOW
                                </button>

                                {/* Per-card More options — with guardrails */}
                                <div className="ms-more-options" ref={(el) => (menuRefs.current[i] = el)}>
                                  <button
                                    className="ms-more-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuIndex(openMenuIndex === i ? null : i);
                                    }}
                                    aria-haspopup="menu"
                                    aria-expanded={openMenuIndex === i}
                                  >
                                    More Options
                                  </button>
                                  <div className={`ms-menu-dropdown ${openMenuIndex === i ? "show" : ""}`} role="menu">
                                    <button
                                      role="menuitem"
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        if ((session.status || "").toLowerCase() === "rescheduled") {
                                          showToast("Rescheduling can only be done once.", "error");
                                          setOpenMenuIndex(null);
                                          return;
                                        }

                                        const msUntil =
                                          (typeof session._startTs === "number" ? session._startTs : NaN) - Date.now();
                                        if (!Number.isFinite(msUntil) || msUntil < 24 * 60 * 60 * 1000) {
                                          showToast("Rescheduling is allowed up to 24 hours before the session.", "error");
                                          setOpenMenuIndex(null);
                                          return;
                                        }

                                        setSelectedSession(session);
                                        setShowResched(true);
                                        setOpenMenuIndex(null);
                                      }}
                                    >
                                      Reschedule
                                    </button>
                                    <button
                                      role="menuitem"
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        if ((session.status || "").toLowerCase() === "cancelled") {
                                          showToast("This session is already cancelled.", "error");
                                          setOpenMenuIndex(null);
                                          return;
                                        }

                                        const msUntil =
                                          (typeof session._startTs === "number" ? session._startTs : NaN) - Date.now();
                                        if (!Number.isFinite(msUntil) || msUntil < 24 * 60 * 60 * 1000) {
                                          showToast(
                                            "Cancellations must be made at least 24 hours prior to the scheduled session.",
                                            "error"
                                          );
                                          setOpenMenuIndex(null);
                                          return;
                                        }

                                        setSelectedSession(session);
                                        setShowCancel(true);
                                        setOpenMenuIndex(null);
                                      }}
                                    >
                                      Cancel booking
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Past tab actions */}
                                {hasRecordingLink && !isCancelled && (
                                  <button
                                    className="view-recording-btn"
                                    onClick={() => {
                                      const href = ensureHttp(recordingUrl);
                                      if (/^https?:\/\//i.test(href)) {
                                        window.open(href, "_blank", "noopener,noreferrer");
                                      } else {
                                        navigate(href);
                                      }
                                    }}
                                    title="Open recording"
                                  >
                                    VIEW RECORDING
                                  </button>
                                )}

                                {/* Past row more menu — hide entirely if cancelled */}
                                {!isCancelled && (
                                  <div className="ms-more-options" ref={(el) => (menuRefs.current[i] = el)}>
                                    <button
                                      className="ms-more-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuIndex(openMenuIndex === i ? null : i);
                                      }}
                                      aria-haspopup="menu"
                                      aria-expanded={openMenuIndex === i}
                                    >
                                      More Options
                                    </button>
                                    <div className={`ms-menu-dropdown ${openMenuIndex === i ? "show" : ""}`} role="menu">
                                      <button
                                        role="menuitem"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openSetRecordingLinkModal(session);
                                          setOpenMenuIndex(null);
                                        }}
                                        title="Set or modify recording link"
                                      >
                                        {hasRecordingLink ? "Modify recording link" : "Set recording link"}
                                      </button>

                                      {hasRecordingLink && (
                                        <button
                                          role="menuitem"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuIndex(null);
                                            setConfirmDeleteTarget({
                                              sessionId: session.id || session.sessionId,
                                              subject: session.subject,
                                              section: session.section,
                                            });
                                            setShowConfirmDelete(true);
                                          }}
                                          title="Remove recording link"
                                          style={{ color: "#b91c1c" }}
                                        >
                                          Remove recording link
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {!anyLoading && list.length === 0 && <p className="empty-msg">No {activeTab} sessions.</p>}
            </div>

            {/* Bottom info (range + page) */}
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

            {/* Pagination controls */}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Previous
                </button>

                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {[...Array(totalPages)].map((_, i) => {
                    const pageNumber = i + 1;
                    const isCurrentPage = pageNumber === currentPage;
                    const showPage =
                      pageNumber === 1 ||
                      pageNumber === totalPages ||
                      Math.abs(pageNumber - currentPage) <= 1;

                    if (!showPage) {
                      if (pageNumber === 2 && currentPage > 4) {
                        return (
                          <span key={`dots-left-${i}`} style={{ padding: "0.5rem", color: "#9ca3af" }}>
                            ...
                          </span>
                        );
                      }
                      if (pageNumber === totalPages - 1 && currentPage < totalPages - 3) {
                        return (
                          <span key={`dots-right-${i}`} style={{ padding: "0.5rem", color: "#9ca3af" }}>
                            ...
                          </span>
                        );
                      }
                      return null;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setPage(pageNumber)}
                        aria-current={isCurrentPage ? "page" : undefined}
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: isCurrentPage ? "#3b82f6" : "white",
                          color: isCurrentPage ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          minWidth: "40px",
                          transition: "all 0.2s ease",
                        }}
                        title={`Go to page ${pageNumber}`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showResched && (
        <MentorRescheduleSessionModal
          isOpen={showResched}
          onClose={() => setShowResched(false)}
          session={selectedSession}
          viewerRole="mentor"
          showToast={showToast}
          onReschedule={handleReschedule}
          onSuccess={() => fetchSessions()}
        />
      )}

      {showCancel && (
        <MentorCancelBookingModal
          isOpen={showCancel}
          onClose={() => setShowCancel(false)}
          session={selectedSession}
          onConfirm={handleCancel}
        />
      )}

      {showSetLink && (
        <SetMeetingLinkModal
          isOpen={showSetLink}
          onClose={() => setShowSetLink(false)}
          session={selectedSession}
          onSave={handleSaveLink} // handles both save and clear
          showToast={showToast}
        />
      )}

      {/* Set Recording Link modal (server) */}
      {showSetRecordingLink && (
        <SetRecordingLinkModal
          isOpen={showSetRecordingLink}
          onClose={() => setShowSetRecordingLink(false)}
          subject={selectedRecordingTarget?.subject}
          section={selectedRecordingTarget?.section}
          initialLink={selectedRecordingTarget?.link || ""}
          sessionId={selectedRecordingTarget?.sessionId}
          onSave={(sid, link) => {
            handleSaveRecordingLink(sid, (link || "").trim());
            setShowSetRecordingLink(false);
          }}
        />
      )}

      {/* Styled confirm dialog for recording link */}
      {showConfirmDelete && (
        <ConfirmDialog
          title="Remove recording link?"
          description={
            confirmDeleteTarget
              ? `This will remove the recording link for ${confirmDeleteTarget.subject} — ${confirmDeleteTarget.section}. You can add it again later.`
              : ""
          }
          confirmText="Remove"
          cancelText="Cancel"
          tone="danger"
          onConfirm={() => {
            if (confirmDeleteTarget?.sessionId) {
              handleRemoveRecordingLink(confirmDeleteTarget.sessionId);
            }
            setShowConfirmDelete(false);
            setConfirmDeleteTarget(null);
          }}
          onCancel={() => {
            setShowConfirmDelete(false);
            setConfirmDeleteTarget(null);
          }}
        />
      )}

      {showManageAvailability && (
        <MentorAvailabilityCalendar
          subjectSectionPairs={subjectSectionPairs}
          onClose={() => setShowManageAvailability(false)}
        />
      )}

      {/* Portaled toast (matches MySchedule) */}
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

/* ---------- Tiny local modal for recording links (server-backed) ---------- */
function SetRecordingLinkModal({
  isOpen,
  onClose,
  subject,
  section,
  initialLink,
  sessionId, // NEW
  onSave, // (sessionId, link)
}) {
  const [link, setLink] = useState(initialLink || "");
  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave?.(sessionId, ensureHttp(link));
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rec-title"
      onClick={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div className="modal-content">
        <h2 id="rec-title" style={{ marginBottom: "1rem" }}>
          Set Recording Link
        </h2>
        <p style={{ marginTop: 0, marginBottom: "0.5rem", color: "#475569" }}>
          <strong>{subject}</strong> — {section}
        </p>

        <form onSubmit={handleSubmit}>
          <label className="label" htmlFor="rec-link">
            Recording URL
          </label>
          <input
            id="rec-link"
            type="url"
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
          <p className="hint">Paste the shareable link to the session’s recording (Drive, Meet, etc.).</p>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Recording Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conf-title"
      onClick={(e) => {
        if (e.target.classList.contains("modal-overlay")) onCancel?.();
      }}
    >
      <div className="modal-content" role="document">
        <h2 id="conf-title" style={{ margin: 0, marginBottom: "1rem" }}>
          {title}
        </h2>
        {description && (
          <p style={{ marginTop: 0, marginBottom: -5, color: "#475569" }}>
            {description}
          </p>
        )}

        <div className="modal-actions" style={{ gap: 10 }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={{
              backgroundColor: tone === "danger" ? "#ef4444" : undefined,
              borderColor: tone === "danger" ? "#ef4444" : undefined,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}