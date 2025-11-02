// src/components/RescheduleSessionModal.jsx — booking-parity version (cleaned + notifications)
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

/* === NEW: tiny helpers for notif labels / IDs / emails === */
const getTZShort = (date) => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch { return ""; }
};
const formatDateTimeForNotif = (isoStart, isoEnd) => {
  const start = isoStart ? new Date(isoStart) : null;
  const end = isoEnd ? new Date(isoEnd) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { dateStr: "", startStr: "", endStr: "", timeRange: "", durationMin: 0, tzShort: "", label: "" };
  }
  const fmtDate = (d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const fmtTime = (d) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateStr = fmtDate(start);
  const startStr = fmtTime(start);
  const endValid = end && !Number.isNaN(end.getTime());
  const endStr = endValid ? fmtTime(end) : "";
  const tzShort = getTZShort(start);
  const timeRange = endStr ? `${startStr}–${endStr}` : startStr;
  const durationMin = endValid ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : 0;
  const sameDay = endValid ? start.toDateString() === end.toDateString() : true;
  const label = sameDay
    ? `${dateStr}, ${timeRange} ${tzShort}${durationMin ? ` (${durationMin} mins)` : ""}`
    : `${dateStr} ${startStr} ${tzShort} – ${fmtDate(end)} ${fmtTime(end)} ${getTZShort(end)}${durationMin ? ` (${durationMin} mins)` : ""}`;
  return { dateStr, startStr, endStr, timeRange, durationMin, tzShort, label };
};
const toIdString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    return (
      v._id ||
      v.id ||
      v.$id ||
      v.$oid ||
      (v.toString ? v.toString() : "") ||
      ""
    ).toString();
  }
  return String(v);
};

const isValidEmail = (s = "") => {
  if (!s) return false;
  const value = String(s).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

function getCurrentEmail() {
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const u = JSON.parse(raw);
      const e =
        u?.email || u?.user?.email || u?.account?.email || u?.profile?.email;
      if (e) return String(e).toLowerCase();
    }
  } catch {}
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      const e =
        payload?.email ||
        payload?.login?.email ||
        payload?.user?.email ||
        payload?.account?.email;
      if (e) return String(e).toLowerCase();
    }
  } catch {}
  return "";
}

/* === Notifications: shared helpers === */
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }
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

async function resolveEmailsToIds(emails = []) {
  const uniq = [...new Set((emails || []).map((e) => String(e || "").toLowerCase()))];
  const out = new Map();
  if (!uniq.length) return out;

  const headers = authHeaders();

  // helper to ingest any array-ish response
  const ingest = (data) => {
    const arr = Array.isArray(data)
      ? data
      : (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data?.users) && data.users) ||
        (Array.isArray(data?.students) && data.students) ||
        (Array.isArray(data?.results) && data.results) ||
        [];
    for (const it of arr) {
      const n = normalizeRosterItem(it);
      if (n?.email && n?.id) out.set(n.email.toLowerCase(), toIdString(n.id));
    }
  };

  // --- Bulk GET: emails joined + repeated params
  const queryComma = encodeURIComponent(uniq.join(","));
  const repeated = uniq.map((e) => `emails=${encodeURIComponent(e)}`).join("&");
  const bulkGets = [
    `${API}/api/users/by-emails?emails=${queryComma}`,
    `${API}/api/students/by-emails?emails=${queryComma}`,
    `${API}/api/users/by-emails?${repeated}`,
    `${API}/api/students/by-emails?${repeated}`,
  ];
  for (const url of bulkGets) {
    try {
      const r = await fetch(url, { headers, credentials: "include" });
      if (!r.ok) continue;
      ingest(await r.json());
      if (out.size === uniq.length) return out;
    } catch {}
  }

  // --- Bulk POST candidates
  const bulkPosts = [
    { url: `${API}/api/users/resolve`, body: { emails: uniq } },
    { url: `${API}/api/students/resolve`, body: { emails: uniq } },
    { url: `${API}/api/users/lookup`, body: { emails: uniq } },
    { url: `${API}/api/users/bulk`, body: { emails: uniq } },
  ];
  for (const bp of bulkPosts) {
    try {
      const r = await fetch(bp.url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(bp.body),
      });
      if (!r.ok) continue;
      ingest(await r.json());
      if (out.size === uniq.length) return out;
    } catch {}
  }

  // --- Singles fallback
  const missing = uniq.filter((e) => !out.has(e));
  for (const email of missing) {
    const q = encodeURIComponent(email);
    const singleGets = [
      `${API}/api/users/by-email/${q}`,
      `${API}/api/users/by-email?email=${q}`,
      `${API}/api/users/find?email=${q}`,
      `${API}/api/students/by-email/${q}`,
      `${API}/api/students/find?email=${q}`,
      `${API}/api/users?email=${q}`, // may return array
    ];
    for (const url of singleGets) {
      try {
        const r = await fetch(url, { headers, credentials: "include" });
        if (!r.ok) continue;
        const j = await r.json();
        const candidate = Array.isArray(j) ? j[0] :
                          Array.isArray(j?.users) ? j.users[0] :
                          Array.isArray(j?.data) ? j.data[0] :
                          j;
        const n = normalizeRosterItem(candidate);
        if (n?.id) { out.set(email, toIdString(n.id)); break; }
      } catch {}
    }
  }

  return out;
}

/** Unified sender (in-app + email) */
async function sendUnifiedNotification(toUserId, payload) {
  if (!toUserId) return false;
  const opts = (body) => ({
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ sendEmail: true, ...body }),
  });
  const attempts = [
    { url: `${API}/api/notifications`, body: { toUserId, ...payload } },
    { url: `${API}/api/notifications/send`, body: { to: toUserId, ...payload } },
    { url: `${API}/api/users/${toUserId}/notifications`, body: payload },
    { url: `${API}/api/users/${toUserId}/notify`, body: payload },
  ];
  for (const a of attempts) {
    try { const res = await fetch(a.url, opts(a.body)); if (res.ok) return true; } catch {}
  }
  return false;
}

/** Self user id */
async function getSelfUserId() {
  // 1) Try localStorage "user"
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const u = JSON.parse(raw);
      const id = toIdString(u?._id || u?.id || u?.user?._id || u?.user?.id);
      if (id) return id;
    }
  } catch {}

  // 2) Decode JWT quickly (no network)
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      const id = toIdString(
        payload?._id || payload?.id || payload?.sub || payload?.userId
      );
      if (id) return id;
    }
  } catch {}

  // 3) No hard fail — just return empty (you’ll still notify mentor/students)
  return "";
}

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

function normalizeRosterItem(obj) {
  const email = String(extractEmail(obj) || "").trim();
  const id =
    toIdString(
      obj?._id || obj?.id || obj?.user?._id || obj?.user?.id || obj?.account?._id || obj?.account?.id || obj?.student?._id || obj?.student?.id
    ) || null;
  return { id, email: email ? email.toLowerCase() : "" };
}

/* === storage loader === */
function loadAvailabilityStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** DB → UI helpers */
const normalizeTime = (t) => {
  if (!t) return "";
  const [hh, mm] = String(t).split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/** Parse compact ranges like "13:15-14:30" */
function parseCompactRange(rangeStr = "") {
  const s = String(rangeStr || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const aH = Number(m[1]), aM = Number(m[2]), bH = Number(m[3]), bM = Number(m[4]);
  if ([aH, aM, bH, bM].some((x) => Number.isNaN(x))) return null;
  const start = `${String(aH).padStart(2, "0")}:${String(aM).padStart(2, "0")}`;
  const end   = `${String(bH).padStart(2, "0")}:${String(bM).padStart(2, "0")}`;
  return { start, end };
}

/** Match the mentor policy fallback used in the calendar:
 *   - MWF  -> Wed, Fri
 *   - TTHS -> Thu, Sat
 * (Anything else → no default mentoring days)
 */
const parseDaysStringToDow = (raw) => {
  if (!raw || typeof raw !== "string") return [];
  let s = raw.toUpperCase().replace(/\s+/g, "");
  s = s.replace(/T{2,}HS/g, "THS").replace(/T{2,}H/g, "TH");
  const out = [];
  for (let i = 0; i < s.length; ) {
    if (s.startsWith("TH", i)) { out.push(4); i += 2; continue; }
    const ch = s[i];
    let dow = null;
    switch (ch) {
      case "M": dow = 1; break;
      case "T": dow = 2; break;
      case "W": dow = 3; break;
      case "R": dow = 4; break;
      case "F": dow = 5; break;
      case "S": dow = 6; break;
      case "U": dow = 0; break;
      default: dow = null;
    }
    if (dow !== null) out.push(dow);
    i += 1;
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
};

const allowedFromSchedule = (daysStr = "") => {
  const dows = parseDaysStringToDow(daysStr);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (same(dows, [1, 3, 5])) return ["Wed", "Fri"]; // MWF
  if (same(dows, [4, 6]) || same(dows, [2, 4, 6])) return ["Thu", "Sat"]; // THS or TTHS
  return [];
};

/* =========================
  Staleness-safe helpers
   ========================= */

/** Is a date open given arrays (pure, no state dependency) */
const isDateOpenGiven = (iso, days = [], opens = [], closes = []) => {
  if (!iso) return false;
  if (Array.isArray(closes) && closes.includes(iso)) return false;
  if (Array.isArray(opens) && opens.includes(iso)) return true;
  const wname = WEEKDAY_NAMES[isoToDate(iso)?.getDay()];
  return (days || []).includes(wname);
};

/** Compute a signature for availability to detect changes */
const computeAvailSignature = (days, opens, closes, mb) => {
  const key = {
    d: Array.isArray(days) ? [...days].sort() : days,
    o: Array.isArray(opens) ? [...opens].sort() : opens,
    c: Array.isArray(closes) ? [...closes].sort() : closes,
    m: mb?.start && mb?.end ? `${mb.start}-${mb.end}` : null,
  };
  return JSON.stringify(key);
};

/** Compute available times for a date (pure) */
const computeAvailableTimes = (dateIso, mb, dur, blocked = []) => {
  if (!dateIso || !mb?.start || !mb?.end) return [];
  const startMin = parseTimeToMinutes(mb.start);
  const endMin = parseTimeToMinutes(mb.end);
  if (startMin == null || endMin == null || startMin >= endMin) return [];
  const blockedForDate = (blocked || []).filter((b) => b.date === dateIso);
  const slots = [];
  for (let t = startMin; t + dur <= endMin; t += STEP) {
    const slotStart = t, slotEnd = t + dur;
    const isBlocked = blockedForDate.some((b) => {
      const bStart = parseTimeToMinutes(b.start);
      const bEnd = parseTimeToMinutes(b.end);
      return bStart != null && bEnd != null && (slotStart < bEnd && bStart < slotEnd);
    });
    if (!isBlocked) slots.push(minutesToTime(t));
  }
  return slots;
};

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
   Custom hook: roster & maps
   ========================= */
function useRoster(isOpen, courseId) {
  const [roster, setRoster] = useState([]);
  const [rosterLoadedFor, setRosterLoadedFor] = useState("");

  useEffect(() => {
    if (!isOpen || !courseId || rosterLoadedFor === courseId) return;
    let cancelled = false;
    (async () => {
      const headers = authHeaders();
      const ingest = (data) => {
        const arr = Array.isArray(data)
          ? data
          : (Array.isArray(data?.data) && data.data) ||
            (Array.isArray(data?.students) && data.students) ||
            (Array.isArray(data?.roster) && data.roster) ||
            [];
        return arr.map((a) => normalizeRosterItem(a?.user || a)).filter(Boolean);
      };
      let found = [];
      const tries = [
        `${API}/api/courses/${courseId}/students`,
        `${API}/api/courses/${courseId}/roster`,
        `${API}/api/courses/${courseId}`,
      ];
      for (const url of tries) {
        try {
          const r = await fetch(url, { headers, credentials: "include" });
          if (!r.ok) continue;
          const j = await r.json();
          const got = ingest(j);
          if (got.length) { found = got; break; }
        } catch {}
      }
      if (!cancelled) {
        setRoster(found);
        setRosterLoadedFor(courseId);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, courseId, rosterLoadedFor]);

  const idByEmail = useMemo(() => {
    const m = new Map();
    for (const r of roster) {
      if (r.email && r.id) m.set(String(r.email).toLowerCase(), toIdString(r.id));
    }
    return m;
  }, [roster]);

  const emailByName = useMemo(() => {
    const m = new Map();
    for (const r of roster) {
      const name = (r?.name || "").trim().toLowerCase();
      if (name && r.email) m.set(name, String(r.email).toLowerCase());
    }
    return m;
  }, [roster]);

  return { roster, idByEmail, emailByName };
}

// NEW: Resolve teammate IDs robustly (booking-style)
// (updated to accept lookup maps)
async function getTeammateIdsSmart(sess, idByEmail, emailByName) {
  const outEmails = new Set();
  const selfEmail = getCurrentEmail();
  const mentorId =
    toIdString(sess?.mentorId || sess?.mentor?._id || sess?.mentor?.id) || "";

  // 1) direct participant emails (if saved with the session)
  const fromPropEmails = []
    .concat(sess?.participantEmails || [])
    .concat(sess?.participants?.map?.((p) => p?.email) || [])
    .concat(sess?.members?.map?.((p) => p?.email) || [])
    .concat(sess?.students?.map?.((p) => p?.email) || [])
    .filter(Boolean)
    .map((e) => String(e).toLowerCase());

  for (const e of fromPropEmails) if (isValidEmail(e)) outEmails.add(e);

  // 2) names-only → map via roster
  const nameLikeArrays = [
    sess?.participants, sess?.members, sess?.students, sess?.attendees, sess?.groupMembers
  ].filter(Array.isArray);

  for (const arr of nameLikeArrays) {
    for (const it of arr) {
      const name =
        (typeof it === "string" ? it : (it?.name || it?.fullName || it?.user?.name)) || "";
      const email =
        (typeof it === "string" ? "" : (it?.email || it?.user?.email)) || "";
      if (isValidEmail(email)) {
        outEmails.add(String(email).toLowerCase());
        continue;
      }
      const key = String(name || "").trim().toLowerCase();
      if (key && emailByName?.has(key)) outEmails.add(emailByName.get(key));
    }
  }

  // 3) remove actor/self
  if (selfEmail) outEmails.delete(selfEmail);

  // 4) map to IDs via roster where possible
  const directIds = new Set();
  const unresolvedEmails = [];
  for (const e of outEmails) {
    const id = idByEmail?.get(e);
    if (id) directIds.add(id);
    else unresolvedEmails.push(e);
  }

  // 5) resolve any remaining emails to IDs via backend
  if (unresolvedEmails.length) {
    const map = await resolveEmailsToIds(unresolvedEmails);
    for (const [email, id] of map.entries()) {
      if (id) directIds.add(toIdString(id));
    }
  }

  // 6) drop mentor & empty
  const filtered = [...directIds].filter((id) => id && id !== mentorId);
  return [...new Set(filtered)];
}

const startOfDayEndOfDay = (isoDate) => {
  const [Y, M, D] = isoDate.split("-").map(Number);
  const start = new Date(Y, (M || 1) - 1, D, 0, 0, 0, 0);
  const end = new Date(Y, (M || 1) - 1, D, 23, 59, 59, 999);
  return { start, end };
};

const isCancelledSession = (s) =>
  !!s?.cancelled || String(s?.status || "").toLowerCase().includes("cancel");

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
   Component
   ========================= */
export default function RescheduleSessionModal({
  isOpen,
  onClose,
  session,
  onReschedule,
  onSuccess,
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

  /* ===== Course schedule from DB (days + start/end + open/closed) ===== */
  const [courseId, setCourseId] = useState(
    session?.courseId || session?.offeringID || ""
  );

  // NEW: roster/mapping derived via custom hook
  const { roster, idByEmail, emailByName } = useRoster(isOpen, courseId);

  const [courseAllowedDays, setCourseAllowedDays] = useState(null);
  const [courseMentoringBlock, setCourseMentoringBlock] = useState(null);
  const [courseOpenDates, setCourseOpenDates] = useState(null);
  const [courseClosedDates, setCourseClosedDates] = useState(null);

  // 🔁 UPDATED: resolve courseId WITHOUT /api/courses/lookup (use /mine instead)
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      if (courseId) return;
      const code = courseCodeFromSubject(session?.subject || "");
      const section = String(session?.section || "").trim().toUpperCase();
      if (!code && !section) return;

      const list = await tryFetchJson(`${API}/api/courses/mine`);
      if (Array.isArray(list) && list.length) {
        const found = list.find((c) => {
          const cCode = String(c.courseCode || "").trim().toUpperCase();
          const cSec = String(c.section || "").trim().toUpperCase();
          return (!!code ? cCode === String(code).toUpperCase() : true) &&
                 (!!section ? cSec === section : true);
        });
        if (found?._id || found?.id) {
          setCourseId(String(found._id || found.id));
        }
      }
    })();
  }, [isOpen, session, courseId]);

  // Normalize date arrays to ["YYYY-MM-DD", ...]
  const normalizeISODateList = (arr) => {
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) => {
        if (!x) return null;
        if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
        const d = new Date(x);
        return isNaN(d.getTime()) ? null : dateToISO(d);
      })
      .filter(Boolean);
  };

  // 1) Fetch course doc (fallbacks)
  useEffect(() => {
    if (!isOpen || !courseId) return;
    let cancelled = false;

    (async () => {
      const doc = await tryFetchJson(`${API}/api/courses/${courseId}`);
      if (!doc || cancelled) return;

      const availability = doc.availability || {};
      const daysRawFromSchedule =
        doc.schedule?.days || doc.daysOfWeek || doc.days || "";

      // allowedDays from DB (string or array) -> to ["Mon","Wed",...]
      let nextAllowedDays = null;
      const dbAllowed = availability.allowedDays || doc.allowedDays;
      if (Array.isArray(dbAllowed) && dbAllowed.length) {
        nextAllowedDays = dbAllowed.map(String);
      } else if (typeof dbAllowed === "string") {
        nextAllowedDays = parseDaysOfWeek(dbAllowed);
      }
      if (!nextAllowedDays || !nextAllowedDays.length) {
        const policyDays = allowedFromSchedule(daysRawFromSchedule);
        if (policyDays && policyDays.length) nextAllowedDays = policyDays;
      }

      let nextBlock = null;
      if (availability.mentoringBlock?.start && availability.mentoringBlock?.end) {
        nextBlock = {
          start: normalizeTime(availability.mentoringBlock.start),
          end: normalizeTime(availability.mentoringBlock.end),
        };
      } else if (doc.mentoringBlock?.start && doc.mentoringBlock?.end) {
        nextBlock = {
          start: normalizeTime(doc.mentoringBlock.start),
          end: normalizeTime(doc.mentoringBlock.end),
        };
      } else {
        const compact = doc.schedule?.time || "";
        const parsed = parseCompactRange(compact);
        if (parsed?.start && parsed?.end) nextBlock = parsed;
      }

      const opens = normalizeISODateList(
        availability.openDates || doc.openDates || []
      );
      const closes = normalizeISODateList(
        availability.closedDates || doc.closedDates || []
      );

      if (!cancelled) {
        if (nextAllowedDays && nextAllowedDays.length)
          setCourseAllowedDays(nextAllowedDays);
        if (nextBlock?.start && nextBlock?.end)
          setCourseMentoringBlock(nextBlock);
        if (opens) setCourseOpenDates(opens);
        if (closes) setCourseClosedDates(closes);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, courseId]);

  /* 2) 🔹 Fetch live availability (same endpoint used by BookSessionModal) */
  const [avAllowedDays, setAvAllowedDays] = useState(undefined); // array or undefined
  const [avOpenDates, setAvOpenDates] = useState([]);            // ["YYYY-MM-DD"]
  const [avClosedDates, setAvClosedDates] = useState([]);        // ["YYYY-MM-DD"]
  const [avMentoringBlock, setAvMentoringBlock] = useState(null);// {start,end} or null
  const [avSig, setAvSig] = useState("");

  useEffect(() => {
    if (!isOpen || !courseId) return;
    let cancelled = false;
    (async () => {
      const raw = await tryFetchJson(`${API}/api/courses/${courseId}/availability`);
      if (!raw || cancelled) return;
      const av = (raw && typeof raw === "object" && raw.availability && typeof raw.availability === "object")
        ? raw.availability
        : raw;

      const days = Array.isArray(av?.allowedDays) ? av.allowedDays : undefined; // undefined => fall back to course policy
      const opens = normalizeISODateList(av?.openDates || []);
      const closes = normalizeISODateList(av?.closedDates || []);
      const mb = (av?.mentoringBlock?.start && av?.mentoringBlock?.end)
        ? { start: normalizeTime(av.mentoringBlock.start), end: normalizeTime(av.mentoringBlock.end) }
        : null;

      setAvAllowedDays(days);
      setAvOpenDates(opens || []);
      setAvClosedDates(closes || []);
      if (mb && mb.start && mb.end) setAvMentoringBlock(mb);

      const effDays = Array.isArray(days) ? days : (Array.isArray(courseAllowedDays) ? courseAllowedDays : []);
      const effMb   = mb || courseMentoringBlock || null;
      setAvSig(computeAvailSignature(effDays, opens || [], closes || [], effMb));
    })();
    return () => { cancelled = true; };
  }, [isOpen, courseId, courseAllowedDays, courseMentoringBlock]);

  // Preferred mentoring block (live → course → local fallback)
  const mentoringBlock =
    avMentoringBlock ||
    courseMentoringBlock ||
    entry.mentoringBlock ||
    defaultMentoringBlockForSection(session?.section?.[0] || session?.section);

  // Local-storage allowedDays fallback
  const allowedDaysFromEntry = (() => {
    if (Array.isArray(entry.allowedDays) && entry.allowedDays.length) {
      return entry.allowedDays;
    }
    if (entry.days) {
      const schedFallback = allowedFromSchedule(entry.days);
      if (schedFallback && schedFallback.length) return schedFallback;
      const parsed = parseDaysOfWeek(entry.days);
      if (parsed && parsed.length) return parsed;
    }
    return null;
  })();

  const defaultAllowed = useMemo(() => {
    const idx = hashString(key) % PRESET_DAY_SETS.length;
    return PRESET_DAY_SETS[idx];
  }, [key]);

  // ✅ Final allowedDays with correct semantics:
  // - If backend specifies [], it means “no default days; only special opens”
  // - If backend returns undefined, fall back to course policy or entry/default
  const allowedDays = useMemo(() => {
    if (Array.isArray(avAllowedDays)) return avAllowedDays;          // [] is valid
    if (Array.isArray(courseAllowedDays)) return courseAllowedDays;
    return allowedDaysFromEntry || defaultAllowed;
  }, [avAllowedDays, courseAllowedDays, allowedDaysFromEntry, defaultAllowed]);

  // Prefer live open/closed date lists; fall back to course-level ones
  const openDates = (avOpenDates && avOpenDates.length) ? avOpenDates : (courseOpenDates || []);
  const closedDates = (avClosedDates && avClosedDates.length) ? avClosedDates : (courseClosedDates || []);

  // Footer summary (mirror BookSessionModal’s wording)
  const allowedSummary =
    Array.isArray(avAllowedDays)
      ? (avAllowedDays.length ? `Allowed: ${avAllowedDays.join(", ")}` : "Allowed: (none; only special open dates)")
      : (Array.isArray(courseAllowedDays) && courseAllowedDays.length
          ? `Allowed: ${courseAllowedDays.join(", ")}`
          : "Allowed: (none)");

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
  const todayISO = dateToISO(new Date());

  // 🔹 Master check (mirror BookSessionModal): closed overrides, openDates additive; else weekday allow
  const isDateOpenByAvailability = (iso) => {
    if (!iso) return false;
    if (Array.isArray(closedDates) && closedDates.includes(iso)) return false;
    if (Array.isArray(openDates) && openDates.includes(iso)) return true;
    const wname = WEEKDAY_NAMES[isoToDate(iso)?.getDay()];
    return Array.isArray(allowedDays) && allowedDays.includes(wname);
  };

  const isDateSelectable = (dateObj) => {
    if (!dateObj) return false;
    const ymd = dateToISO(dateObj);
    if (ymd < todayISO) return false;
    return isDateOpenByAvailability(ymd);
  };

  const isDateDisabled = (dateObj) => !isDateSelectable(dateObj);
  const hasBlockedOnDate = (iso) =>
    (entry.blocked || []).some((b) => b.date === iso);

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

    const d = isoToDate(formData.date);
    if (!d || !isDateSelectable(d)) return result;

    const startMin = parseTimeToMinutes(mentoringBlock.start);
    const endMin = parseTimeToMinutes(mentoringBlock.end);
    const dur = parseInt(formData.duration, 10) || 30;
    if (startMin === null || endMin === null || startMin >= endMin)
      return result;

    const blockedForDate = (entry.blocked || []).filter(
      (b) => b.date === formData.date
    );

    const raw = [];
    for (let t = startMin; t + dur <= endMin; t += STEP) {
      const slotStart = t,
        slotEnd = t + dur;

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

    const myBusy = (ownSessions || [])
      .map(normalizeSessionRange)
      .filter(Boolean)
      .filter((r) => !r.cancelled)
      .filter((r) => dateToISO(r.start) === formData.date)
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
    entry.blocked,
    allowedDays,
    openDates,
    closedDates,
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

  const rescheduleViaApi = async (payload) => {
    const sessionId = session?._id || session?.id || session?.sessionId || session?.meetingId;
    if (!sessionId) return null;
    // Align with working update API
    const body = {
      topic: payload.topic,
      reason: payload.reason,
      scheduleStart: payload.startISO, // server expects scheduleStart/End
      scheduleEnd: payload.endISO,
      availabilityVersion: avSig || undefined, // optimistic guard if your backend supports it
    };
    // Prefer PATCH (same as your update flow)
    const primary = await tryFetchJson(`${API}/api/sessions/${sessionId}`, "PATCH", body);
    if (primary) return primary;
    // Fallbacks (in case you also expose a /reschedule route)
    const fallback1 = await tryFetchJson(`${API}/api/sessions/${sessionId}/reschedule`, "POST", body);
    if (fallback1) return fallback1;
    const fallback2 = await tryFetchJson(`${API}/api/sessions/reschedule`, "POST", { sessionId, ...body });
    return fallback2 || null;
  };

  /* === NEW: mentor/participants resolution + notifications === */
  const getCourseMentorId = async () => {
    // Try to pull mentorId from the course doc if available
    if (!courseId) return "";
    const doc = await tryFetchJson(`${API}/api/courses/${courseId}`);
    const fromDoc =
      toIdString(doc?.mentorId) ||
      toIdString(doc?.mentor?._id) ||
      toIdString(doc?.mentor?.id);
    if (fromDoc) return fromDoc;

    // Fallback: try /mine then match by _id
    const mine = await tryFetchJson(`${API}/api/courses/mine`);
    const list = Array.isArray(mine) ? mine : mine?.data || [];
    const found = list.find((c) => toIdString(c._id || c.id) === toIdString(courseId));
    const fromList =
      toIdString(found?.mentorId) ||
      toIdString(found?.mentor?._id) ||
      toIdString(found?.mentor?.id);
    return fromList || "";
  };

  const extractParticipantIdsAndEmails = (sess) => {
    const buckets = [];
    const candidateArrays = [
      sess?.students, sess?.members, sess?.participants, sess?.attendees, sess?.groupMembers
    ];
    for (const arr of candidateArrays) {
      if (Array.isArray(arr) && arr.length) buckets.push(arr);
    }
    const emails = new Set();
    const ids = new Set();

    for (const arr of buckets) {
      for (const item of arr) {
        const norm = normalizeRosterItem(item || {});
        if (norm.id) ids.add(norm.id);
        if (norm.email) emails.add(norm.email);
        // also peek nested user
        const nUser = normalizeRosterItem(item?.user || {});
        if (nUser.id) ids.add(nUser.id);
        if (nUser.email) emails.add(nUser.email);
      }
    }
    return { ids: [...ids], emails: [...emails] };
  };

  async function getParticipantIdsForSession(sess) {
    const ids = new Set();

    const mentorId =
      toIdString(sess?.mentorId || sess?.mentor?._id || sess?.mentor?.id) || "";

    // 1) Grab whatever the session already exposes (ids/emails on students/members/participants/attendees/roster)
    const parts = extractParticipantIdsAndEmails(sess);
    (parts.ids || []).forEach((id) => id && ids.add(toIdString(id)));

    // 2) If there are emails, resolve to IDs
    if ((parts.emails || []).length) {
      const map = await resolveEmailsToIds(parts.emails);
      for (const [, id] of map.entries()) {
        if (id) ids.add(toIdString(id));
      }
    }

    // 3) Still empty? Try common roster endpoints for this session
    if (ids.size === 0) {
      const sessionId = toIdString(
        sess?._id || sess?.id || sess?.sessionId || sess?.meetingId
      );
      if (sessionId) {
        const headers = authHeaders();
        const tryUrls = [
          `${API}/api/sessions/${sessionId}/roster`,
          `${API}/api/sessions/${sessionId}/participants`,
          `${API}/api/sessions/${sessionId}/members`,
          `${API}/api/sessions/${sessionId}`,
          `${API}/api/sessions/roster?sessionId=${encodeURIComponent(sessionId)}`,
          `${API}/api/sessions/${sessionId}/attendees`,
        ];
        for (const url of tryUrls) {
          try {
            const r = await fetch(url, { headers, credentials: "include" });
            if (!r.ok) continue;
            const j = await r.json();

            const asArray = (val) => (Array.isArray(val) ? val : []);
            const pick =
              (Array.isArray(j) && j) ||
              asArray(j?.members) ||
              asArray(j?.groupMembers) ||
              asArray(j?.roster) ||
              asArray(j?.students) ||
              asArray(j?.attendees) ||
              asArray(j?.data?.students) ||
              [];

            const normalized = pick.map((a) =>
              normalizeRosterItem(a?.user || a)
            );
            for (const n of normalized) {
              if (n?.id) ids.add(toIdString(n.id));
            }
            if (ids.size) break;
          } catch {}
        }
      }
    }

    // 4) Filter out mentor & self to avoid duplicate notifications
    const selfId = await getSelfUserId();
    const filtered = [...ids].filter(
      (id) => id && id !== mentorId && id !== selfId
    );

    return [...new Set(filtered)];
  }

  const notifyRescheduleAll = async ({ startISO, endISO, reason, duration }) => {
    try {
      // Old vs new labels
      const oldRange = normalizeSessionRange(session);
      const oldStartISO = oldRange?.start?.toISOString() || session?.startISO || "";
      const oldEndISO   = oldRange?.end?.toISOString()   || session?.endISO   || "";
      const oldLbl = formatDateTimeForNotif(oldStartISO, oldEndISO);
      const newLbl = formatDateTimeForNotif(startISO, endISO);

      const courseLabel = `${session.subject} — ${session.section}`.trim();
      const reasonSuffix = reason ? ` Reason: ${reason}` : "";
      const nowIso = new Date().toISOString();

      // Resolve recipients
      const mentorId =
        toIdString(session?.mentorId || session?.mentor?._id || session?.mentor?.id) ||
        (await getCourseMentorId());

      let participantIds = [];
      try {
        // Prefer booking-style resolution (teammates) — pass the maps
        participantIds = await getTeammateIdsSmart(session, idByEmail, emailByName);
        if (!participantIds.length) {
          // Fallback to old session-roster resolver
          participantIds = await getParticipantIdsForSession(session);
        }
      } catch {
        participantIds = await getParticipantIdsForSession(session);
      }

      // Students / teammates
      for (const pid of participantIds) {
        await sendUnifiedNotification(pid, {
          type: "session",
          title: `Session rescheduled: ${courseLabel} • ${newLbl.label}`,
          message: `Your session for ${courseLabel} was moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          link: "/my-schedule",
          content: `Your session for ${courseLabel} was moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          pageRelated: "/my-schedule",
          createdAt: nowIso,
          meta: {
            subject: session.subject,
            section: session.section,
            courseLabel,
            oldStart: oldStartISO, oldEnd: oldEndISO,
            newStart: startISO,   newEnd: endISO,
            durationMin: Number(duration) || newLbl.durationMin || 0,
            tzShort: newLbl.tzShort,
            actorRole: viewerRole,
          },
        });
      }

      const selfId = await getSelfUserId();

      // Mentor notification
      if (mentorId) {
        await sendUnifiedNotification(mentorId, {
          type: "session",
          title: `Session rescheduled: ${courseLabel} • ${newLbl.label}`,
          message: `Session for ${courseLabel} moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          link: "/mentor/schedule",
          content: `Session for ${courseLabel} moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          pageRelated: "/mentor/schedule",
          createdAt: nowIso,
          meta: {
            subject: session.subject,
            section: session.section,
            courseLabel,
            oldStart: oldStartISO, oldEnd: oldEndISO,
            newStart: startISO,   newEnd: endISO,
            durationMin: Number(duration) || newLbl.durationMin || 0,
            tzShort: newLbl.tzShort,
            actorRole: viewerRole,
          },
        });
      }

      // Students / teammates (duplicate block kept for parity with prior behavior)
      for (const pid of participantIds) {
        await sendUnifiedNotification(pid, {
          type: "session",
          title: `Session rescheduled: ${courseLabel} • ${newLbl.label}`,
          message: `Your session for ${courseLabel} was moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          link: "/my-schedule",
          content: `Your session for ${courseLabel} was moved from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          pageRelated: "/my-schedule",
          createdAt: nowIso,
          meta: {
            subject: session.subject,
            section: session.section,
            courseLabel,
            oldStart: oldStartISO, oldEnd: oldEndISO,
            newStart: startISO,   newEnd: endISO,
            durationMin: Number(duration) || newLbl.durationMin || 0,
            tzShort: newLbl.tzShort,
            actorRole: viewerRole,
          },
        });
      }

      // Actor confirmation
      if (selfId) {
        await sendUnifiedNotification(selfId, {
          type: "session",
          title: `Rescheduled: ${courseLabel} • ${newLbl.label}`,
          message: `You rescheduled ${courseLabel} from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          link: viewerRole === "mentor" ? "/mentor/schedule" : "/my-schedule",
          content: `You rescheduled ${courseLabel} from ${oldLbl.label} to ${newLbl.label}.${reasonSuffix}`,
          pageRelated: viewerRole === "mentor" ? "/mentor/schedule" : "/my-schedule",
          createdAt: nowIso,
          meta: {
            subject: session.subject,
            section: session.section,
            courseLabel,
            oldStart: oldStartISO, oldEnd: oldEndISO,
            newStart: startISO,   newEnd: endISO,
            durationMin: Number(duration) || newLbl.durationMin || 0,
            tzShort: newLbl.tzShort,
            actorRole: viewerRole,
          },
        });
      }
    } catch {
      // silent best-effort
    }
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
      availabilityVersion: avSig || undefined,
    };

    try {
      setSubmitting(true);

      let ok = false;
      if (typeof onReschedule === "function") {
        ok = !!(await onReschedule(payload));
      } else {
        const apiResult = await rescheduleViaApi(payload);
        ok = !!apiResult;
      }

      if (ok) {
        // NEW: fire notifications (best-effort)
        await notifyRescheduleAll({
          startISO,
          endISO,
          reason: reasonTrim,
          duration: Number(formData.duration),
        });

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

  const getNextAllowedDateISO = () => {
    const start = formData.date ? isoToDate(formData.date) : new Date();
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 365; i++) {
      const iso = dateToISO(d);
      if (isDateSelectable(d)) {
        const dayEndCandidate = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          parseInt((mentoringBlock.end || "23:59").split(":")[0] || 23, 10),
          parseInt((mentoringBlock.end || "23:59").split(":")[1] || 59, 10),
          0,
          0
        );
        if (dayEndCandidate.getTime() - Date.now() >= MIN_LEAD_MS) return iso;
      }
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
  const dateAllowed = formData.date
    ? isDateSelectable(isoToDate(formData.date))
    : false;

  const timeDisabled =
    submitting || !formData.date || !dateAllowed || availableTimes.length === 0;

  const reasonTrimmed = formData.reason.trim();
  const newStartOk =
    formData.date && formData.time
      ? isStartAtLeast24hFromNow(formData.date, formData.time)
      : false;

  // NEW: mentors cannot edit topic
  const canEditTopic = viewerRole !== "mentor";

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
                                        : !isDateOpenByAvailability(iso)
                                        ? "Not available for mentoring on this date"
                                        : "Not available"
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
                                    {isDateOpenByAvailability(iso) ? "" : "N/A"}
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
                  <div className="allowed-text">{allowedSummary}</div>
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
                    disabled={timeDisabled}
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
                    Time range: {fmt12(mentoringBlock.start)} — {fmt12(mentoringBlock.end)}
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

                  {canEditTopic ? (
                    <input
                      id="topic"
                      type="text"
                      name="topic"
                      value={formData.topic}
                      onChange={handleChange}
                      placeholder="e.g., Week 4 assignment and project feedback"
                      required
                    />
                  ) : (
                    <>
                      <div
                        className="readonly-field"
                        aria-readonly="true"
                        title="Mentors can't change the topic while rescheduling"
                        style={{
                          padding: "0.6rem 0.75rem",
                          background: "#f8fafc",
                          border: "1px dashed #cbd5e1",
                          borderRadius: 6,
                          color: "#334155",
                        }}
                      >
                        {formData.topic || "—"}
                      </div>
                    </>
                  )}
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
                    style={{ borderRadius: 6 }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ borderRadius: 6 }}
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
                    {submitting ? "Rescheduling…" : "Confirm"}
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

/* ===== Existing helpers kept below ===== */

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
  const map = { M: "Mon", T: "Tue", W: "Wed", TH: "Thu", F: "Fri", SA: "Sat", SU: "Sun" };
  const out = tokens.map((t) => map[t]).filter(Boolean);
  return out.length ? out : null;
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