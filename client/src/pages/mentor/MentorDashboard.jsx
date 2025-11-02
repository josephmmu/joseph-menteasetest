// src/pages/mentor/MentorDashboard.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
// import { Link } from "react-router-dom"; // ⟵ no longer needed
import "../student/StudentDashboard.css"; // reuse styles
import "../student/MySchedule.css"; // NEW: reuse is-today / dimmed-not-live styles
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import ViewStudentsModal from "../../components/ViewStudentsModal";
import SetMeetingLinkModal from "../../components/SetMeetingLinkModal";
import ProgramSelectionModal from "../../components/ProgramSelectionModal";
import { useCourseColor } from "../../context/CourseColorContext";
import { useSystemSettings } from "../../context/SystemSettingsContext";
import { useAuth } from "../../context/AuthContext";

/* ============== API base ============== */
const API = (
  import.meta?.env?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const ENABLE_USER_LOOKUPS =
  (import.meta?.env?.VITE_ENABLE_USER_LOOKUPS ??
    process.env.REACT_APP_ENABLE_USER_LOOKUPS) === "1";

const tokenHeaders = () => {
  const t = localStorage.getItem("token");
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

const looksLikeObjectId = (s) => /^[a-f\d]{24}$/i.test(String(s || ""));

const nameFromUser = (u) => {
  if (!u) return "";
  const firstLast = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return (
    u.name ||
    u.fullName ||
    firstLast ||
    u.displayName ||
    u.username ||
    u.email ||
    ""
  ).trim();
};

/* ===== Helpers for date/time display (AM/PM) ===== */
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

/* NEW: humanize ms for countdown in toast (copied from StudentDashboard) */
const humanizeMs = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || !h) parts.push(`${m}m`);
  return parts.join(" ");
};

export default function MentorDashboard() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);

  // Program selection
  const [showProgramModal, setShowProgramModal] = useState(false);
  const { user, updateUser } = useAuth();

  // Meeting links state
  const [meetingLinks, setMeetingLinks] = useState({});
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSetLink, setShowSetLink] = useState(false);

  // Toast
  const [toast, setToast] = useState({ msg: "", type: "info" });
  const toastLock = useRef(false);
  const toastTimer = useRef(null);

  const { getCourseColor, normalizeCourseKey } = useCourseColor();
  const { academicTerm } = useSystemSettings();

  // NEW: keep “now” fresh for live/today detection
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // ===== Courses for this mentor =====
  const [allCourses, setAllCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState("");

  const pickArray = (json) => {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json?.courses)) return json.courses;
    if (Array.isArray(json?.items)) return json.items;
    if (Array.isArray(json?.results)) return json.results;
    return [];
  };

  const refreshCoursesTimer = useRef(null);

  const fetchCourses = useCallback(async () => {
    setIsLoadingCourses(true);
    setCoursesError("");
    try {
      const headers = tokenHeaders();

      const uid = (user?._id || user?.id || "").toString();
      const termQS =
        academicTerm?.schoolYear && academicTerm?.term
          ? `year=${encodeURIComponent(
              academicTerm.schoolYear
            )}&term=${encodeURIComponent(academicTerm.term)}`
          : "";
      const appendQS = (url) =>
        termQS
          ? url.includes("?")
            ? `${url}&${termQS}`
            : `${url}?${termQS}`
          : url;

      const endpoints = [
        appendQS(`${API}/api/courses/mine`),
        appendQS(`${API}/api/courses?mine=1`),
        uid
          ? appendQS(`${API}/api/courses?mentorId=${encodeURIComponent(uid)}`)
          : null,
        `${API}/api/courses`,
      ].filter(Boolean);

      let found = null;
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { headers, credentials: "include" });
          if (!res.ok) continue;
          const data = await res.json();
          const arr = pickArray(data);
          if (arr) {
            found = arr;
            break;
          }
        } catch {}
      }
      setAllCourses(found || []);
    } catch (e) {
      console.error("Failed to fetch courses:", e);
      setCoursesError("Failed to load assigned courses.");
    } finally {
      setIsLoadingCourses(false);
    }
  }, [API, academicTerm, user]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Who am I
  const meId = toIdString(user?._id || user?.id);
  const meName = String(user?.name || "")
    .toLowerCase()
    .trim();
  const meEmail = String(user?.email || "")
    .toLowerCase()
    .trim();

  const isMine = (course) => {
    if (!course) return false;
    let mentorId =
      course.mentor?._id ??
      course.mentorId ??
      course.mentor ??
      course.assignedMentorId ??
      null;

    const mentorIdStr = toIdString(mentorId);

    const mentorName = String(
      course.assignedMentor ||
        course.mentorName ||
        (typeof course.mentor === "string" ? course.mentor : "") ||
        ""
    )
      .toLowerCase()
      .trim();

    const mentorEmail = String(course.mentorEmail || "")
      .toLowerCase()
      .trim();

    return (
      (!!meId && !!mentorIdStr && mentorIdStr === meId) ||
      (!!meName && !!mentorName && mentorName === meName) ||
      (!!meEmail && !!mentorEmail && mentorEmail === meEmail)
    );
  };

  const mySubjectsData = useMemo(() => {
    const mine = (allCourses || []).filter(isMine);

    const inActiveTerm = (c) => {
      if (!academicTerm) return true;
      const termVal = c.term ?? c.raw?.term;
      const sy = c.schoolYear ?? c.raw?.schoolYear;
      if (
        termVal &&
        academicTerm.term &&
        Number(termVal) !== Number(academicTerm.term)
      )
        return false;
      if (
        sy &&
        academicTerm.schoolYear &&
        String(sy) !== String(academicTerm.schoolYear)
      )
        return false;
      return true;
    };

    return mine.filter(inActiveTerm).map((c) => {
      const subject = `${c.courseCode || ""} ${c.courseName || ""}`.trim();
      const studentCount =
        (Array.isArray(c.students) && c.students.length) ||
        (Array.isArray(c.enrolledStudents) && c.enrolledStudents.length) ||
        (Array.isArray(c.enrolled) && c.enrolled.length) ||
        c.studentCount ||
        0;

      return {
        subject,
        section: c.section || "",
        studentCount,
        raw: c,
      };
    });
  }, [allCourses, meId, meName, meEmail, academicTerm]);

  // Program modal
  useEffect(() => {
    if (
      user &&
      (!user.program || user.program === "" || user.program === null)
    ) {
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

  // Resize handling
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const isMobile = windowWidth <= 1152;

  // Toast helper — allow custom duration like StudentDashboard
  const showToast = (msg, type = "info", stayMs = 3000) => {
    if (toastLock.current) return;
    toastLock.current = true;
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast({ msg: "", type: "info" });
      toastLock.current = false;
      toastTimer.current = null;
    }, stayMs);
  };

  // Hydrate meetingLinks
  useEffect(() => {
    try {
      const raw = localStorage.getItem("meetingLinks");
      if (raw) setMeetingLinks(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to read meetingLinks", e);
    }
  }, []);

  const handleSaveLink = (subject, section, link) => {
    const key = `${subject}__${section}`;
    setMeetingLinks((prev) => {
      const next = { ...prev, [key]: link };
      try {
        localStorage.setItem("meetingLinks", JSON.stringify(next));
      } catch (e) {
        console.warn("Failed to save meetingLinks", e);
      }
      return next;
    });
  };

  const requestRefreshCourses = useCallback(() => {
    if (refreshCoursesTimer.current) clearTimeout(refreshCoursesTimer.current);
    refreshCoursesTimer.current = setTimeout(() => {
      fetchCourses();
      refreshCoursesTimer.current = null;
    }, 300);
  }, [fetchCourses]);

  useEffect(() => {
    return () => {
      if (refreshCoursesTimer.current)
        clearTimeout(refreshCoursesTimer.current);
    };
  }, []);

  // Helpers
  const parseDateTime = (str = "") => {
    try {
      const cleaned = String(str).replace(" - ", " ");
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const cardVars = (subject) => {
    const base = getCourseColor(normalizeCourseKey(subject || ""));
    return {
      borderTop: `4px solid ${base}`,
      "--accent": base,
      "--accentHover": base,
      "--accentRing": "rgba(0,0,0,0.08)",
    };
  };

  /* Display students per session:
     - 0 => "—"
     - 1 => "John Smith"
     - 3 => "John Smith, 2+"
  */
  const formatStudentDisplay = (students) => {
    const arr = Array.isArray(students)
      ? students
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const uniq = Array.from(new Set(arr));
    if (uniq.length === 0) return "—";
    if (uniq.length === 1) return uniq[0];
    return `${uniq[0]}, ${uniq.length - 1}+`;
  };

  /* =========================
     LIVE upcoming sessions
     ========================= */
  const [rawSessions, setRawSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionsError("");
    try {
      const tryUrls = [
        `${API}/api/sessions/mine?as=mentor`,
        `${API}/api/sessions/mine`,
      ];

      let data = [];
      let ok = false;
      for (const url of tryUrls) {
        try {
          const res = await fetch(url, {
            headers: tokenHeaders(),
            credentials: "include",
          });
          if (!res.ok) continue;
          const j = await res.json();
          if (Array.isArray(j)) {
            data = j;
            ok = true;
            break;
          }
        } catch {}
      }

      if (!ok) {
        setSessionsError("Failed to load sessions.");
        setRawSessions([]);
      } else {
        setRawSessions(data);
      }
    } catch (e) {
      console.error("Error fetching sessions:", e);
      setSessionsError("An error occurred while loading sessions.");
      setRawSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [API]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // light polling
  useEffect(() => {
    const id = setInterval(fetchSessions, 30000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  // Lookup for courses
  const courseById = useMemo(() => {
    const m = new Map();
    (allCourses || []).forEach((c) => {
      m.set(toIdString(c._id || c.id), c);
    });
    return m;
  }, [allCourses]);

  /* Resolve student names robustly; avoid showing "1 student" */
  const [studentNameMap, setStudentNameMap] = useState({});
  const upsertNames = useCallback((pairs) => {
    if (!pairs || !pairs.length) return;
    setStudentNameMap((prev) => {
      const next = { ...prev };
      for (const [key, val] of pairs) {
        if (key && val && !next[key]) next[key] = val;
      }
      return next;
    });
  }, []);

  const fetchUsersBulk = useCallback(
    async (ids) => {
      if (!ENABLE_USER_LOOKUPS || !ids || !ids.length) return false;
      try {
        const res = await fetch(`${API}/api/users/names`, {
          method: "POST",
          headers: tokenHeaders(),
          credentials: "include",
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return false;
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          const pairs = list.map((u) => [
            toIdString(u._id || u.id),
            nameFromUser(u),
          ]);
          upsertNames(pairs);
          return true;
        }
      } catch {}
      return false;
    },
    [API, upsertNames]
  );

  useEffect(() => {
    const ids = new Set();

    (rawSessions || []).forEach((s) => {
      if (s.createdBy && looksLikeObjectId(s.createdBy))
        ids.add(toIdString(s.createdBy));
      const maybeArrs = [
        s.studentIds,
        s.memberIds,
        s.members,
        s.participants,
        s.students,
      ];
      maybeArrs.forEach((arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((x) => {
          if (looksLikeObjectId(x)) ids.add(toIdString(x));
          if (x && typeof x === "object" && (x._id || x.id)) {
            ids.add(toIdString(x._id || x.id));
          }
        });
      });
    });

    const unknown = Array.from(ids).filter((id) => !studentNameMap[id]);
    if (unknown.length) {
      fetchUsersBulk(unknown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSessions]);

  const namesFromSession = (s) => {
    if (Array.isArray(s.students) && s.students.length) return s.students;
    if (Array.isArray(s.studentNames) && s.studentNames.length)
      return s.studentNames;

    const list = [];

    const pushName = (v) => {
      if (!v) return;
      if (typeof v === "string") {
        if (looksLikeObjectId(v)) {
          if (studentNameMap[v]) list.push(studentNameMap[v]);
        } else {
          list.push(v);
        }
      } else if (typeof v === "object") {
        const id = toIdString(v._id || v.id);
        const resolved = (id && studentNameMap[id]) || nameFromUser(v);
        if (resolved) list.push(resolved);
      }
    };

    [
      s.participants,
      s.memberIds,
      s.members,
      s.studentIds,
      s.group,
      s.groupMembers,
    ].forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach(pushName);
    });

    if (!list.length && s.createdBy) {
      if (looksLikeObjectId(s.createdBy)) {
        const n = studentNameMap[s.createdBy];
        if (n) list.push(n);
      } else if (typeof s.createdBy === "object") {
        const n = nameFromUser(s.createdBy);
        if (n) list.push(n);
      } else if (typeof s.createdBy === "string") {
        list.push(s.createdBy);
      }
    }

    return list.filter(Boolean).map(String);
  };

  const upcomingSessions = useMemo(() => {
    // Recompute whenever the clock ticks so items move from “upcoming” -> “live”
    const now = nowTs;

    return (rawSessions || [])
      .map((s) => {
        const courseId =
          toIdString(s.offeringID) ||
          toIdString(s.offeringId) ||
          toIdString(s.courseInstanceId) ||
          toIdString(s.courseId) ||
          toIdString(s.courseID) ||
          "";

        const course = courseById.get(courseId);

        const subject = course
          ? `${course.courseCode || ""} ${course.courseName || ""}`.trim()
          : "Course";
        const section = course?.section || "";

        const startISO = s.scheduleStart || s.startISO;
        const endISO   = s.scheduleEnd   || s.endISO;

        const startTs = startISO ? new Date(startISO).getTime() : NaN;
        const endTs = endISO
          ? new Date(endISO).getTime()
          : (Number.isFinite(startTs) ? startTs + 30 * 60 * 1000 : NaN); // 30-min fallback

        const meet =
          s.meetLink ||
          meetingLinks[`${subject}__${section}`] ||
          course?.defaultMeetLink ||
          "";

        const students = namesFromSession(s);

        return {
          id: s.sessionId || s._id || `${courseId}-${startISO}`,
          subject,
          section,
          startISO,
          endISO,
          startTs,
          endTs,
          meetLink: meet,
          status: s.status || "pending",
          students,
          topic: s.topic || "—",
        };
      })
      // Keep anything that hasn’t ended yet (so LIVE sessions remain visible)
      .filter(
        (x) =>
          Number.isFinite(x.startTs) &&
          Number.isFinite(x.endTs) &&
          x.status !== "cancelled" &&
          x.endTs > now
      )
      .sort((a, b) => a.startTs - b.startTs)
      .slice(0, 5);
    // IMPORTANT: depend on nowTs so the list “ticks”
  }, [rawSessions, courseById, meetingLinks, studentNameMap, nowTs]);

  const onJoinSession = (session) => {
    const key = `${session.subject}__${session.section}`;
    const url = session.meetLink || meetingLinks[key] || "";
    if (!url) {
      setSelectedSession({ ...session, link: "" });
      setShowSetLink(true);
      return;
    }
    const parsed = parseDateTime(session.startISO);
    const safeISO = (parsed ? parsed : new Date()).toISOString();

    const qs = new URLSearchParams({
      id: `${normalizeCourseKey(
        `${session.subject} ${session.section}`
      )}__${safeISO}`,
      subject: session.subject,
      section: session.section,
      topic: session.topic || "",
      student: (session.students || []).join(", "),
      dateTimeISO: safeISO,
    }).toString();

    const notesWin = window.open(
      `/session-notes-popup?${qs}`,
      "MentEaseNotes",
      "width=560,height=640,left=100,top=100"
    );
    if (!notesWin) {
      showToast(
        "Please allow pop-ups to open the Session Notes window.",
        "error"
      );
      return;
    }
    window.location.assign(url);
  };

  /* =========================
     RECENT Session Notes (DB-backed)
     ========================= */
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");
  const [recentNotes, setRecentNotes] = useState([]);

  const pick = (...cands) => {
    for (const c of cands) {
      if (c === null || c === undefined) continue;
      const s = String(c).trim();
      if (s) return s;
    }
    return "";
  };

  const extractStudentsFromRaw = (rs) => {
    const arr =
      rs?.participants ||
      rs?.members ||
      rs?.attendees ||
      rs?.students ||
      [];
    if (!Array.isArray(arr)) return [];
    const names = arr
      .map((p) => {
        const u = p?.user || p;
        return (
          u?.name ||
          u?.fullName ||
          [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
          u?.displayName ||
          u?.username ||
          u?.email ||
          ""
        );
      })
      .filter(Boolean);
    return Array.from(new Set(names));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setNotesLoading(true);
      setNotesError("");
      try {
        const res = await fetch(`${API}/api/session-notes/mine`, {
          headers: tokenHeaders(),
          credentials: "include",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`${res.status}: ${txt || "Failed to load notes"}`);
        }
        const data = await res.json();
        const list =
          Array.isArray(data?.notes) ? data.notes : Array.isArray(data) ? data : [];

        const normalized = (list || []).map((n, idx) => {
          const rs = n.rawSession || {};
          const subject = pick(
            n.subject,
            n.subjectText,
            rs.subject?.code && rs.subject?.name
              ? `${rs.subject.code} ${rs.subject.name}`
              : null,
            rs.courseCode && rs.courseName
              ? `${rs.courseCode} ${rs.courseName}`
              : null,
            rs.courseCode,
            rs.courseName
          ) || "Course";

          const section = pick(
            n.section,
            n.sectionText,
            rs.section?.name,
            rs.section?.code,
            rs.sectionName,
            rs.sectionCode,
            rs.block,
            rs.section
          );

          const topic = pick(n.topic, rs.topic) || "—";

          const startISO = pick(
            rs.scheduleStart,
            n.dateTimeISO,
            rs.startISO,
            rs.startDateTime
          );
          const endISO = pick(rs.scheduleEnd, n.endISO, rs.endISO);

          const sessionId = toIdString(
            n.session ||
              n.sessionId ||
              rs._id ||
              rs.id ||
              rs.sessionId ||
              rs.sessionID ||
              rs.meetingId ||
              rs.meetingID
          );

          const students =
            Array.isArray(n.students) && n.students.length
              ? n.students
              : extractStudentsFromRaw(rs);

          const id = toIdString(n._id || n.id) || `${subject}-${section}-${startISO || idx}`;
          return {
            id,
            sessionId,
            subject,
            section,
            topic,
            startISO,
            endISO,
            dateTimeLabel: formatWhenRange(startISO, endISO),
            students,
            _ts: startISO ? new Date(startISO).getTime() : NaN,
          };
        });

        const topFive = normalized
          .sort((a, b) => (isNaN(b._ts) ? -1 : b._ts) - (isNaN(a._ts) ? -1 : a._ts))
          .slice(0, 5);

        if (alive) setRecentNotes(topFive);
      } catch (e) {
        console.error(e);
        if (alive) setNotesError(String(e.message || e));
      } finally {
        if (alive) setNotesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [API]);

  const openFloatingNote = (note) => {
    const startRaw = note.startISO || note.dateTimeISO || new Date().toISOString();
    const start = new Date(startRaw);
    const safeISO = isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString();

    const clientKey = `${normalizeCourseKey(
      `${note.subject || "Course"} ${note.section || ""}`.trim()
    )}__${safeISO}`;

    const qs = new URLSearchParams({
      clientKey,
      noteId: note.id || "",
      subject: note.subject || "",
      section: note.section || "",
      topic: note.topic || "",
      student: Array.isArray(note.students) ? note.students.join(", ") : "",
      dateTimeISO: safeISO,
      startISO: safeISO,
      endISO: note.endISO || "",
      hideBack: "1",
    });

    const win = window.open(
      `/session-notes-popup?${qs.toString()}`,
      "MentEaseNotes",
      "width=560,height=640,left=100,top=100"
    );
    if (win) {
      try {
        win.focus();
      } catch {}
    }
  };

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />

      {toast.msg && (
        <div
          className={`toast ${toast.type}`}
          role="status"
          aria-live="polite"
          style={{ position: "fixed", zIndex: 3000 }}
        >
          {toast.msg}
        </div>
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <h2>My Subjects</h2>
            </div>

            {isLoadingCourses ? (
              <div className="card-grid mysubjects-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    className="card skeleton-card"
                    key={`skeleton-${i}`}
                    aria-hidden="true"
                  >
                    <div className="skeleton-line title" />
                    <div className="skeleton-chip" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : coursesError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>
                {coursesError}
              </p>
            ) : mySubjectsData.length === 0 ? (
              <p className="empty-msg">No assigned courses yet.</p>
            ) : (
              <div className="card-grid mysubjects-grid">
                {mySubjectsData.map((item, i) => {
                  const subjectKey = `${item.subject} ${item.section}`;
                  return (
                    <div
                      className="card is-colored"
                      key={i}
                      style={cardVars(subjectKey)}
                    >
                      <p className="subject-title">
                        {item.subject} {item.section ? `- ${item.section}` : ""}
                      </p>
                      <p className="mentor-name">
                        {item.studentCount}{" "}
                        {item.studentCount === 1 ? "Student" : "Students"}
                      </p>
                      <button
                        className="action-btn"
                        onClick={() => {
                          setSelectedSubject(item);
                          setShowStudentsModal(true);
                        }}
                      >
                        VIEW STUDENTS
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Sessions */}
          <div className="section sessions-section">
            <h2>Upcoming Sessions</h2>

            {isLoadingSessions ? (
              <div className="card-grid sessions-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    className="card skeleton-card"
                    key={`sess-skel-${i}`}
                    aria-hidden="true"
                  >
                    <div className="skeleton-line title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : sessionsError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>
                {sessionsError}
              </p>
            ) : upcomingSessions.length === 0 ? (
              <p className="empty-msg">No upcoming sessions.</p>
            ) : (
              <div className="card-grid sessions-grid">
                {upcomingSessions.map((s) => {
                  // Detect live & today for styling
                  const startTs = s.startTs;
                  const endTs = s.endISO
                    ? new Date(s.endISO).getTime()
                    : (Number.isFinite(startTs) ? startTs + 30 * 60 * 1000 : NaN);
                  const hasTimes = Number.isFinite(startTs) && Number.isFinite(endTs);
                  const live = hasTimes && nowTs >= startTs && nowTs < endTs;

                  const isToday =
                    Number.isFinite(startTs) &&
                    new Date(startTs).toDateString() ===
                      new Date(nowTs).toDateString();

                  const cardClass = `card upcoming-session is-colored ${
                    (live || isToday) ? "is-today" : "dimmed-not-live"
                  }`;

                  return (
                    <div
                      className={cardClass}
                      key={s.id}
                      style={cardVars(s.subject)}
                    >
                      {/* 1) Date/Time (AM/PM) */}
                      <p className="session-date">
                        {formatWhenRange(s.startISO, s.endISO)}
                      </p>

                      {/* 2) Subject & Section */}
                      <p className="session-subject">
                        {s.subject} {s.section ? `- ${s.section}` : ""}
                      </p>

                      {/* 3) Topic */}
                      <div className="session-topic">
                        <span className="row-label">Topic:</span> {s.topic || "—"}
                      </div>

                      {/* 4) Students (name or "Name, 2+") */}
                      <p className="session-people">
                        {formatStudentDisplay(s.students)}
                      </p>

                      <button
                        className="action-btn join-btn"
                        data-disabled={!live} // gating by live window (like student)
                        onClick={() => {
                          // ===== Toast-based JOIN gating (copied behavior) =====
                          if (!hasTimes) {
                            showToast(
                              "Schedule time is missing. Please contact admin.",
                              "error",
                              4200
                            );
                            return;
                          }
                          if (nowTs < startTs) {
                            showToast(
                              `Not yet — you can join only ${formatWhenRange(s.startISO, s.endISO)} • Starts in ${humanizeMs(startTs - nowTs)}`,
                              "info",
                              4200
                            );
                            return;
                          }
                          if (nowTs >= endTs) {
                            showToast("This session has already ended.", "error", 4200);
                            return;
                          }

                          onJoinSession(s);
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

          {/* Recent Session Notes */}
          <div className="section notes-section">
            <h2>Recent Session Notes</h2>

            {notesLoading ? (
              <div className="card-grid notes-grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    className="card skeleton-card"
                    key={`notes-skel-${i}`}
                    aria-hidden="true"
                  >
                    <div className="skeleton-line title" />
                    <div className="skeleton-line" />
                    <div className="skeleton-line" />
                    <div className="skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : notesError ? (
              <p className="empty-msg" style={{ color: "#ef4444" }}>
                {notesError}
              </p>
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
                      <p className="notes-date">{note.dateTimeLabel}</p>
                      <p className="notes-subject">
                        {note.subject} {note.section ? `- ${note.section}` : ""}
                      </p>
                      <p className="notes-mentor">
                        {formatStudentDisplay(note.students)}
                      </p>

                      <div className="note-preview">
                        <strong>Topic:</strong> {note.topic || "—"}
                      </div>

                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => openFloatingNote(note)}
                      >
                        View Full Notes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <ViewStudentsModal
        isOpen={showStudentsModal}
        onClose={() => {
          setShowStudentsModal(false);
          setSelectedSubject(null);
          requestRefreshCourses();
        }}
        subject={selectedSubject?.subject}
        section={selectedSubject?.section}
        studentCount={selectedSubject?.studentCount}
        courseId={selectedSubject?.raw?._id || selectedSubject?.raw?.id}
        onRosterChanged={requestRefreshCourses}
      />

      {showSetLink && (
        <SetMeetingLinkModal
          isOpen={showSetLink}
          onClose={() => setShowSetLink(false)}
          session={selectedSession}
          onSave={handleSaveLink}
          showToast={showToast}
        />
      )}

      <ProgramSelectionModal
        isOpen={showProgramModal}
        onClose={() => {}} // user must pick a program
        user={user}
        onProgramSelected={handleProgramSelected}
      />
    </div>
  );
}
