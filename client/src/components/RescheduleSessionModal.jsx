// components/RescheduleSessionModal.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import "./RescheduleSessionModal.css";

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
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

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

/* === robust helpers === */
const toLocalYMDHM = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}` };
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

/** API helpers */
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      }
    : { "Content-Type": "application/json", Accept: "application/json" };
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
/** Accepts "MWF", "TTh", "Mon/Wed/Fri", etc -> ["Mon","Wed","Fri"] */
const parseDaysOfWeek = (input) => {
  if (!input) return null;
  let s = String(input).toUpperCase().replace(/\s+|\/|,|-/g, "");
  if (!s) return null;
  const tokens = [];
  while (s.length) {
    if (s.startsWith("TH")) {
      tokens.push("TH");
      s = s.slice(2);
    } else if (s.startsWith("SU")) {
      tokens.push("SU");
      s = s.slice(2);
    } else if (s.startsWith("SA")) {
      tokens.push("SA");
      s = s.slice(2);
    } else {
      tokens.push(s[0]);
      s = s.slice(1);
    }
  }
  const map = {
    M: "Mon",
    T: "Tue",
    W: "Wed",
    TH: "Thu",
    F: "Fri",
    SA: "Sat",
    SU: "Sun",
  };
  const out = tokens.map((t) => map[t]).filter(Boolean);
  return out.length ? out : null;
};
const normalizeTime = (t) => {
  if (!t) return "";
  const [hh, mm] = String(t).split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const courseCodeFromSubject = (s = "") =>
  (s || "").trim().split(/\s+/)[0] || "";

/* Build ISO datetimes from selected date/time + duration */
const buildStartEndISO = (dateYMD, timeHM, durationMins) => {
  if (!dateYMD || !timeHM) return { startISO: "", endISO: "" };
  const [Y, M, D] = dateYMD.split("-").map(Number);
  const [h, m] = timeHM.split(":").map(Number);
  const start = new Date(Y, (M || 1) - 1, D, h, m, 0, 0); // local time
  const end = new Date(start.getTime() + (Number(durationMins) || 30) * 60000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

/** Is selected start at least 24 hours from now? */
const isStartAtLeast24hFromNow = (dateYMD, timeHM) => {
  if (!dateYMD || !timeHM) return false;
  const [Y, M, D] = dateYMD.split("-").map(Number);
  const [h, m] = timeHM.split(":").map(Number);
  const start = new Date(Y, (M || 1) - 1, D, h, m, 0, 0);
  if (isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() >= MIN_LEAD_MS;
};

/* === Overlap helpers (own sessions) ===================== */
const startOfDayEndOfDay = (isoDate) => {
  const [Y, M, D] = isoDate.split("-").map(Number);
  const start = new Date(Y, (M || 1) - 1, D, 0, 0, 0, 0);
  const end = new Date(Y, (M || 1) - 1, D, 23, 59, 59, 999);
  return { start, end };
};

const isCancelledSession = (s) =>
  !!s?.cancelled ||
  String(s?.status || "").toLowerCase().includes("cancel");

const normalizeSessionRange = (s) => {
  if (!s) return null;
  const id = s._id || s.id || s.sessionId || s.meetingId || s.uuid || "";
  let start, end;

  if (s.startISO) {
    start = new Date(s.startISO);
    end = s.endISO
      ? new Date(s.endISO)
      : new Date(start.getTime() + (s.duration || 30) * 60000);
  } else if (s.date) {
    // e.g. "2025-03-07 - 10:00 – 10:30"
    const raw = String(s.date);
    const [datePart, timesPart] = raw.split(" - ");
    if (datePart && timesPart) {
      const pieces = timesPart
        .split(/[–-]/)
        .map((x) => x?.trim())
        .filter(Boolean);
      const st = pieces[0],
        en = pieces[1];
      if (st) {
        start = new Date(`${datePart} ${st}`);
        end = en
          ? new Date(`${datePart} ${en}`)
          : new Date(start.getTime() + (s.duration || 30) * 60000);
      }
    }
  } else if (s.start && s.end && s.day) {
    // fallback shape: explicit fields
    start = new Date(`${s.day} ${s.start}`);
    end = new Date(`${s.day} ${s.end}`);
  }

  if (!(start instanceof Date) || isNaN(start)) return null;
  if (!(end instanceof Date) || isNaN(end))
    end = new Date(start.getTime() + (s.duration || 30) * 60000);

  return {
    id,
    start,
    end,
    subject: s.subject || "",
    section: s.section || "",
    cancelled: isCancelledSession(s),
  };
};

const minsFromDate = (d) => d.getHours() * 60 + d.getMinutes();

/* =========================
   FancySelect — identical to BookSessionModal
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
    setActiveIdx(idxByValue >= 0 ? idxByValue : options.length ? 0 : -1);
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
      className={`fselect ${open ? "fselect-open" : ""} ${
        disabled ? "fselect-disabled" : ""
      }`}
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
        <span
          className={`fselect-value ${isPlaceholder ? "is-placeholder" : ""}`}
        >
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
            <div className="fselect-empty" aria-disabled="true">
              {placeholder}
            </div>
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
export default function RescheduleSessionModal({
  isOpen,
  onClose,
  session,
  onReschedule,
  onSuccess, // optional: parent refresh after success
  showToast,
  viewerRole = "student",
}) {
  const sessionStart = useMemo(() => {
    if (session?.startISO) {
      const d = new Date(session.startISO);
      return isNaN(d.getTime()) ? null : d;
    }
    const raw = String(session?.date || "");
    const [datePart, timesPart] = raw.split(" - ");
    if (!datePart || !timesPart) return null;
    const startTime = timesPart.split(/[–-]/)[0]?.trim();
    const d = new Date(`${datePart} ${startTime}`);
    return isNaN(d.getTime()) ? null : d;
  }, [session]);

  const initial = useMemo(() => {
    let date = "",
      time = "";
    if (session?.startISO) {
      const pair = toLocalYMDHM(session.startISO);
      date = pair.date;
      time = pair.time;
    } else {
      const raw = String(session?.date || "");
      const [datePart, timesPart] = raw.split(" - ");
      const startTime = timesPart?.split(/[–-]/)[0]?.trim();
      if (datePart && startTime) {
        const d = new Date(`${datePart} ${startTime}`);
        if (!isNaN(d.getTime())) {
          const pair = toLocalYMDHM(d.toISOString());
          date = pair.date;
          time = pair.time;
        }
      }
    }
    return {
      date,
      time,
      duration: String(session?.duration || 30),
      topic: session?.topic || "",
      reason: "",
    };
  }, [session]);

  const [formData, setFormData] = useState(initial);
  useEffect(() => setFormData(initial), [initial]);

  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (isOpen) setAck(false);
  }, [isOpen, session]);

  const [submitting, setSubmitting] = useState(false);
  const [localToast, setLocalToast] = useState({ msg: "", type: "info" });
  const toastTimerRef = useRef(null);
  const showLocalToast = (msg, type = "info", ms = 3000) => {
    setLocalToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setLocalToast({ msg, type: "info" });
      toastTimerRef.current = null;
    }, ms);
  };
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const hoursUntil = useMemo(() => {
    if (!sessionStart) return null;
    return (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);
  }, [sessionStart, isOpen]);

  const canReschedule = hoursUntil !== null && hoursUntil >= 24;

  const [availabilityStore, setAvailabilityStore] = useState({});
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  useEffect(() => {
    if (isOpen) setAvailabilityStore(loadAvailabilityStore());
  }, [isOpen]);

  const key = `${session?.subject}__${session?.section}`;

  // names
  const studentNames = extractStudentNames(
    session?.students || session?.members
  );
  const fromMembersOnly =
    !!session?.members &&
    !session?.students &&
    !session?.participants &&
    !session?.attendees &&
    !session?.group &&
    !session?.groupMembers;
  const isGroup =
    Boolean(session?.isGroup) ||
    studentNames.length > 1 ||
    (fromMembersOnly && studentNames.length >= 1);

  const currentUserName = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "";
      const u = JSON.parse(raw);
      const name =
        (u &&
          (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim())) ||
        "";
      return String(name || "").trim();
    } catch {
      return "";
    }
  }, []);

  const teammateNames = useMemo(() => {
    const names = [...studentNames];
    if (viewerRole !== "mentor") {
      if (currentUserName) {
        const i = names.findIndex(
          (n) =>
            String(n || "").trim().toLowerCase() ===
            currentUserName.toLowerCase()
        );
        if (i !== -1) names.splice(i, 1);
      } else {
        names.shift();
      }
    }
    return names;
  }, [studentNames, viewerRole, currentUserName]);

  const studentCount = studentNames.length;
  const studentLabel = studentCount === 1 ? "Student" : "Students";
  const entry = availabilityStore[key] || {};

  // Notification copy (who gets notified on submit)
  const notifyTargets = useMemo(() => {
    if (viewerRole === "mentor") {
      return studentNames.length > 1 ? "all students" : "the student";
    }
    if (isGroup) {
      return `your mentor and teammate${teammateNames.length === 1 ? "" : "s"}`;
    }
    return "your mentor";
  }, [viewerRole, studentNames.length, isGroup, teammateNames.length]);

  function defaultMentoringBlockForSection(sec) {
    const s = String(sec || "").trim().toUpperCase();
    if (s.startsWith("A")) return { start: "07:00", end: "08:15" };
    if (s.startsWith("H") || s.startsWith("B"))
      return { start: "13:15", end: "14:30" };
    if (s.startsWith("S") || s.startsWith("E"))
      return { start: "18:15", end: "19:30" };
    return { start: "07:00", end: "08:15" };
  }

  /* ===== Course schedule from DB (days + start/end) ===== */
  const [courseId, setCourseId] = useState(
    session?.courseId || session?.offeringID || ""
  );
  const [courseAllowedDays, setCourseAllowedDays] = useState(null);
  const [courseMentoringBlock, setCourseMentoringBlock] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      if (courseId) return;
      const code = courseCodeFromSubject(session?.subject || "");
      const section = session?.section || "";
      if (!code && !section) return;

      const qs1 = new URLSearchParams({
        courseCode: code || "",
        section,
      }).toString();
      const d1 = await tryFetchJson(`${API}/api/courses/lookup?${qs1}`);
      const found1 = Array.isArray(d1) ? d1[0] : d1;
      if (found1?._id || found1?.id) {
        setCourseId(String(found1._id || found1.id));
        return;
      }

      const qs2 = new URLSearchParams({ code: code || "", section }).toString();
      const d2 = await tryFetchJson(`${API}/api/courses/lookup?${qs2}`);
      const found2 = Array.isArray(d2) ? d2[0] : d2;
      if (found2?._id || found2?.id) {
        setCourseId(String(found2._id || found2.id));
      }
    })();
  }, [isOpen, session, courseId]);

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
      const endRaw = doc.endTime || doc.schedule?.endTime || "";

      const parsedDays = parseDaysOfWeek(daysRaw);
      const start = normalizeTime(startRaw);
      const end = normalizeTime(endRaw);

      if (!cancelled) {
        if (parsedDays && parsedDays.length) setCourseAllowedDays(parsedDays);
        if (start && end) setCourseMentoringBlock({ start, end });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, courseId]);

  const mentoringBlock =
    courseMentoringBlock ||
    entry.mentoringBlock ||
    defaultMentoringBlockForSection(session?.section?.[0] || session?.section);

  const allowedDaysFromEntry = (() => {
    if (
      entry.allowedDays &&
      Array.isArray(entry.allowedDays) &&
      entry.allowedDays.length
    )
      return entry.allowedDays;
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
    courseAllowedDays || allowedDaysFromEntry || defaultAllowed;
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
    if (!allowedDays || !Array.isArray(allowedDays) || allowedDays.length === 0)
      return true;
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

  const hasBlockedOnDate = (iso) =>
    (mentorBlocked || []).some((b) => b.date === iso);

  /* ===== Own sessions for conflict checks ===== */
  const [ownSessions, setOwnSessions] = useState([]);
  const [ownSessionsDay, setOwnSessionsDay] = useState("");

  useEffect(() => {
    if (!isOpen || !formData.date || ownSessionsDay === formData.date) return;
    let cancelled = false;

    (async () => {
      const { start, end } = startOfDayEndOfDay(formData.date);
      const qs = new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
      }).toString();

      // Try a few common patterns; take the first that returns an array
      const attempts = [
        `${API}/api/sessions/mine?${qs}`,
        `${API}/api/users/me/sessions?${qs}`,
        `${API}/api/sessions?mine=1&${qs}`,
        `${API}/api/sessions?${qs}`,
      ];

      let data = null;
      for (const url of attempts) {
        const res = await tryFetchJson(url);
        if (Array.isArray(res)) {
          data = res;
          break;
        }
        if (res && Array.isArray(res?.items)) {
          data = res.items;
          break;
        }
      }

      if (!cancelled) {
        setOwnSessions(Array.isArray(data) ? data : []);
        setOwnSessionsDay(formData.date);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, formData.date, ownSessionsDay]);

  /* Build raw times (24h rule + mentor blocks), then remove overlaps with own sessions */
  const { rawTimes, availableTimes, ownBusyWindows } = useMemo(() => {
    const result = { rawTimes: [], availableTimes: [], ownBusyWindows: [] };
    if (!formData.date) return result;

    // weekday gate
    if (Array.isArray(allowedDays)) {
      const w = weekdayNameFromISODate(formData.date);
      if (!w || !allowedDays.includes(w)) return result;
    }

    const startMin = parseTimeToMinutes(mentoringBlock.start);
    const endMin = parseTimeToMinutes(mentoringBlock.end);
    const dur = parseInt(formData.duration, 10) || 30;
    if (startMin === null || endMin === null || startMin >= endMin)
      return result;

    // mentor blocks for this date
    const blockedForDate = mentorBlocked.filter((b) => b.date === formData.date);

    // raw (no overlap checks yet)
    const raw = [];
    for (let t = startMin; t + dur <= endMin; t += STEP) {
      const slotStart = t,
        slotEnd = t + dur;

      // mentor block overlap?
      const isBlocked = blockedForDate.some((b) => {
        const bStart = parseTimeToMinutes(b.start);
        const bEnd = parseTimeToMinutes(b.end);
        if (bStart === null || bEnd === null) return false;
        return slotStart < bEnd && bStart < slotEnd;
      });
      if (isBlocked) continue;

      // 24h policy
      const [Y, M, D] = formData.date.split("-").map(Number);
      const sDate = new Date(
        Y,
        (M || 1) - 1,
        D,
        Math.floor(slotStart / 60),
        slotStart % 60,
        0,
        0
      );
      if (sDate.getTime() - Date.now() < MIN_LEAD_MS) continue;

      raw.push(minutesToTime(t));
    }

    // Build my busy windows (mins) for the same day (ignore current session + cancelled)
    const myBusy = (ownSessions || [])
      .map(normalizeSessionRange)
      .filter(Boolean)
      .filter((r) => !r.cancelled)
      .filter((r) => {
        const curId =
          session?._id ||
          session?.id ||
          session?.sessionId ||
          session?.meetingId ||
          "";
        if (curId && r.id && String(r.id) === String(curId)) return false;
        return dateToISO(r.start) === formData.date; // same day
      })
      .map((r) => ({
        start: minsFromDate(r.start),
        end: Math.max(
          minsFromDate(r.end),
          minsFromDate(r.start) + (parseInt(formData.duration, 10) || 30)
        ),
        label: `${fmt12(
          minutesToTime(minsFromDate(r.start))
        )} — ${fmt12(minutesToTime(minsFromDate(r.end)))}${
          r.subject ? ` (${r.subject})` : ""
        }`,
      }));

    // Filter out any raw slot that overlaps my busy windows
    const filtered = raw.filter((t) => {
      const ss = parseTimeToMinutes(t);
      const ee = ss + (parseInt(formData.duration, 10) || 30);
      return !myBusy.some((win) => ss < win.end && win.start < ee);
    });

    result.rawTimes = raw;
    result.availableTimes = filtered;
    result.ownBusyWindows = myBusy;
    return result;
  }, [
    mentoringBlock,
    formData.date,
    formData.duration,
    mentorBlocked,
    allowedDays,
    ownSessions,
    session?._id,
    session?.id,
    session?.sessionId,
    session?.meetingId,
  ]);

  useEffect(() => {
    if (formData.time && !availableTimes.includes(formData.time)) {
      setFormData((f) => ({ ...f, time: "" }));
    }
  }, [availableTimes]); // eslint-disable-line

  if (!isOpen) return null;

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

  /* ===== Default API-backed rescheduler (runs if onReschedule prop isn't provided) ===== */
  const rescheduleViaApi = async (payload) => {
    const sessionId =
      session?._id || session?.id || session?.sessionId || session?.meetingId;
    const body = {
      sessionId,
      subject: payload.subject,
      section: payload.section,
      mentor: payload.mentor,
      date: payload.date, // "YYYY-MM-DD"
      time: payload.time, // "HH:mm" local
      duration: payload.duration, // minutes
      topic: payload.topic,
      reason: payload.reason,
      startISO: payload.startISO, // UTC ISO for server
      endISO: payload.endISO,
    };

    // Try common patterns in order
    const attempts = [];
    if (sessionId) {
      attempts.push([`${API}/api/sessions/${sessionId}/reschedule`, "POST"]);
      attempts.push([`${API}/api/sessions/${sessionId}`, "PATCH"]);
    }
    attempts.push([`${API}/api/sessions/reschedule`, "POST"]);

    for (const [url, method] of attempts) {
      const res = await tryFetchJson(url, method, body);
      if (res) return res;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!canReschedule) return;
    if (!formData.date || !formData.time) return;

    const reasonTrim = formData.reason?.trim() || "";
    if (!reasonTrim) {
      (showToast || showLocalToast)?.(
        "Please include a reason for rescheduling.",
        "error"
      );
      return;
    }
    if (!ack) return;

    // Hard block if new start is < 24h from now
    if (!isStartAtLeast24hFromNow(formData.date, formData.time)) {
      (showToast || showLocalToast)?.(
        "Selected start time must be at least 24 hours from now.",
        "error"
      );
      return;
    }

    const { startISO, endISO } = buildStartEndISO(
      formData.date,
      formData.time,
      Number(formData.duration) || 30
    );

    const payload = {
      subject: session.subject,
      section: session.section,
      mentor: session.mentor,
      date: formData.date,
      time: formData.time,
      duration: Number(formData.duration),
      topic: formData.topic,
      reason: reasonTrim,
      startISO,
      endISO,
    };

    try {
      setSubmitting(true);

      let ok = false;
      if (typeof onReschedule === "function") {
        // If parent handles it, do NOT fall back to API when it returns false.
        ok = !!(await onReschedule(payload));
      } else {
        const apiResult = await rescheduleViaApi(payload);
        ok = !!apiResult;
      }

      if (ok) {
        (showToast || showLocalToast)?.(
          "Session rescheduled successfully.",
          "success"
        );
        if (typeof onSuccess === "function") {
          try {
            await onSuccess(payload);
          } catch {}
        }
        onClose?.();
      } else {
        (showToast || showLocalToast)?.(
          "Failed to reschedule. Please ensure the new time is at least 24 hours from now and try again.",
          "error"
        );
      }
    } catch (err) {
      console.error("Reschedule failed:", err);
      (showToast || showLocalToast)?.(
        "Unexpected error. Please try again.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const viewMonthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayISO = dateToISO(new Date());
  const getNextAllowedDateISO = () => {
    const start = formData.date ? isoToDate(formData.date) : new Date();
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 365; i++) {
      const iso = dateToISO(d);
      if (
        iso >= todayISO &&
        (!allowedDays || allowedDays.includes(WEEKDAY_NAMES[d.getDay()])) &&
        // Find the first date that can have at least one slot >= 24h
        (() => {
          const dayStartCandidate = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            parseInt((mentoringBlock.start || "00:00").split(":")[0] || 0, 10),
            parseInt((mentoringBlock.start || "00:00").split(":")[1] || 0, 10),
            0,
            0
          );
          const dayEndCandidate = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            parseInt((mentoringBlock.end || "23:59").split(":")[0] || 23, 10),
            parseInt((mentoringBlock.end || "23:59").split(":")[1] || 59, 10),
            0,
            0
          );
          // If entire day window is before min lead, skip
          return dayEndCandidate.getTime() - Date.now() >= MIN_LEAD_MS;
        })()
      )
        return iso;
      d.setDate(d.getDate() + 1);
    }
    return null;
  };
  const nextAllowed = getNextAllowedDateISO();

  const Toast = () =>
    localToast.msg ? (
      <div className={`toast ${localToast.type}`} role="status" aria-live="polite">
        {localToast.msg}
      </div>
    ) : null;

  const counterpartPhrase =
    viewerRole === "mentor"
      ? studentNames.length > 1
        ? "the students"
        : "the student"
      : "your mentor";

  /* =========================
     < 24h lockout
     ========================= */
  if (!canReschedule) {
    return (
      <div className="reschedule-modal rs-compact">
        <Toast />
        <div className="modal-overlay">
          <div className="modal-content">
            <span
              className="tip-wrapper top-right"
              aria-describedby="reschedule-tip"
              tabIndex={0}
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
                Rescheduling is allowed up to <strong>24 hours before</strong>{" "}
                the session start time; doing so will notify{" "}
                <strong>{notifyTargets}</strong>.
              </span>
            </span>

            <h2>Reschedule Session</h2>
            <p>
              <strong>{session.subject}</strong> — {session.section}
            </p>
            {viewerRole === "mentor" ? (
              <div className="meta" style={{ marginTop: 3 }}>
                {studentCount > 0
                  ? `${studentLabel}: ${studentNames.join(", ")}`
                  : `${studentLabel}: —`}
              </div>
            ) : (
              <>
                <div className="meta" style={{ marginTop: 3 }}>
                  Mentor: <strong>{session?.mentor}</strong>
                </div>
                {isGroup && teammateNames.length > 0 && (
                  <div className="meta" style={{ marginTop: 3 }}>
                    <span className="group-label">
                      {teammateNames.length === 1 ? "Teammate" : "Teammates"}:
                    </span>{" "}
                    <strong className="group-members">
                      {teammateNames.join(", ")}
                    </strong>
                  </div>
                )}
              </>
            )}
            <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

            <p
              className="hint"
              role="alert"
              style={{
                color: "#b91c1c",
                fontWeight: 600,
                marginTop: "0.75rem",
              }}
            >
              This session begins in less than 24 hours. Per policy, you can’t
              reschedule it here. Please contact {counterpartPhrase} to discuss
              options.
            </p>

            <div className="modal-actions full" style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary btn-block"
                style={{
                  padding: "0.75rem 1rem",
                  background:
                    "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
                  color: "#fff",
                  border: "none",
                }}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     >= 24h flow
     ========================= */
  const dateAllowed =
    formData.date &&
    (!Array.isArray(allowedDays) ||
      allowedDays.includes(weekdayNameFromISODate(formData.date)));
  const timeDisabled =
    !formData.date || !dateAllowed || availableTimes.length === 0;

  const reasonTrimmed = formData.reason.trim();
  const newStartOk =
    formData.date && formData.time
      ? isStartAtLeast24hFromNow(formData.date, formData.time)
      : false;

  return (
    <div className="reschedule-modal" role="dialog" aria-modal="true">
      <Toast />

      <div className="modal-overlay">
        <div
          className="modal-content resched-content"
          aria-labelledby="resched-title"
        >
          <span
            className="tip-wrapper top-right"
            aria-describedby="reschedule-tip"
            tabIndex={0}
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
              session start time; doing so will notify{" "}
              <strong>{notifyTargets}</strong>.
            </span>
          </span>

          <div className="resched-header">
            <h2 id="resched-title" style={{ margin: 0 }}>
              {session?.subject} — {session?.section}
            </h2>
            {viewerRole === "mentor" ? (
              <div className="meta" style={{ marginTop: 3 }}>
                {studentCount > 0
                  ? `${studentLabel}: ${studentNames.join(", ")}`
                  : `${studentLabel}: —`}
              </div>
            ) : (
              <>
                <div className="meta" style={{ marginTop: 3 }}>
                  Mentor: <strong>{session?.mentor}</strong>
                </div>
                {isGroup && teammateNames.length > 0 && (
                  <div className="meta" style={{ marginTop: 3 }}>
                    <span className="group-label">
                      {teammateNames.length === 1 ? "Teammate" : "Teammates"}:
                    </span>{" "}
                    <strong className="group-members">
                      {teammateNames.join(", ")}
                    </strong>
                  </div>
                )}
              </>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div className="resched-body">
              {/* LEFT: Calendar */}
              <div
                className={`calendar-panel ${isSixRows ? "six-rows" : ""}`}
                aria-hidden={false}
              >
                <div className="calendar-controls compact">
                  <button
                    type="button"
                    className="nav-btn"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() - 1,
                          1
                        )
                      )
                    }
                    aria-label="Previous month"
                  >
                    ◀
                  </button>
                  <div className="month-label" aria-live="polite">
                    {viewMonthLabel}
                  </div>
                  <button
                    type="button"
                    className="nav-btn"
                    onClick={() =>
                      setViewMonth(
                        new Date(
                          viewMonth.getFullYear(),
                          viewMonth.getMonth() + 1,
                          1
                        )
                      )
                    }
                    aria-label="Next month"
                  >
                    ▶
                  </button>
                </div>

                {/* middle grid */}
                <div className="calendar-scroll">
                  <table
                    className="mac-calendar compact"
                    role="grid"
                    aria-label="Booking calendar"
                  >
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
                            if (!cell)
                              return (
                                <td key={j} className="empty" aria-hidden="true" />
                              );
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
                                      ? iso < dateToISO(new Date())
                                        ? "Past date"
                                        : "Not available for mentoring on this weekday"
                                      : blocked
                                      ? "Has blocked sub-range"
                                      : "Select date"
                                  }
                                  className={`cal-day-btn ${
                                    selected ? "selected" : ""
                                  } ${disabled ? "disabled" : ""}`}
                                >
                                  <div className="cal-day-top">
                                    <span className="cal-day-num">
                                      {cell.getDate()}
                                    </span>
                                    {blocked && (
                                      <span
                                        className="dot-block"
                                        aria-hidden="true"
                                      />
                                    )}
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
                </div>

                <div className="calendar-footer">
                  <div className="allowed-text">
                    {allowedDays
                      ? `Allowed: ${allowedDays.join(", ")}`
                      : "Allowed: all weekdays"}
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
                <div className="right-header">
                  <div className="main-title">Reschedule Session</div>
                  <div className="date-line">Scheduled: {session.date}</div>
                </div>

                {/* Duration */}
                <div className="row duration-row" style={{ marginTop: 14 }}>
                  <label className="label">Duration</label>
                  <FancySelect
                    name="duration"
                    value={formData.duration}
                    onChange={(v) =>
                      setFormData((f) => ({ ...f, duration: String(v) }))
                    }
                    options={[
                      { value: "15", label: "15 mins" },
                      { value: "30", label: "30 mins" },
                    ]}
                    disabled={submitting}
                  />
                  <small className="hint">Max 30 mins per student.</small>
                </div>

                {/* Start time */}
                <div className="row time-row" style={{ marginTop: 12 }}>
                  <label className="label">Start time</label>
                  <FancySelect
                    name="time"
                    value={formData.time}
                    onChange={(v) =>
                      setFormData((f) => ({ ...f, time: String(v) }))
                    }
                    disabled={
                      submitting || !formData.date || !dateAllowed || timeDisabled
                    }
                    placeholder={
                      !formData.date
                        ? "Pick a date first"
                        : !dateAllowed
                        ? "Not available on this date"
                        : availableTimes.length === 0
                        ? rawTimes.length > 0
                          ? "No slots—conflicts with your sessions."
                          : "No slots. Pick a time 24 hours from now."
                        : "Select time"
                    }
                    options={
                      formData.date && dateAllowed
                        ? availableTimes.map((t) => {
                            const dur = parseInt(formData.duration, 10) || 30;
                            const end = minutesToTime(
                              parseTimeToMinutes(t) + dur
                            );
                            return {
                              value: t,
                              label: `${fmt12(t)} — ${fmt12(end)}`,
                            };
                          })
                        : []
                    }
                  />
                  <div className="small-note">
                    Time range: {fmt12(mentoringBlock.start)} —{" "}
                    {fmt12(mentoringBlock.end)}
                  </div>
                  {ownBusyWindows.length > 0 && (
                    <div className="small-note" style={{ marginTop: 4 }}>
                      Conflicting sessions today:  {ownBusyWindows.map((w) => w.label).join(", ")}
                    </div>
                  )}
                  {formData.date && formData.time && !newStartOk && (
                    <div
                      className="hint"
                      role="alert"
                      style={{ color: "#b91c1c", marginTop: 6, fontWeight: 600 }}
                    >
                      Selected start violates the 24-hour policy. Please choose a
                      later time.
                    </div>
                  )}
                </div>

                {/* Topic */}
                <div className="row full topic-row">
                  <label className="label" htmlFor="topic">
                    Topic
                  </label>
                  <input
                    id="topic"
                    type="text"
                    name="topic"
                    value={formData.topic}
                    onChange={handleChange}
                    placeholder="e.g., Week 4 assignment and project feedback"
                    required
                  />
                </div>

                {/* Reason */}
                <div className="row full reason-row">
                  <label className="label">Reason for rescheduling</label>
                  <textarea
                    name="reason"
                    rows="3"
                    value={formData.reason}
                    onChange={handleChange}
                    placeholder="e.g., schedule conflict, urgent matter"
                    required
                    aria-required="true"
                  />
                </div>

                {/* Ack */}
                <div className="row full" style={{ marginTop: 12 }}>
                  <label className="ack-row">
                    <input
                      id="ack-resched"
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    <span>I understand this action cannot be undone.</span>
                  </label>
                </div>

                {/* Actions */}
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-ghost"
                    disabled={submitting}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      !ack ||
                      submitting ||
                      !formData.date ||
                      !formData.time ||
                      !reasonTrimmed ||
                      !newStartOk
                    }
                    aria-disabled={
                      !ack ||
                      submitting ||
                      !formData.date ||
                      !formData.time ||
                      !reasonTrimmed ||
                      !newStartOk
                    }
                  >
                    {submitting ? "Rescheduling…" : "Reschedule"}
                  </button>
                </div>
              </div>
              {/* END RIGHT */}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}