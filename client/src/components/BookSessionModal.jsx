// src/components/BookSessionModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./BookSessionModal.css";
import { useAuth } from "../context/AuthContext";

/* =========================
   Config / helpers
   ========================= */
const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");

const STORAGE_KEY = "mentorAvailabilityData";
const STEP = 15;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEBUG_ROSTER = false;
const DEBUG_SUBMIT = false;

const pad = (n) => String(n).padStart(2, "0");
const dateToISO = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoToDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const parseTimeToMinutes = (t) => {
  if (!t) return null;
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  return hh * 60 + mm;
};
const minutesToTime = (m) => {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const fmt12 = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

function loadAvailabilityStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Deterministic default sets (Wed/Fri or Thu/Sat) */
const PRESET_DAY_SETS = [
  ["Wed", "Fri"],
  ["Thu", "Sat"],
];
function hashString(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** DB → UI helpers */
const normalizeTime = (t) => {
  if (!t) return "";
  const [hh, mm] = String(t).split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
/** Accepts values like: "MWF", "TTh", "MTWThF", "Mon/Wed/Fri", "Tue Thu" */
const parseDaysOfWeek = (input) => {
  if (!input) return null;
  let s = String(input).toUpperCase().replace(/\s+|\/|,|-/g, "");
  if (!s) return null;

  // tokenise with “TH”, “SU”, “SA” first so T isn’t eaten
  const tokens = [];
  while (s.length) {
    if (s.startsWith("TH")) { tokens.push("TH"); s = s.slice(2); }
    else if (s.startsWith("SU")) { tokens.push("SU"); s = s.slice(2); }
    else if (s.startsWith("SA")) { tokens.push("SA"); s = s.slice(2); }
    else { tokens.push(s[0]); s = s.slice(1); }
  }

  const map = { M:"Mon", T:"Tue", W:"Wed", TH:"Thu", F:"Fri", SA:"Sat", SU:"Sun" };
  const out = tokens.map((t) => map[t]).filter(Boolean);
  return out.length ? out : null;
};

/** Email validation */
const isValidEmail = (s = "") => {
  if (!s) return false;
  const value = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

/* =========================
   API helpers
   ========================= */
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }
    : { "Content-Type": "application/json", Accept: "application/json" };
};

// === Notifications helper: try common endpoints, succeed on the first that works
async function sendBookingNotification(toUserId, payload) {
  if (!toUserId) return false;

  const opts = (body) => ({
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  const attempts = [
    { url: `${API}/api/notifications`, body: { toUserId, ...payload } },
    { url: `${API}/api/notifications/send`, body: { to: toUserId, ...payload } },
    { url: `${API}/api/users/${toUserId}/notifications`, body: payload },
    { url: `${API}/api/users/${toUserId}/notify`, body: payload },
  ];

  for (const a of attempts) {
    try {
      const res = await fetch(a.url, opts(a.body));
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

const toIdString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    return (
      v._id || v.id || v.$id || v.$oid || (v.toString ? v.toString() : "") || ""
    ).toString();
  }
  return String(v);
};

const courseCodeFromSubject = (s = "") => (s || "").trim().split(/\s+/)[0] || "";

/* ===== Roster helpers ===== */
const toTitle = (s = "") =>
  s
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => (w[0] ? w[0].toUpperCase() : "") + (w.slice(1) || "").toLowerCase())
    .join(" ");

// Be generous about where emails might live
function extractEmail(obj) {
  return (
    obj?.email ||
    obj?.emailAddress ||
    obj?.primaryEmail ||
    obj?.schoolEmail ||
    obj?.mmcEmail ||
    obj?.login?.email ||
    obj?.user?.email ||
    obj?.account?.email ||
    obj?.student?.email ||
    obj?.profile?.email ||
    obj?.student?.account?.email ||
    (Array.isArray(obj?.emails) ? obj.emails.find((e) => e?.primary)?.value : null) ||
    (Array.isArray(obj?.emails) ? obj.emails[0]?.value : null) ||
    ""
  );
}
function extractName(obj) {
  return (
    obj?.name ||
    obj?.fullName ||
    obj?.displayName ||
    obj?.user?.name ||
    obj?.profile?.name ||
    obj?.student?.name ||
    obj?.account?.name ||
    null
  );
}
function normalizeRosterItem(obj) {
  const email = String(extractEmail(obj) || "").trim();
  if (!email) return null;

  const id =
    toIdString(
      obj?._id ||
      obj?.id ||
      obj?.user?._id ||
      obj?.user?.id ||
      obj?.account?._id ||
      obj?.account?.id ||
      obj?.student?._id ||
      obj?.student?.id
    ) || null;

  const name =
    extractName(obj) ||
    toTitle(email.split("@")[0].replace(/\d+/g, "")) ||
    email;
  const section =
    obj?.section ||
    obj?.enrollment?.section ||
    obj?.courseSection ||
    obj?.student?.section ||
    null;
  return { id, email: email.toLowerCase(), name, section };
}

const uniqByEmail = (arr) => {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const e = (x?.email || "").toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(x);
    }
  }
  return out;
};

const tryFetchJson = async (url, method = "GET", body) => {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

// Resolve an array of student IDs into user objects (with emails)
async function resolveStudentIdsToProfiles(ids = []) {
  const cleanIds = [...new Set(ids.map(toIdString).filter(Boolean))];
  if (!cleanIds.length) return [];

  const candidatesBulk = [
    `${API}/api/users?ids=${encodeURIComponent(cleanIds.join(","))}`,
    `${API}/api/students?ids=${encodeURIComponent(cleanIds.join(","))}`,
    `${API}/api/accounts?ids=${encodeURIComponent(cleanIds.join(","))}`,
    { url: `${API}/api/users/bulk`, method: "POST", body: { ids: cleanIds } },
    { url: `${API}/api/students/bulk`, method: "POST", body: { ids: cleanIds } },
    { url: `${API}/api/accounts/bulk`, method: "POST", body: { ids: cleanIds } },
  ];

  for (const c of candidatesBulk) {
    const data = typeof c === "string"
      ? await tryFetchJson(c)
      : await tryFetchJson(c.url, c.method, c.body);
    const arr = Array.isArray(data) ? data : (data?.data || data?.users || data?.students || data?.accounts || []);
    const norm = (arr || []).map(normalizeRosterItem).filter(Boolean);
    if (norm.length) {
      if (DEBUG_ROSTER) console.log("[roster] resolved via bulk:", norm);
      return uniqByEmail(norm);
    }
  }

  const out = [];
  for (const id of cleanIds) {
    const perId = [
      `${API}/api/users/${id}`,
      `${API}/api/students/${id}`,
      `${API}/api/accounts/${id}`,
    ];
    let got = null;
    for (const url of perId) {
      const data = await tryFetchJson(url);
      if (!data) continue;
      if (Array.isArray(data)) {
        for (const entry of data) {
          const norm = normalizeRosterItem(entry);
          if (norm) out.push(norm);
        }
        got = true;
        break;
      } else {
        const norm = normalizeRosterItem(data);
        if (norm) out.push(norm);
        got = true;
        break;
      }
    }
    if (!got && DEBUG_ROSTER) console.warn("[roster] no profile found for id", id);
  }
  return uniqByEmail(out);
}

/** Resolve teammate emails -> user ObjectId strings */
async function resolveEmailsToIds(emails = []) {
  const uniq = [...new Set((emails || []).map((e) => String(e || "").toLowerCase()))];
  const out = new Map();
  if (!uniq.length) return out;

  const bulkCandidates = [
    `${API}/api/users/by-emails?emails=${encodeURIComponent(uniq.join(","))}`,
    `${API}/api/students/by-emails?emails=${encodeURIComponent(uniq.join(","))}`,
    { url: `${API}/api/users/resolve`, method: "POST", body: { emails: uniq } },
    { url: `${API}/api/students/resolve`, method: "POST", body: { emails: uniq } },
  ];

  for (const c of bulkCandidates) {
    const data = typeof c === "string"
      ? await tryFetchJson(c)
      : await tryFetchJson(c.url, c.method, c.body);
    const arr = Array.isArray(data) ? data : (data?.data || data?.users || data?.students || []);
    for (const it of arr || []) {
      const norm = normalizeRosterItem(it);
      if (norm?.email && norm?.id) out.set(norm.email.toLowerCase(), toIdString(norm.id));
    }
    if (out.size === uniq.length) break;
  }

  const missing = uniq.filter((e) => !out.has(e));
  for (const email of missing) {
    const tryUrls = [
      `${API}/api/users/by-email/${encodeURIComponent(email)}`,
      `${API}/api/users/find?email=${encodeURIComponent(email)}`,
      `${API}/api/students/by-email/${encodeURIComponent(email)}`,
      `${API}/api/students/find?email=${encodeURIComponent(email)}`,
    ];
    for (const url of tryUrls) {
      const data = await tryFetchJson(url);
      const norm = Array.isArray(data) ? normalizeRosterItem(data[0]) : normalizeRosterItem(data);
      if (norm?.id) { out.set(email, toIdString(norm.id)); break; }
    }
  }
  return out; // Map<email,id>
}

/* =========================
   FancySelect (styled dropdown)
   ========================= */
function FancySelect({
  name,
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const idxByValue = useMemo(
    () => options.findIndex((o) => String(o.value) === String(value)),
    [options, value]
  );
  const activeId = `${name || "fs"}-opt-${activeIdx}`;

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIdx(idxByValue >= 0 ? idxByValue : (options.length ? 0 : -1));
  };

  const commit = (opt) => {
    if (disabled) return;
    onChange?.(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[activeIdx]) commit(options[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const selected = options[idxByValue];
  const label = selected ? selected.label : "";
  const isPlaceholder = !selected;

  return (
    <div
      ref={wrapRef}
      className={`fselect ${open ? "fselect-open" : ""} ${disabled ? "fselect-disabled" : ""}`}
    >
      <button
        type="button"
        className="fselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${name || "fs"}-menu`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        disabled={disabled}
      >
        <span className={`fselect-value ${isPlaceholder ? "is-placeholder" : ""}`}>
          {label || placeholder}
        </span>
      </button>

      {open && (
        <div
          id={`${name || "fs"}-menu`}
          role="listbox"
          aria-activedescendant={activeIdx >= 0 ? activeId : undefined}
          className="fselect-menu"
          onKeyDown={onKeyDown}
        >
          {options.length === 0 ? (
            <div className="fselect-empty" aria-disabled="true">{placeholder}</div>
          ) : (
            options.map((opt, i) => (
              <div
                id={`${name || "fs"}-opt-${i}`}
                key={opt.value}
                role="option"
                aria-selected={String(opt.value) === String(value)}
                className={`fselect-option ${i === activeIdx ? "active" : ""}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(opt)}
              >
                <span>{opt.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* =========================
   Component
   ========================= */
export default function BookSessionModal({
  isOpen,
  onClose,
  subject = "",
  section = "",
  mentor = "",
  currentUser = {},
  courseId: propCourseId,
  mentorId: propMentorId,
  existingSession = null,
  onCreated,
  onUpdated,
  onDeleted,
}) {
  const { user: authUser } = useAuth();

  const [formData, setFormData] = useState({
    sessionType: "individual",
    date: "",
    time: "",
    duration: "15", // default 15 mins
    topic: "",
  });

  /* Group members */
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState([]); // emails (lowercased)
  const [memberError, setMemberError] = useState("");
  const memberInputRef = useRef(null);

  /* Suggestions */
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  /* UI */
  const [showAllMembers, setShowAllMembers] = useState(false);
  const VISIBLE_CHIPS = 3;

  /* Calendar */
  const [availabilityStore, setAvailabilityStore] = useState({});
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  /* Resolve course + mentor */
  const [courseId, setCourseId] = useState(propCourseId || "");
  const [mentorId, setMentorId] = useState(propMentorId || "");
  const [resolving, setResolving] = useState(false);

  /* Roster from DB */
  const [roster, setRoster] = useState([]); // [{id?,email,name,section?}]
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");

  /* Course schedule from DB (days/start/end) */
  const [courseAllowedDays, setCourseAllowedDays] = useState(null); // array of "Mon"..."Sun"
  const [courseMentoringBlock, setCourseMentoringBlock] = useState(null); // {start,end}

  const resolveIds = async () => {
    if (propCourseId) setCourseId(propCourseId);
    if (propMentorId) setMentorId(propMentorId);
    if (propCourseId && propMentorId) return;

    const code = courseCodeFromSubject(subject);

    const adoptCourse = (c) => {
      if (!c) return false;
      const cid = toIdString(c._id || c.id);
      const mid =
        toIdString(c.mentorId) ||
        toIdString(c.mentor?._id) ||
        toIdString(c.mentor?.id);
      if (cid) setCourseId(cid);
      if (mid) setMentorId(mid);
      return Boolean(cid && mid);
    };

    try {
      const qs1 = new URLSearchParams({
        courseCode: code || "",
        section: section || "",
      }).toString();
      const r1 = await fetch(`${API}/api/courses/lookup?${qs1}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (r1.ok) {
        const d1 = await r1.json();
        if (adoptCourse(Array.isArray(d1) ? d1[0] : d1)) return;
      }
    } catch {}

    try {
      const qs2 = new URLSearchParams({
        code: code || "",
        section: section || "",
      }).toString();
      const r2 = await fetch(`${API}/api/courses/lookup?${qs2}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (r2.ok) {
        const d2 = await r2.json();
        if (adoptCourse(Array.isArray(d2) ? d2[0] : d2)) return;
      }
    } catch {}

    try {
      const r3 = await fetch(`${API}/api/courses/mine`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (r3.ok) {
        const arr = await r3.json();
        const list = Array.isArray(arr) ? arr : arr?.data || [];

        const byExact = list.find(
          (c) =>
            String(c.section || "").trim().toUpperCase() ===
              String(section || "").trim().toUpperCase() &&
            String((c.courseCode || "").trim().toUpperCase()) ===
              String((code || "").trim().toUpperCase())
        );
        if (adoptCourse(byExact)) return;

        const byStarts = list.find(
          (c) =>
            String(c.section || "").trim().toUpperCase() ===
              String(section || "").trim().toUpperCase() &&
            String((c.courseCode || "").trim().toUpperCase()).startsWith(
              String((code || "").trim().toUpperCase())
            )
        );
        if (adoptCourse(byStarts)) return;
      }
    } catch {}
  };

  /* Fetch roster */
  useEffect(() => {
    if (!isOpen) return;
    if (!courseId) return;

    let cancelled = false;

    const loadRoster = async () => {
      if (DEBUG_ROSTER) console.log("[roster] loading for courseId:", courseId, "section:", section);
      setRosterLoading(true);
      setRosterError("");

      const primaryEndpoints = [
        `${API}/api/courses/${courseId}`,
        `${API}/api/courses/${courseId}/students`,
        `${API}/api/courses/${courseId}/roster`,
        `${API}/api/enrollments?courseId=${encodeURIComponent(courseId)}`,
        `${API}/api/courses/roster?courseId=${encodeURIComponent(courseId)}&section=${encodeURIComponent(section || "")}`,
      ];

      let found = [];
      let courseDoc = null;
      let studentIds = [];

      for (const url of primaryEndpoints) {
        const data = await tryFetchJson(url);
        if (!data) continue;

        if (url.endsWith(`/api/courses/${courseId}`) && data && typeof data === "object") {
          courseDoc = data;
        }

        const arr = Array.isArray(data)
          ? data
          : (data?.data || data?.students || data?.roster || data?.enrollments || []);
        const maybeProfiles = (arr || []).map(normalizeRosterItem).filter(Boolean);

        if (maybeProfiles.length) {
          found = maybeProfiles;
          break;
        }

        const rawStudents = Array.isArray(data?.students) ? data.students : null;
        if (rawStudents && rawStudents.length && typeof rawStudents[0] !== "object") {
          studentIds = rawStudents.map(toIdString).filter(Boolean);
        }
      }

      if (!found.length && (!studentIds.length) && Array.isArray(courseDoc?.students)) {
        const raw = courseDoc.students;
        if (raw?.length && typeof raw[0] !== "object") {
          studentIds = raw.map(toIdString).filter(Boolean);
        }
      }

      if (!found.length && studentIds.length) {
        const resolved = await resolveStudentIdsToProfiles(studentIds);
        if (resolved.length) found = resolved;
      }

      if (!found.length) {
        let courseCode = courseDoc?.courseCode;
        if (!courseCode) {
          const doc = await tryFetchJson(`${API}/api/courses/${courseId}`);
          courseCode = doc?.courseCode;
        }
        if (!courseCode) {
          courseCode = courseCodeFromSubject(subject);
        }

        if (courseCode) {
          const mine = await tryFetchJson(`${API}/api/courses/mine`);
          const list = Array.isArray(mine) ? mine : mine?.data || [];
          const sameCode = list.filter(
            (c) =>
              String((c?.courseCode || "")).trim().toUpperCase() ===
              String(courseCode).trim().toUpperCase()
          );

          let merged = [];
          for (const c of sameCode) {
            const cid = toIdString(c._id || c.id);
            if (!cid) continue;

            const doc = await tryFetchJson(`${API}/api/courses/${cid}`);
            const possibleProfiles = Array.isArray(doc)
              ? doc
              : (doc?.data || doc?.students || []);
            const norm = (possibleProfiles || []).map(normalizeRosterItem).filter(Boolean);

            if (norm.length) {
              merged = merged.concat(norm);
              continue;
            }

            const ids = Array.isArray(doc?.students) ? doc.students : [];
            const idList = ids?.length && typeof ids[0] !== "object" ? ids.map(toIdString) : [];
            if (idList.length) {
              const resolved = await resolveStudentIdsToProfiles(idList);
              merged = merged.concat(resolved);
            } else {
              const studs = await tryFetchJson(`${API}/api/courses/${cid}/students`);
              const studsArr = Array.isArray(studs) ? studs : (studs?.data || studs?.students || []);
              const studsNorm = (studsArr || []).map(normalizeRosterItem).filter(Boolean);
              if (studsNorm.length) merged = merged.concat(studsNorm);
            }
          }

          found = uniqByEmail(merged);
        }
      }

      if (!cancelled) {
        setRoster(found);
        if (!found.length) setRosterError("No eligible students found for this course.");
        setRosterLoading(false);
      }
    };

    loadRoster();
    return () => { cancelled = true; };
  }, [isOpen, courseId, section, subject]);

  /* Fetch course schedule (days/start/end) once courseId is known */
  useEffect(() => {
    if (!isOpen || !courseId) return;
    let cancelled = false;

    (async () => {
      const doc = await tryFetchJson(`${API}/api/courses/${courseId}`);
      if (!doc || cancelled) return;

      const daysRaw =
        doc.daysOfWeek ||
        doc.days ||
        doc.schedule?.daysOfWeek ||
        doc.schedule?.days ||
        "";

      const startRaw = doc.startTime || doc.schedule?.startTime || "";
      const endRaw   = doc.endTime   || doc.schedule?.endTime   || "";

      const parsedDays = parseDaysOfWeek(daysRaw);
      const start = normalizeTime(startRaw);
      const end   = normalizeTime(endRaw);

      if (!cancelled) {
        if (parsedDays && parsedDays.length) setCourseAllowedDays(parsedDays);
        if (start && end) setCourseMentoringBlock({ start, end });
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, courseId]);

  useEffect(() => {
    if (!isOpen) return;

    setAvailabilityStore(loadAvailabilityStore());
    setFormData({
      sessionType: "individual",
      date: "",
      time: "",
      duration: "15",
      topic: "",
    });
    setMembers([]);
    setMemberInput("");
    setMemberError("");
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
    setShowAllMembers(false);

    (async () => {
      setResolving(true);
      try { await resolveIds(); } finally { setResolving(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, subject, section, propCourseId, propMentorId]);

  const key = `${subject}__${section}`;
  const entry = availabilityStore[key] || {};

  function defaultMentoringBlockForSection(sec) {
    const s = String(sec || "").trim().toUpperCase();
    if (s.startsWith("A")) return { start: "07:00", end: "08:15" };
    if (s.startsWith("H")) return { start: "13:15", end: "14:30" };
    if (s.startsWith("S")) return { start: "18:15", end: "19:30" };
    return { start: "07:00", end: "08:15" };
  }
  const mentoringBlock =
    courseMentoringBlock ||
    entry.mentoringBlock ||
    defaultMentoringBlockForSection(section?.[0] || section);

  const allowedDaysFromEntry = (function () {
    if (entry.allowedDays && Array.isArray(entry.allowedDays) && entry.allowedDays.length) return entry.allowedDays;
    if (entry.days) {
      const s = String(entry.days).toLowerCase();
      if (s.includes("mwf")) return ["Mon", "Wed", "Fri"];
      if (s.includes("tth")) return ["Tue", "Thu"];
      if (s.includes("wed")) return ["Wed", "Fri"];
      if (s.includes("thu")) return ["Thu", "Sat"];
    }
    return null;
  })();

  const defaultAllowed = useMemo(() => {
    const idx = hashString(key) % PRESET_DAY_SETS.length;
    return PRESET_DAY_SETS[idx];
  }, [key]);

  const allowedDays =
    courseAllowedDays ||
    allowedDaysFromEntry ||
    defaultAllowed;

  const mentorBlocked = entry.blocked || [];

  const daysGrid = useMemo(() => {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const firstDay = m.getDay();
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const rows = [];
    let week = new Array(7).fill(null);
    let day = 1;
    for (let i = 0; i < firstDay; i++) week[i] = null;
    for (let i = firstDay; i < 7; i++)
      week[i] = new Date(m.getFullYear(), m.getMonth(), day++);
    rows.push(week);
    while (day <= daysInMonth) {
      const w = new Array(7).fill(null);
      for (let i = 0; i < 7 && day <= daysInMonth; i++) {
        w[i] = new Date(m.getFullYear(), m.getMonth(), day++);
      }
      rows.push(w);
    }
    return rows;
  }, [viewMonth]);

  const isSixRows = daysGrid.length >= 6;

  const weekdayNameFromISODate = (isoDate) => {
    if (!isoDate) return null;
    const d = isoToDate(isoDate);
    if (!d || isNaN(d.getTime())) return null;
    return WEEKDAY_NAMES[d.getDay()];
  };

  const isWeekdayAllowed = (dateObj) => {
    if (!allowedDays || !Array.isArray(allowedDays) || allowedDays.length === 0) return true;
    const name = WEEKDAY_NAMES[dateObj.getDay()];
    return allowedDays.includes(name);
  };

  const isDateDisabled = (dateObj) => {
    if (!dateObj) return true;
    const ymd = dateToISO(dateObj);
    const todayISO = dateToISO(new Date());
    if (ymd < todayISO) return true;
    if (!isWeekdayAllowed(dateObj)) return true;
    return false;
  };

  const hasBlockedOnDate = (iso) => {
    return (mentorBlocked || []).some((b) => b.date === iso);
  };

  const availableTimes = useMemo(() => {
    if (!formData.date) return [];
    if (allowedDays && Array.isArray(allowedDays)) {
      const w = weekdayNameFromISODate(formData.date);
      if (!w || !allowedDays.includes(w)) return [];
    }
    const startMin = parseTimeToMinutes(mentoringBlock.start);
    const endMin = parseTimeToMinutes(mentoringBlock.end);
    const dur = parseInt(formData.duration, 10) || 30;
    if (startMin === null || endMin === null || startMin >= endMin) return [];



    const blockedForDate = mentorBlocked.filter((b) => b.date === formData.date);

    const slots = [];
    for (let t = startMin; t + dur <= endMin; t += STEP) {
      const slotStart = t;
      const slotEnd = t + dur;
      const isBlocked = blockedForDate.some((b) => {
        const bStart = parseTimeToMinutes(b.start);
        const bEnd = parseTimeToMinutes(b.end);
        if (bStart === null || bEnd === null) return false;
        return slotStart < bEnd && bStart < slotEnd;
      });
      if (!isBlocked) slots.push(minutesToTime(t));
    }
    return slots;
  }, [mentoringBlock, formData.date, formData.duration, mentorBlocked, allowedDays]);

  useEffect(() => {
    if (formData.time && !availableTimes.includes(formData.time)) {
      setFormData((f) => ({ ...f, time: "" }));
    }
  }, [availableTimes]); // eslint-disable-line

  /* Toast */
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const toastRafRef = useRef(0);

  const showToast = (message, type = "success", stayMs = 3000) => {
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
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (toastRafRef.current) cancelAnimationFrame(toastRafRef.current);
    };
  }, []);

  /* ===== Directory-backed teammate logic ===== */
  const currentEmail = useMemo(() => {
    const authEmail = String(
      authUser?.email || authUser?.user?.email || authUser?.account?.email || ""
    ).toLowerCase();
    const propEmail = String(
      currentUser?.email || currentUser?.user?.email || currentUser?.account?.email || ""
    ).toLowerCase();
    return authEmail || propEmail || "";
  }, [authUser, currentUser]);

  // Exclude the current user from classmates
  const rosterEligible = useMemo(
    () => roster.filter((r) => r.email.toLowerCase() !== currentEmail),
    [roster, currentEmail]
  );

  const allowedEmailSet = useMemo(
    () => new Set(rosterEligible.map((r) => r.email.toLowerCase())),
    [rosterEligible]
  );

  const idByEmail = useMemo(() => {
    const m = new Map();
    for (const r of rosterEligible) {
      if (r.email && r.id) m.set(r.email.toLowerCase(), r.id);
    }
    return m;
  }, [rosterEligible]);
  const idForEmail = (email) => idByEmail.get(String(email || "").toLowerCase()) || null;

  const nameForEmail = (email) => {
    const e = String(email || "").toLowerCase();
    return rosterEligible.find((x) => x.email.toLowerCase() === e)?.name || null;
  };

  const recomputeSuggestions = (value) => {
    const q = value.trim().toLowerCase();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      setHighlight(-1);
      return;
    }
    const filtered = rosterEligible
      .filter(({ name, email }) => {
        const already = members.includes(email);
        const hay = `${name} ${email}`.toLowerCase();
        return !already && hay.includes(q);
      })
      .slice(0, 8);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setHighlight(filtered.length ? 0 : -1);
  };

  const handleMemberInputChange = (e) => {
    const v = e.target.value;
    setMemberInput(v);
    setMemberError("");
    recomputeSuggestions(v);
  };

  const commitAddMemberEmail = (emailRaw) => {
    if (!emailRaw) return;
    const email = String(emailRaw).trim().toLowerCase();

    if (!isValidEmail(email)) {
      setMemberError("Please enter a valid email address.");
      memberInputRef.current?.focus();
      return;
    }
    if (email === currentEmail) {
      setMemberError("You can’t add yourself.");
      memberInputRef.current?.focus();
      return;
    }
    if (!allowedEmailSet.has(email)) {
      setMemberError("This student is not enrolled in this course.");
      memberInputRef.current?.focus();
      return;
    }
    if (members.includes(email)) {
      setMemberError("This teammate is already added.");
      memberInputRef.current?.focus();
      return;
    }
    setMembers((prev) => [...prev, email]);
    setMemberInput("");
    setMemberError("");
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlight(-1);
    memberInputRef.current?.focus();
  };

  const addMember = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const value = memberInput.trim().toLowerCase();
    if (!value) {
      setMemberError("Please enter an email.");
      memberInputRef.current?.focus();
      return;
    }
    commitAddMemberEmail(value);
  };

  const onMemberKeyDown = (e) => {
    if (!showSuggestions) {
      if (e.key === "Enter") {
        e.preventDefault();
        addMember();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && suggestions[highlight]) {
        commitAddMemberEmail(suggestions[highlight].email);
      } else {
        addMember();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlight(-1);
    }
  };

  const removeMember = (value) =>
    setMembers((prev) => {
      const next = prev.filter((v) => v !== value.toLowerCase());
      if (next.length <= VISIBLE_CHIPS) setShowAllMembers(false);
      return next;
    });

  // No auto-add when switching to Group. Only clear members when leaving Group.
  useEffect(() => {
    if (formData.sessionType !== "group" && members.length) {
      setMembers([]);
    }
  }, [formData.sessionType, members.length]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((f) => ({ ...f, [name]: value }));
  };

  const onSelectDate = (dateObj) => {
    if (!dateObj) return;
    if (isDateDisabled(dateObj)) return;
    const iso = dateToISO(dateObj);
    setFormData((f) => ({ ...f, date: iso }));
  };

  const viewMonthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayISO2 = dateToISO(new Date());

  const weekdayNameFromISO = (iso) =>
    iso ? WEEKDAY_NAMES[isoToDate(iso)?.getDay()] : null;

  /* =========================
     CRUD calls
     ========================= */
  const [submitting, setSubmitting] = useState(false);

  const buildScheduleRange = () => {
    const startLocal = new Date(`${formData.date}T${formData.time}:00`);
    const dur = parseInt(formData.duration, 10) || 30;
    const endLocal = new Date(startLocal.getTime() + dur * 60 * 1000);
    return { scheduleStart: startLocal.toISOString(), scheduleEnd: endLocal.toISOString() };
  };

  const createSession = async () => {
    setSubmitting(true);
    try {
      if (!courseId || !mentorId) {
        showToast(
          "Could not resolve course/mentor. Please reopen and try again.",
          "error",
          4000
        );
        setSubmitting(false);
        return;
      }

      const isGroup = formData.sessionType === "group" || members.length > 0;

      // Build participant IDs
      let participantIds = isGroup ? members.map(idForEmail).filter(Boolean) : [];
      if (isGroup && participantIds.length !== members.length) {
        const missing = members.filter((e) => !idForEmail(e));
        const resolvedMap = await resolveEmailsToIds(missing);
        participantIds = members
          .map((e) => idForEmail(e) || resolvedMap.get(String(e).toLowerCase()))
          .filter(Boolean);
      }

      if (isGroup && participantIds.length !== members.length) {
        showToast("Couldn’t match some teammates to student accounts. Please pick from suggestions.", "error", 5000);
        setSubmitting(false);
        return;
      }

      const capacity = isGroup ? 1 + members.length : 1;
      const { scheduleStart, scheduleEnd } = buildScheduleRange();

      const body = {
        offeringID: courseId,
        courseId,
        mentorId,
        section: section || "",
        topic: formData.topic || "",
        scheduleStart,
        scheduleEnd,
        isGroup,
        capacity,
        participants: isGroup ? participantIds : [],
        participantEmails: isGroup ? members : [],
      };

      if (DEBUG_SUBMIT) console.log("[createSession] payload", body);

      const res = await fetch(`${API}/api/sessions`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Failed to create session");
      }

      const created = await res.json();
      onCreated?.(created);

      // Notify mentor
      try {
        const scheduleStart2 = created?.scheduleStart || body.scheduleStart;
        const scheduleEnd2   = created?.scheduleEnd   || body.scheduleEnd;

        const localStart = new Date(scheduleStart2);
        const dateStr = localStart.toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
        const timeStr = localStart.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit", hour12:true });

        const studentName =
          (authUser?.name || authUser?.fullName) ||
          ([authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ")) ||
          (currentUser?.name || currentUser?.fullName) ||
          ([currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(" ")) ||
          "Student";

        await sendBookingNotification(mentorId, {
          type: "session",
          title: "New session booked",
          // send common fields so UI can pick them up regardless of backend mapping
          message: `${studentName} booked ${subject} — ${section} for ${dateStr}, ${timeStr}${formData.topic ? ` · Topic: ${formData.topic}` : ""}.`,
          link: "/mentor/schedule",
          // and DB-specific aliases if your notifications table uses these:
          content: `${studentName} booked ${subject} — ${section} for ${dateStr}, ${timeStr}${formData.topic ? ` · Topic: ${formData.topic}` : ""}.`,
          pageRelated: "/mentor/schedule",
          createdAt: new Date().toISOString(),
          meta: {
            subject, section,
            topic: formData.topic || "",
            scheduleStart: scheduleStart2, scheduleEnd: scheduleEnd2,
            isGroup: formData.sessionType === "group",
          },
        });
      } catch (e) {
        console.warn("Notification send failed:", e);
      }

      onClose();
      setTimeout(() => {
        showToast(
          `Session booked for ${subject} — ${section} on ${formData.date} at ${fmt12(
            formData.time
          )}.`,
          "success",
          3000
        );
      }, 0);
    } catch (e) {
      showToast(e.message || "Booking failed", "error", 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const updateSession = async () => {
    if (!existingSession?._id) return;
    setSubmitting(true);
    try {
      const isGroup = formData.sessionType === "group" || members.length > 0;

      let participantIds = isGroup ? members.map(idForEmail).filter(Boolean) : [];
      if (isGroup && participantIds.length !== members.length) {
        const missing = members.filter((e) => !idForEmail(e));
        const resolvedMap = await resolveEmailsToIds(missing);
        participantIds = members
          .map((e) => idForEmail(e) || resolvedMap.get(String(e).toLowerCase()))
          .filter(Boolean);
      }

      if (isGroup && participantIds.length !== members.length) {
        showToast("Couldn’t match some teammates to student accounts. Please pick from suggestions.", "error", 5000);
        setSubmitting(false);
        return;
      }

      const capacity = isGroup ? 1 + members.length : 1;
      const { scheduleStart, scheduleEnd } = buildScheduleRange();

      const body = {
        topic: formData.topic || "",
        scheduleStart,
        scheduleEnd,
        isGroup,
        capacity,
        participants: isGroup ? participantIds : [],
        participantEmails: isGroup ? members : [],
      };

      if (DEBUG_SUBMIT) console.log("[updateSession] payload", body);

      const res = await fetch(`${API}/api/sessions/${existingSession._id}`, {
        method: "PATCH",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Failed to update session");
      }

      const updated = await res.json();
      onUpdated?.(updated);

      onClose();
      setTimeout(() => {
        showToast("Session updated.", "success", 2500);
      }, 0);
    } catch (e) {
      showToast(e.message || "Update failed", "error", 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelSession = async () => {
    if (!existingSession?._id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/sessions/${existingSession._id}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Failed to cancel session");
      }

      onDeleted?.();
      onClose();
      setTimeout(() => {
        showToast("Session cancelled.", "success", 2500);
      }, 0);
    } catch (e) {
      showToast(e.message || "Cancel failed", "error", 4000);
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================
     Submit
     ========================= */
  const handleSubmit = (e) => {
    e.preventDefault();

    const wantsGroup = formData.sessionType === "group";

    if (wantsGroup) {
      if (!courseId) {
        showToast("Course not resolved yet. Please wait a moment.", "error", 4000);
        return;
      }
      if (members.length < 1) {
        showToast("Add at least 1 teammate for a group session.", "error", 4000);
        return;
      }
      const allOk = members.every((m) => allowedEmailSet.has(m));
      if (!allOk) {
        showToast("One or more teammates are not enrolled in this course.", "error", 4500);
        return;
      }
    }

    if (!formData.date) {
      showToast("Pick a date.", "error", 3000);
      return;
    }
    if (allowedDays && Array.isArray(allowedDays)) {
      const w = weekdayNameFromISO(formData.date);
      if (!allowedDays.includes(w)) {
        showToast(
          `Mentoring for this course is only available on: ${allowedDays.join(", ")}`,
          "error",
          5000
        );
        return;
      }
    }
    if (!formData.time) {
      showToast("Select a time.", "error", 3000);
      return;
    }
    if (!availableTimes.includes(formData.time)) {
      showToast("Selected time is unavailable.", "error", 3500);
      return;
    }

    if (existingSession?._id) {
      updateSession();
    } else {
      createSession();
    }
  };

  /* Next allowed date helper */
  const getNextAllowedDateISO = () => {
    const start = formData.date ? isoToDate(formData.date) : new Date();
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 365; i++) {
      const iso = dateToISO(d);
      if (iso >= todayISO2 && (!allowedDays || allowedDays.includes(WEEKDAY_NAMES[d.getDay()]))) {
        return iso;
      }
      d.setDate(d.getDate() + 1);
    }
    return null;
  };
  const nextAllowed = getNextAllowedDateISO();

  useEffect(() => {
    if (showAllMembers && members.length <= VISIBLE_CHIPS) {
      setShowAllMembers(false);
    }
  }, [members.length, showAllMembers]);

  const hasOverflow = members.length > VISIBLE_CHIPS;
  const hiddenCount = hasOverflow ? members.length - VISIBLE_CHIPS : 0;

  return (
    <>
      {isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content booksession-modal" aria-labelledby="booksession-title">
            <div className="booksession-header">
              <h2 id="booksession-title" style={{ margin: 0 }}>
                {subject} — {section}
              </h2>
              <div className="meta">
                Mentor: <strong>{mentor || "—"}</strong>
                {resolving && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                    (resolving…)
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
              <div className="booksession-body">
                {/* LEFT: Calendar */}
                <div className={`calendar-panel ${isSixRows ? "six-rows" : ""}`} aria-hidden={false}>
                  <div className="calendar-controls compact">
                    <button
                      type="button"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                      aria-label="Previous month"
                    >
                      ◀
                    </button>
                    <div className="month-label" aria-live="polite">
                      {viewMonthLabel}
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                      aria-label="Next month"
                    >
                      ▶
                    </button>
                  </div>

                  <table className="mac-calendar compact" role="grid" aria-label="Booking calendar">
                    <thead>
                      <tr>
                        {WEEKDAY_NAMES.map((w) => (
                          <th key={w}>{w.slice(0, 3)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {daysGrid.map((week, i) => (
                        <tr key={i}>
                          {week.map((cell, j) => {
                            if (!cell) return <td key={j} className="empty" aria-hidden="true" />;
                            const iso = dateToISO(cell);
                            const disabled = isDateDisabled(cell);
                            const selected = formData.date === iso;
                            const blocked = hasBlockedOnDate(iso);
                            const isToday = iso === dateToISO(new Date());

                            const classes = ["cal-cell-small"];
                            if (selected) classes.push("selected");
                            if (disabled) classes.push("disabled");
                            if (blocked) classes.push("has-block");
                            if (isToday) classes.push("today");

                            return (
                              <td key={j} className={classes.join(" ")}>
                                <button
                                  type="button"
                                  onClick={() => onSelectDate(cell)}
                                  disabled={disabled}
                                  aria-pressed={selected}
                                  title={
                                    disabled
                                      ? iso < todayISO2
                                        ? "Past date"
                                        : "Not available for mentoring on this weekday"
                                      : blocked
                                      ? "Has blocked sub-range"
                                      : "Select date"
                                  }
                                  className={`cal-day-btn ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                                >
                                  <div className="cal-day-top">
                                    <span className="cal-day-num">{cell.getDate()}</span>
                                    {blocked && <span className="dot-block" aria-hidden="true" />}
                                  </div>
                                  <div className="cal-day-sub">
                                    {isWeekdayAllowed(cell) ? "" : "N/A"}
                                  </div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                 <div
                    className="calendar-footer"
                    style={{ borderTop: "1px solid #e5e7eb", marginTop: 8, paddingTop: 8 }}
                  >
                    <div className="allowed-text">
                      {allowedDays ? `Allowed: ${allowedDays.join(", ")}` : "Allowed: all weekdays"}
                    </div>
                    <div className="selected-text">
                      {formData.date
                        ? `Selected: ${formData.date}`
                        : nextAllowed
                        ? `Next allowed: ${nextAllowed}`
                        : ""}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Controls */}
                <div className="form-panel">
                  <h3 className="form-title">Book Session</h3>

                  {/* 1) Session Type */}
                  <div className="row field-row gap-after-type">
                    <label className="label">Session Type</label>
                    <div className="control">
                      <div className="segmented" role="tablist" aria-label="Session Type">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={formData.sessionType === "individual"}
                          className={formData.sessionType === "individual" ? "seg active" : "seg"}
                          onClick={() => setFormData((f) => ({ ...f, sessionType: "individual" }))}
                        >
                          Individual
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={formData.sessionType === "group"}
                          className={formData.sessionType === "group" ? "seg active" : "seg"}
                          onClick={() => setFormData((f) => ({ ...f, sessionType: "group" }))}
                        >
                          Group
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2) Group Members (only when group) */}
                  {formData.sessionType === "group" && (
                    <div className="group-block">
                      <label className="label">Teammates</label>

                      <div className="member-input-row" style={{ position: "relative", gridTemplateColumns: "1fr" }}>
                        <input
                          ref={memberInputRef}
                          type="text"
                          value={memberInput}
                          onChange={handleMemberInputChange}
                          onKeyDown={onMemberKeyDown}
                          placeholder={
                            !courseId
                              ? "Resolving course…"
                              : rosterLoading
                              ? "Loading eligible students…"
                              : rosterError
                              ? "No eligible students found"
                              : rosterEligible.length
                              ? "Type name or email…"
                              : "No classmates available"
                          }
                          aria-label="Teammate email"
                          aria-invalid={!!memberError}
                          autoComplete="off"
                          disabled={!courseId || rosterLoading || !!rosterError || rosterEligible.length === 0}
                        />

                        {showSuggestions && suggestions.length > 0 && (
                          <div className="suggestions" role="listbox" style={{ maxHeight: 220, overflowY: "auto", right: 0 }}>
                            {suggestions.map(({ name, email }, idx) => (
                              <div
                                key={email}
                                role="option"
                                tabIndex={0}
                                className={`suggestion-item${idx === highlight ? " active" : ""}`}
                                onMouseEnter={() => setHighlight(idx)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => commitAddMemberEmail(email)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitAddMemberEmail(email);
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{name}</div>
                                <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 4 }}>
                                  {email}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {memberError && (
                        <div className="error-text" role="alert" style={{ marginTop: 6 }}>
                          {memberError}
                        </div>
                      )}

                      <small className="subtext" style={{ marginTop: 6 }}>
                        Only students enrolled in this course can be added.
                      </small>

                      {members.length > 0 && (
                        <div
                          aria-live="polite"
                          style={{
                            marginTop: 6,
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            maxHeight: showAllMembers ? 140 : "none",
                            overflowY: showAllMembers ? "auto" : "visible",
                            paddingRight: showAllMembers ? 4 : 0,
                            borderRadius: 8,
                          }}
                        >
                          {(showAllMembers ? members : members.slice(0, VISIBLE_CHIPS)).map((m) => (
                            <span
                              key={m}
                              className="chip"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 10px",
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                borderRadius: 999,
                                fontSize: "0.85rem",
                                fontWeight: 600,
                                color: "#1e3a8a",
                              }}
                            >
                              <span className="chip-label" title={nameForEmail(m) || m}>
                                {nameForEmail(m) || m}
                              </span>
                              <button
                                type="button"
                                className="chip-x"
                                onClick={() => removeMember(m)}
                                aria-label={`Remove ${m}`}
                                style={{
                                  border: 0,
                                  background: "transparent",
                                  cursor: "pointer",
                                  fontWeight: 900,
                                  lineHeight: 1,
                                }}
                              >
                                ×
                              </button>
                            </span>
                          ))}

                          {members.length > VISIBLE_CHIPS && !showAllMembers && (
                            <button
                              type="button"
                              className="chip chip-action"
                              onClick={(e) => {
                                setShowAllMembers(true);
                                e.currentTarget.blur();
                              }}
                              aria-expanded={showAllMembers}
                              title={`Show ${hiddenCount} more`}
                              style={{
                                padding: "6px 10px",
                                background: "#f8fafc",
                                border: "1px dashed #cbd5e1",
                                borderRadius: 999,
                                fontSize: "0.85rem",
                                cursor: "pointer",
                              }}
                            >
                              +{hiddenCount} more
                            </button>
                          )}

                          {members.length > VISIBLE_CHIPS && showAllMembers && (
                            <button
                              type="button"
                              className="chip chip-action"
                              onClick={(e) => {
                                setShowAllMembers(false);
                                e.currentTarget.blur();
                              }}
                              aria-expanded={showAllMembers}
                              title="Collapse"
                              style={{
                                padding: "6px 10px",
                                background: "#f8fafc",
                                border: "1px dashed #cbd5e1",
                                borderRadius: 999,
                                fontSize: "0.85rem",
                                cursor: "pointer",
                              }}
                            >
                              Collapse
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3) Duration (FancySelect) */}
                  <div className="row field-row">
                    <label className="label">Duration</label>
                    <div className="control">
                      <FancySelect
                        name="duration"
                        value={formData.duration}
                        onChange={(v) => setFormData((f) => ({ ...f, duration: String(v) }))}
                        options={[
                          { value: "15", label: "15 mins" },
                          { value: "30", label: "30 mins" },
                        ]}
                        disabled={resolving || submitting}
                      />
                    </div>
                    <small className="subtext">Max 30 mins per student.</small>
                  </div>

                  {/* 4) Time (FancySelect) */}
                  <div className="row field-row">
                    <label className="label">Time</label>
                    <div className="control">
                      <FancySelect
                        name="time"
                        value={formData.time}
                        onChange={(v) => setFormData((f) => ({ ...f, time: String(v) }))}
                        placeholder={
                          !formData.date
                            ? "Pick a date first"
                            : (Array.isArray(allowedDays) &&
                               !allowedDays.includes(weekdayNameFromISODate(formData.date)))
                              ? "Mentoring not available on this date"
                              : availableTimes.length === 0
                                ? "No available slots"
                                : "Select time"
                        }
                        options={
                          formData.date &&
                          (!Array.isArray(allowedDays) ||
                            allowedDays.includes(weekdayNameFromISODate(formData.date)))
                            ? availableTimes.map((t) => {
                                const dur = parseInt(formData.duration, 10) || 30;
                                const end = minutesToTime(parseTimeToMinutes(t) + dur);
                                return { value: t, label: `${fmt12(t)} — ${fmt12(end)}` };
                              })
                            : []
                        }
                        disabled={resolving || submitting}
                      />
                    </div>

                    <div className="subtexts">
                      <small className="subtext">
                        Mentoring block: {fmt12(mentoringBlock.start)} — {fmt12(mentoringBlock.end)}
                      </small>
                    </div>
                  </div>

                  {/* 5) Topic */}
                  <div className="row full field-row">
                    <label className="label">Topic</label>
                    <div className="control">
                      <input
                        type="text"
                        name="topic"
                        value={formData.topic}
                        onChange={handleChange}
                        placeholder="e.g., Week 4 assignment and project feedback"
                        required
                        disabled={resolving || submitting}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="modal-actions" style={{ marginTop: 16 }}>
                    {existingSession?._id && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={cancelSession}
                        disabled={submitting}
                        title="Cancel this session"
                      >
                        Cancel Session
                      </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={onClose} className="btn btn-ghost" disabled={submitting}>
                      Close
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting || resolving}>
                      {submitting ? "Saving…" : "Confirm Booking"}
                    </button>
                  </div>

                  {!resolving && (!courseId || !mentorId) && isOpen && (
                    <div className="subtext" style={{ marginTop: 8, color: "#ef4444" }}>
                      Note: Course/Mentor ID not resolved yet. Booking will fail until resolved.
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast (portaled) */}
      {toast &&
        createPortal(
          <div key={toast.id} className={`toast ${toast.type}`} role="status" aria-live="polite" aria-atomic="true">
            {toast.message}
          </div>,
          document.body
        )}
    </>
  );
}