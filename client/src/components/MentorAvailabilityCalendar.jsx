import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "./MentorAvailabilityCalendar.css";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_FIXED_DAY_CLOSURES = 3;
const FIXED_DAY_GRACE_MS = 24 * 60 * 60 * 1000;
const MIN_MENTORING_MINUTES = 75; // at least 1 hour 15 minutes

/* ---------------- API helpers (adjust base URL/auth if needed) --------------- */
const COURSES_API = "/api/courses"; // or your full origin

function authFetch(url, opts = {}) {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token") || null;

  return fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
}

async function robustJsonOrTextError(res) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    msg = j?.message || msg;
  } catch {
    try {
      msg = await res.text();
    } catch {
      /* ignore */
    }
  }
  throw new Error(msg || `HTTP ${res.status}`);
}

async function getAvailability(courseId) {
  const res = await authFetch(`${COURSES_API}/${courseId}/availability`);
  if (!res.ok) await robustJsonOrTextError(res);
  return res.json();
}
async function patchMentoring(courseId, start, end) {
  const res = await authFetch(`${COURSES_API}/${courseId}/mentoring`, {
    method: "PATCH",
    body: JSON.stringify({ start, end }),
  });
  if (!res.ok) await robustJsonOrTextError(res);
  return res.json(); // { mentoringBlock: { start, end } }
}
async function patchAvailability(courseId, partial) {
  const res = await authFetch(`${COURSES_API}/${courseId}/availability`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
  if (!res.ok) await robustJsonOrTextError(res);
  return res.json(); // availability object
}

/* Resolve various id shapes (_id vs id) */
const getCourseId = (course) => course?.id || course?._id;

/* ---------------- time utils ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const dateToISO = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoToDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
};
function timeToMinutes(t = "00:00") {
  const [hh = "0", mm = "0"] = (t || "").split(":");
  return Number(hh) * 60 + Number(mm);
}
function minutesToTime(m) {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function parse24ToParts(t24 = "07:00") {
  const [hh = "07", mm = "00"] = (t24 || "").split(":");
  let h = Number(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { hour: String(h12), minute: String(mm), ampm };
}
function partsTo24(hourStr, minuteStr, ampm) {
  let h12 = Number(hourStr || "12");
  if (ampm === "AM" && h12 === 12) h12 = 0;
  if (ampm === "PM" && h12 !== 12) h12 += 12;
  return `${String(h12).padStart(2, "0")}:${String(Number(minuteStr)).padStart(2, "0")}`;
}
const t24To12 = (t24 = "07:00") => {
  const { hour, minute, ampm } = parse24ToParts(t24);
  return `${hour}:${minute} ${ampm}`;
};
const normalizeHHMM = (val) => {
  if (!val || typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/* ---------------- week math ---------------- */
const startOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
};
const nextWeekStartISO = (() => {
  const today = new Date();
  const sow = startOfWeek(today);
  const next = new Date(sow);
  next.setDate(sow.getDate() + 7);
  return dateToISO(next);
})();

/* ---------------- parse class time / days helpers ---------------- */
function parseCourseTimeRange(rangeStr = "") {
  const s = String(rangeStr || "").trim();
  if (!s) return null;
  const re = /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/g;
  const matches = [];
  let m;
  while ((m = re.exec(s)) !== null && matches.length < 2) matches.push(m);
  if (matches.length < 2) return null;

  const parseOne = (match) => {
    let [_, hh, mm, mer] = match;
    let h = Number(hh);
    const mins = Number(mm);
    if (Number.isNaN(h) || Number.isNaN(mins)) return null;

    if (mer) {
      const isPM = mer.toLowerCase() === "pm";
      if (h === 12) h = isPM ? 12 : 0;
      else if (isPM) h += 12;
      return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
    return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  };

  const start = parseOne(matches[0]);
  const end = parseOne(matches[1]);
  if (!start || !end) return null;
  return { start, end };
}
const defaultBlockForSectionKey = (selectedKey = "") => {
  const section = (selectedKey.split("__")[1] || "").trim();
  const first = section.charAt(0).toUpperCase();
  let start = "07:00";
  if (first === "H" || first === "B") start = "13:15";
  else if (first === "S") start = "18:15";
  const end = minutesToTime(timeToMinutes(start) + MIN_MENTORING_MINUTES);
  return { start, end };
};
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
      case "T": dow = 2; break; // Tue
      case "W": dow = 3; break;
      case "R": dow = 4; break; // Thu
      case "F": dow = 5; break;
      case "S": dow = 6; break; // Sat
      case "U": dow = 0; break; // Sun
      default: dow = null;
    }
    if (dow !== null) out.push(dow);
    i += 1;
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
};
const dowsToNames = (dows) =>
  (Array.isArray(dows) ? dows : [])
    .map((i) => WEEKDAY_NAMES[i] ?? null)
    .filter(Boolean);

/* ---------------- 24h lock ---------------- */
function isWithin24hOfDateStart(iso) {
  if (!iso) return false;
  const d = isoToDate(iso);
  if (!d) return false;
  const now = new Date();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = startOfDay.getTime() - now.getTime();
  const isToday = iso === dateToISO(now);
  if (isToday) return true;
  return diffMs >= 0 && diffMs < FIXED_DAY_GRACE_MS;
}

/* ---------------- course helpers to pick base time ---------------- */
function pickCourseClassRange(course) {
  if (!course) return null;
  const clsStart = normalizeHHMM(course.classStart || "");
  const clsEnd = normalizeHHMM(course.classEnd || "");
  if (clsStart && clsEnd && timeToMinutes(clsEnd) > timeToMinutes(clsStart)) {
    return { start: clsStart, end: clsEnd };
  }
  if (
    Number.isInteger(course.classStartMin) &&
    Number.isInteger(course.classEndMin)
  ) {
    const start = minutesToTime(course.classStartMin);
    const end = minutesToTime(course.classEndMin);
    if (timeToMinutes(end) > timeToMinutes(start)) return { start, end };
  }
  const parsed =
    parseCourseTimeRange(course.timeStr || "") ||
    parseCourseTimeRange(course.scheduleTimeStr || "");
  if (parsed && timeToMinutes(parsed.end) > timeToMinutes(parsed.start)) {
    return parsed;
  }
  return null;
}
function pickCourseMentoringDefault(course) {
  if (!course) return null;
  const ds = normalizeHHMM(course.mentoringDefaultStart || "");
  const de = normalizeHHMM(course.mentoringDefaultEnd || "");
  if (ds && de && timeToMinutes(de) > timeToMinutes(ds)) return { start: ds, end: de };
  return null;
}
function pickCourseMentoringOverride(course) {
  if (!course) return null;
  const os = normalizeHHMM(course.mentoringOverrideStart || "");
  const oe = normalizeHHMM(course.mentoringOverrideEnd || "");
  if (os && oe && timeToMinutes(oe) > timeToMinutes(os)) return { start: os, end: oe };
  return null;
}

export default function MentorAvailabilityCalendar({
  subjectSectionPairs = [], // must include { id or _id, subject, section, schedule?.days/time, mentoringOverrideStart/End? }
  onClose,
}) {
  const [store, setStore] = useState({});
  const [selectedKey, setSelectedKey] = useState(
    subjectSectionPairs.length
      ? `${subjectSectionPairs[0].subject}__${subjectSectionPairs[0].section}`
      : ""
  );
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(dateToISO(new Date()));

  const [startHour, setStartHour] = useState("7");
  const [startMinute, setStartMinute] = useState("00");
  const [startAmpm, setStartAmpm] = useState("AM");
  const [endHour, setEndHour] = useState("8");
  const [endMinute, setEndMinute] = useState("15");
  const [endAmpm, setEndAmpm] = useState("AM");

  const [editingMentorTime, setEditingMentorTime] = useState(false);

  const [confirmClose, setConfirmClose] = useState({ open: false, iso: "", weekday: "" });
  const [confirmTimeSave, setConfirmTimeSave] = useState({ open: false, start: "", end: "" });

  const prevSelectedKey = useRef(null);

  // Toast
  const [toast, setToast] = useState({ id: null, msg: "", type: "info" });
  const toastTimer = useRef(null);
  const toastRaf = useRef(0);

  const showToast = (msg, type = "info", duration = 3000) => {
    if (!msg) return;
    if (toastTimer.current) { clearTimeout(toastTimer.current); toastTimer.current = null; }
    if (toastRaf.current) { cancelAnimationFrame(toastRaf.current); toastRaf.current = 0; }
    setToast((t) => ({ ...t, msg: "" }));
    toastRaf.current = requestAnimationFrame(() => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToast({ id, msg, type });
      toastTimer.current = setTimeout(() => {
        setToast((t) => ({ ...t, msg: "" }));
        toastTimer.current = null;
      }, duration);
    });
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (toastRaf.current) cancelAnimationFrame(toastRaf.current);
    };
  }, []);

  /* ---------- DB-driven base days/time for the currently selected course ---------- */
  const selectedCourseInfo = useMemo(() => {
    const idx = subjectSectionPairs.findIndex(
      (p) => `${p.subject}__${p.section}` === selectedKey
    );
    if (idx < 0) return null;
    return subjectSectionPairs[idx];
  }, [selectedKey, subjectSectionPairs]);

  const baseAllowedDow = useMemo(() => {
    if (!selectedCourseInfo) return [];
    if (Array.isArray(selectedCourseInfo.allowedDow) && selectedCourseInfo.allowedDow.length) {
      return selectedCourseInfo.allowedDow.slice().sort((a, b) => a - b);
    }
    const daysStr = selectedCourseInfo?.daysStr || selectedCourseInfo?.schedule?.days || "";
    if (daysStr) return parseDaysStringToDow(daysStr);
    return [];
  }, [selectedCourseInfo]);

  const baseAllowedDays = useMemo(() => dowsToNames(baseAllowedDow), [baseAllowedDow]);

  const computeCourseDefaultBlock = useCallback(() => {
    const override = pickCourseMentoringOverride(selectedCourseInfo);
    if (override) return override;

    const def = pickCourseMentoringDefault(selectedCourseInfo);
    if (def) return def;

    const timeStr =
      selectedCourseInfo?.timeStr ??
      selectedCourseInfo?.scheduleTimeStr ??
      selectedCourseInfo?.schedule?.time ??
      "";
    const parsed = parseCourseTimeRange(timeStr);
    if (parsed && timeToMinutes(parsed.end) > timeToMinutes(parsed.start)) {
      return parsed;
    }
    return defaultBlockForSectionKey(selectedKey);
  }, [selectedCourseInfo, selectedKey]);

  /* ---------- Initialize/hydrate per course key + fetch availability from API ---------- */
  useEffect(() => {
    if (!selectedKey) return;

    const init = async () => {
      const entry = store[selectedKey];
      const baseBlock = computeCourseDefaultBlock();
      let nextEntry = {
        mentoringBlock: { start: baseBlock.start, end: baseBlock.end },
        allowedDays: baseAllowedDays.slice(),
        openDates: [],
        closedDates: [],
        closedMeta: {},
      };

      // Hydrate from backend if we have course id
      try {
        const cid = getCourseId(selectedCourseInfo);
        if (cid) {
          const av = await getAvailability(cid);
          if (av?.mentoringBlock?.start && av?.mentoringBlock?.end) {
            nextEntry.mentoringBlock = {
              start: av.mentoringBlock.start,
              end: av.mentoringBlock.end,
            };
          }
          nextEntry.allowedDays =
            Array.isArray(av.allowedDays) && av.allowedDays.length
              ? av.allowedDays
              : nextEntry.allowedDays;
          nextEntry.openDates = Array.isArray(av.openDates) ? av.openDates : [];
          nextEntry.closedDates = Array.isArray(av.closedDates) ? av.closedDates : [];
          nextEntry.closedMeta = av.closedMeta || {};
        }
      } catch (e) {
        // Non-blocking; you can toast if you want visibility:
        // showToast(e?.message || "Failed to load availability.", "error");
        console.warn("Availability init failed:", e);
      }

      const sParts = parse24ToParts(nextEntry.mentoringBlock.start);
      const eParts = parse24ToParts(nextEntry.mentoringBlock.end);
      setStartHour(sParts.hour); setStartMinute(sParts.minute); setStartAmpm(sParts.ampm);
      setEndHour(eParts.hour); setEndMinute(eParts.minute); setEndAmpm(eParts.ampm);

      setStore((s) => ({ ...s, [selectedKey]: entry || nextEntry }));
      setSelectedDate(dateToISO(new Date()));
      setEditingMentorTime(false);
      prevSelectedKey.current = selectedKey;
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, baseAllowedDays, computeCourseDefaultBlock]);

  const persist = (partial) =>
    setStore((s) => ({
      ...s,
      [selectedKey]: { ...(s[selectedKey] || {}), ...(partial || {}) },
    }));

  /* ---------- Range validation (order + minimum duration) ---------- */
  const checkMentoringRange = (start24, end24) => {
    const s = timeToMinutes(start24);
    const e = timeToMinutes(end24);
    if (e <= s) return "End time must be later than start time.";
    if (e - s < MIN_MENTORING_MINUTES)
      return "Mentoring time must be at least 1 hour 15 minutes.";
    return null;
  };

  const saveMentoring = () => {
    const start24 = partsTo24(startHour, startMinute, startAmpm);
    const end24 = partsTo24(endHour, endMinute, endAmpm);

    const err = checkMentoringRange(start24, end24);
    if (err) { showToast(err, "error"); return false; }
    persist({ mentoringBlock: { start: start24, end: end24 } });
    setEditingMentorTime(false);
    showToast("Mentoring time saved.", "success");
    return true;
  };

  const onEditSaveClick = () => {
    if (!editingMentorTime) { setEditingMentorTime(true); return; }
    const start24 = partsTo24(startHour, startMinute, startAmpm);
    const end24 = partsTo24(endHour, endMinute, endAmpm);

    const err = checkMentoringRange(start24, end24);
    if (err) { showToast(err, "error"); return; }
    const entry = store[selectedKey] || {};
    if (start24 === (entry.mentoringBlock?.start || "") &&
        end24 === (entry.mentoringBlock?.end || "")) {
      setEditingMentorTime(false);
      showToast("No changes to save.", "info");
      return;
    }
    setConfirmTimeSave({ open: true, start: start24, end: end24 });
  };

  const confirmSaveMentoring = async () => {
    const err = checkMentoringRange(confirmTimeSave.start, confirmTimeSave.end);
    if (err) { showToast(err, "error"); return; }
    try {
      const courseId = getCourseId(selectedCourseInfo);
      if (!courseId) throw new Error("Missing course id");
      await patchMentoring(courseId, confirmTimeSave.start, confirmTimeSave.end);
      persist({ mentoringBlock: { start: confirmTimeSave.start, end: confirmTimeSave.end } });
      setEditingMentorTime(false);
      setConfirmTimeSave({ open: false, start: "", end: "" });
      showToast("Mentoring time saved.", "success");
    } catch (e) {
      showToast(e?.message || "Failed to save mentoring time.", "error");
    }
  };

  const resetMentoringTime = () => {
    if (!selectedKey) return;
    const { start, end } = computeCourseDefaultBlock();

    const sParts = parse24ToParts(start);
    const eParts = parse24ToParts(end);
    setStartHour(sParts.hour);
    setStartMinute(sParts.minute);
    setStartAmpm(sParts.ampm);
    setEndHour(eParts.hour);
    setEndMinute(eParts.minute);
    setEndAmpm(eParts.ampm);

    showToast(
      `Default time loaded (${t24To12(start)} – ${t24To12(end)}). Press Save to apply.`,
      "info"
    );
  };

  const entry = store[selectedKey] || {
    mentoringBlock: {
      start: partsTo24(startHour, startMinute, startAmpm),
      end: partsTo24(endHour, endMinute, endAmpm),
    },
    allowedDays: baseAllowedDays.slice(),
    openDates: [],
    closedDates: [],
    closedMeta: {},
  };

  const todayISO = dateToISO(new Date());
  const selectedIsPast = !selectedDate ? false : selectedDate < todayISO;

  const closedFixedCount = (entry.closedDates || []).length;
  const remainingFixed = Math.max(0, MAX_FIXED_DAY_CLOSURES - closedFixedCount);

  const isWithinGrace = (iso) => {
    const ts = entry.closedMeta?.[iso];
    if (!ts) return false;
    return Date.now() - ts <= FIXED_DAY_GRACE_MS;
  };

  const selectedDateObj = isoToDate(selectedDate);
  const selectedWeekday = selectedDateObj
    ? WEEKDAY_NAMES[selectedDateObj.getDay()]
    : "";
  const isSelectedBaseAllowed = (entry.allowedDays || []).includes(selectedWeekday);
  const isSelectedClosedFixed =
    isSelectedBaseAllowed && (entry.closedDates || []).includes(selectedDate);
  const canReopenSelectedClosedFixed =
    isSelectedClosedFixed && isWithinGrace(selectedDate);
  const isSelectedInCurrentWeekFuture =
    !!selectedDate &&
    selectedDate >= todayISO &&
    selectedDate < nextWeekStartISO;

  const isDateCurrentlyOpen = (() => {
    if (!selectedDate) return false;
    const iso = selectedDate;

    if ((entry.closedDates || []).includes(iso)) return false;
    if ((entry.openDates || []).includes(iso)) return true;

    const weekday = WEEKDAY_NAMES[isoToDate(selectedDate)?.getDay()];
    return (entry.allowedDays || []).includes(weekday);
  })();

  const canOpenSelectedDateForStudents =
    !selectedIsPast &&
    !(isSelectedClosedFixed && !canReopenSelectedClosedFixed);

  const requestCloseFixedDate = (iso, weekday) => {
    if (iso < nextWeekStartISO) {
      showToast(`Fixed days can only be marked unavailable starting next week`, "error");
      return;
    }
    const alreadyClosed = (entry.closedDates || []).includes(iso);
    if (!alreadyClosed && remainingFixed <= 0) {
      showToast(
        `Limit reached: You can close up to ${MAX_FIXED_DAY_CLOSURES} fixed days for this course.`,
        "error"
      );
      return;
    }
    setConfirmClose({ open: true, iso, weekday });
  };

  const confirmCloseNow = async () => {
    const iso = confirmClose.iso;
    const closedDates = Array.from(new Set([...(entry.closedDates || []), iso]));
    const openDates = (entry.openDates || []).filter((x) => x !== iso);
    const closedMeta = { ...(entry.closedMeta || {}), [iso]: Date.now() };

    try {
      const cid = getCourseId(selectedCourseInfo);
      if (!cid) throw new Error("Missing course id");
      await patchAvailability(cid, { openDates, closedDates, closedMeta });
      persist({ openDates, closedDates, closedMeta });
      setConfirmClose({ open: false, iso: "", weekday: "" });
      showToast("Marked fixed day unavailable.", "success");
    } catch (e) {
      showToast(e?.message || "Failed to save availability.", "error");
    }
  };
  const cancelClose = () => setConfirmClose({ open: false, iso: "", weekday: "" });

  const onToggleOpen = async (checked) => {
    if (!selectedDate) return;
    if (selectedIsPast) return;

    const iso = selectedDate;
    const weekday = WEEKDAY_NAMES[isoToDate(iso)?.getDay()];
    const baseAllowed = (entry.allowedDays || []).includes(weekday);
    const isClosedFixed =
      baseAllowed && (entry.closedDates || []).includes(iso);

    if (checked) {
      if (isWithin24hOfDateStart(iso)) {
        showToast("You can’t open a date less than 24 hours in advance.", "error");
        return;
      }

      if (isClosedFixed) {
        if (isWithinGrace(iso)) {
          const closedDates = (entry.closedDates || []).filter((x) => x !== iso);
          const { [iso]: _, ...restMeta } = entry.closedMeta || {};
          try {
            const cid = getCourseId(selectedCourseInfo);
            if (!cid) throw new Error("Missing course id");
            await patchAvailability(cid, {
              openDates: entry.openDates || [],
              closedDates,
              closedMeta: restMeta,
            });
            persist({ openDates: entry.openDates || [], closedDates, closedMeta: restMeta });
            showToast("Reopened (within grace window).", "success");
          } catch (e) {
            showToast(e?.message || "Failed to save availability.", "error");
          }
        } else {
          showToast("This fixed day was closed and can’t be reopened (grace period ended).", "error");
        }
        return;
      }
      const closedDates = (entry.closedDates || []).filter((x) => x !== iso);
      const openDates = baseAllowed
        ? entry.openDates || []
        : Array.from(new Set([...(entry.openDates || []), iso]));
      try {
        const cid = getCourseId(selectedCourseInfo);
        if (!cid) throw new Error("Missing course id");
        await patchAvailability(cid, { openDates, closedDates });
        persist({ openDates, closedDates });
      } catch (e) {
        showToast(e?.message || "Failed to save availability.", "error");
      }
      return;
    } else {
      if (baseAllowed) {
        if (iso < nextWeekStartISO) {
          showToast(`Fixed days can only be marked unavailable starting next week`, "error");
          return;
        }
        requestCloseFixedDate(iso, weekday);
        return;
      } else {
        const openDates = (entry.openDates || []).filter((x) => x !== iso);
        try {
          const cid = getCourseId(selectedCourseInfo);
          if (!cid) throw new Error("Missing course id");
          await patchAvailability(cid, { openDates });
          persist({ openDates });
        } catch (e) {
          showToast(e?.message || "Failed to save availability.", "error");
        }
        return;
      }
    }
  };

  const formatLongUS = (iso) => {
    const d = isoToDate(iso);
    if (!d) return iso;
    return d.toLocaleString(undefined, { month: "long", day: "numeric", year: "numeric" });
  };

  /* ---------- Month grid ---------- */
  const daysGrid = useMemo(() => {
    const m = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const first = m.getDay();
    const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const rows = [];
    let week = new Array(7).fill(null);
    let d = 1;
    for (let i = 0; i < first; i++) week[i] = null;
    for (let i = first; i < 7; i++)
      week[i] = new Date(m.getFullYear(), m.getMonth(), d++);
    rows.push(week);
    while (d <= dim) {
      const w = new Array(7).fill(null);
      for (let i = 0; i < 7 && d <= dim; i++)
        w[i] = new Date(m.getFullYear(), m.getMonth(), d++);
      rows.push(w);
    }
    return rows;
  }, [viewMonth]);

  const formattedSelectedDate = (() => {
    const d = isoToDate(selectedDate);
    if (!d) return selectedDate;
    return `${d.getDate()} ${d.toLocaleString(undefined, { month: "long" })} ${d.getFullYear()}`;
  })();

  // labels
  const savedStart24 = entry?.mentoringBlock?.start ?? partsTo24(startHour, startMinute, startAmpm);
  const savedEnd24   = entry?.mentoringBlock?.end   ?? partsTo24(endHour, endMinute, endAmpm);
  const draftStart24 = partsTo24(startHour, startMinute, startAmpm);
  const draftEnd24   = partsTo24(endHour, endMinute, endAmpm);
  const isDraftDifferent = editingMentorTime && (draftStart24 !== savedStart24 || draftEnd24 !== savedEnd24);
  const remainingAfterConfirm = Math.max(0, remainingFixed - 1);
  const isWithin24hLockOpenSelected = isWithin24hOfDateStart(selectedDate);

  const toggleTitle = selectedIsPast
    ? "Past dates cannot be modified"
    : (!isDateCurrentlyOpen && isWithin24hLockOpenSelected)
    ? "You can’t open a date less than 24 hours in advance."
    : isSelectedClosedFixed && !canReopenSelectedClosedFixed
    ? "This fixed day was closed and can’t be reopened (grace period ended)."
    : isSelectedBaseAllowed && isSelectedInCurrentWeekFuture
    ? `Fixed days can only be marked unavailable starting next week`
    : isSelectedClosedFixed && canReopenSelectedClosedFixed
    ? "This fixed day was closed; you can reopen within the 24-hour grace period."
    : undefined;

  const getToggleDisabledReason = () => {
    if (editingMentorTime) return "Save mentoring time to continue.";
    if (selectedIsPast) return "Past dates cannot be modified.";
    if (isSelectedBaseAllowed && isSelectedInCurrentWeekFuture)
      return "Fixed days can only be marked unavailable starting next week.";
    if (isSelectedClosedFixed && !canReopenSelectedClosedFixed)
      return "This fixed day was closed and can’t be reopened (grace period ended).";
    return "";
  };

  const classTimeLabel = useMemo(() => {
    const rng = pickCourseClassRange(selectedCourseInfo);
    if (!rng) return "";
    return `${t24To12(rng.start)} – ${t24To12(rng.end)}`;
  }, [selectedCourseInfo]);

  return (
    <>
      {toast.msg &&
        createPortal(
          <div key={toast.id} className={`toast vsm ${toast.type}`} role="status" aria-live="polite" aria-atomic="true">
            {toast.msg}
          </div>,
          document.body
        )}

      {/* Confirm close fixed-day modal */}
      {confirmClose.open && (
        <div className="mini-modal-overlay" role="dialog" aria-modal="true">
          <div className="mini-modal">
            <h4 className="mini-modal-title">Mark this fixed day unavailable?</h4>
            <p className="mini-modal-text">
              You’re about to mark <strong>{confirmClose.weekday}</strong> ({formatLongUS(confirmClose.iso)}) as <strong>unavailable</strong> for students.
            </p>
            <p className="mini-modal-text">
              This will count toward your limit of {MAX_FIXED_DAY_CLOSURES} closed fixed days for this course. You can undo this within the next <strong>24 hours</strong>; after that, it becomes permanent.
            </p>
            <p className="mini-modal-text">
              Limit: {MAX_FIXED_DAY_CLOSURES}. Used: {closedFixedCount}. Remaining <em>after</em> this action: <strong>{remainingAfterConfirm}</strong>.
            </p>
            <div className="mini-modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmClose({ open: false, iso: "", weekday: "" })}>
                Cancel
              </button>
              <button className="btn-danger" onClick={confirmCloseNow}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm save mentoring time modal */}
      {confirmTimeSave.open && (
        <div className="mini-modal-overlay" role="dialog" aria-modal="true">
          <div className="mini-modal">
            <h4 className="mini-modal-title">Save mentoring time?</h4>
            <p className="mini-modal-text">
              Update mentoring time to <strong>{t24To12(confirmTimeSave.start)}</strong> – <strong>{t24To12(confirmTimeSave.end)}</strong>. This applies to the entire term.
            </p>
            <div className="mini-modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmTimeSave({ open: false, start: "", end: "" })}>Back</button>
              {/* Same shape as Back, but tinted */}
              <button className="btn-ghost btn-confirm" onClick={confirmSaveMentoring}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <div className="mac-overlay" role="dialog" aria-modal="true">
        <div className="mac-panel">
          <div className="mac-header">
            <h3>Manage Availability</h3>
            <div className="mac-actions">
              {onClose && <button className="btn-ghost" onClick={onClose}>Close</button>}
            </div>
          </div>

          <div className="mac-body">
            <aside className="mac-left" aria-label="Calendar and course controls">
              <label className="label">Course</label>
              <select className="select" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={editingMentorTime}>
                {subjectSectionPairs.map((p) => {
                  const k = `${p.subject}__${p.section}`;
                  return (
                    <option key={k} value={k}>
                      {p.subject} — {p.section}
                    </option>
                  );
                })}
              </select>

              <div className="panel-block small-calendar">
                <div className="calendar-controls">
                  <button className="nav-btn" onClick={() => (editingMentorTime ? showToast("Save mentoring time to continue.", "error") : setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)))} disabled={editingMentorTime}>◀</button>
                  <div className="month-label">
                    {viewMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
                  </div>
                  <button className="nav-btn" onClick={() => (editingMentorTime ? showToast("Save mentoring time to continue.", "error") : setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)))} disabled={editingMentorTime}>▶</button>
                </div>

                <table className="mac-calendar" role="grid" aria-label="Availability calendar">
                  <thead>
                    <tr>{WEEKDAY_NAMES.map((w) => <th key={w}>{w.slice(0, 3)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {daysGrid.map((week, i) => (
                      <tr key={i}>
                        {week.map((cell, j) => {
                          if (!cell) return <td key={j} className="empty" aria-hidden="true" />;
                          const iso = dateToISO(cell);
                          const isSelected = iso === selectedDate;

                          const studentAllowed = (() => {
                            if ((entry.closedDates || []).includes(iso)) return false;
                            if ((entry.openDates || []).includes(iso)) return true;
                            const weekday = WEEKDAY_NAMES[cell.getDay()];
                            return (entry.allowedDays || []).includes(weekday);
                          })();

                          const isClosed = (entry.closedDates || []).includes(iso);
                          const isPastDate = iso < dateToISO(new Date());

                          let cellClasses = ["cal-cell"];
                          if (isSelected) cellClasses.push("selected");
                          if (studentAllowed && !isPastDate) cellClasses.push("allowed");
                          if (!studentAllowed || isPastDate) cellClasses.push("disabled");
                          if (isClosed) cellClasses.push("closed-fixed");

                          return (
                            <td key={j} className={cellClasses.join(" ")}>
                              <button
                                className={`date-btn ${editingMentorTime ? "locked" : ""}`}
                                onClick={() => {
                                  if (editingMentorTime) return showToast("Save mentoring time to continue.", "error");
                                  if (isPastDate) return showToast("Past dates can’t be modified.", "error");
                                  setSelectedDate(iso);
                                }}
                                title={isPastDate ? "Past date" : studentAllowed ? "Student can book this date" : "Student cannot book this date (mentor can still manage it)"}
                              >
                                <span className="day">{cell.getDate()}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="base-days-info">
                  {baseAllowedDays.length > 0 ? (
                    <>
                      Fixed days:{" "}
                      <strong>
                        {selectedCourseInfo?.daysStr ||
                          selectedCourseInfo?.schedule?.days ||
                          baseAllowedDays.join("")}
                      </strong>{" "}
                      - {baseAllowedDays.join(", ")}
                      {classTimeLabel && <> • Class time: <strong>{classTimeLabel}</strong></>}
                    </>
                  ) : (
                    <>No fixed days found in course schedule. Please update <code>course.schedule.days</code> in the DB.</>
                  )}
                </div>
                <div className="base-days-limit">
                  Fixed-day offs remaining for this course: <strong>{remainingFixed}</strong> / {MAX_FIXED_DAY_CLOSURES}
                </div>
                <div className="base-days-limit">
                  You can mark fixed days unavailable starting <strong>next week</strong>.
                </div>
              </div>
            </aside>

            <div className="mac-right-stack">
              <section className="mac-right" aria-live="polite">
                <h4 className="course-title">
                  {selectedKey ? selectedKey.replace("__", " — ") : "No course selected"}
                </h4>

                <div className="date-section">
                  <div className="date-row">
                    <div className="date-and-weekday">
                      <div className="date-text">{formattedSelectedDate}</div>
                      <div className="weekday">
                        {(() => {
                          const d = isoToDate(selectedDate);
                          if (!d) return "";
                          return WEEKDAY_NAMES[d.getDay()];
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="toggle-row">
                    <label
                      className="toggle-label"
                      title={toggleTitle}
                      onClick={(e) => {
                        const reason = getToggleDisabledReason();
                        if (reason) {
                          e.preventDefault();
                          e.stopPropagation();
                          showToast(reason, "error");
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDateCurrentlyOpen}
                        onChange={(e) => {
                          if (editingMentorTime) return showToast("Save mentoring time to continue.", "error");
                          onToggleOpen(e.target.checked);
                        }}
                        disabled={!canOpenSelectedDateForStudents || editingMentorTime}
                        aria-checked={isDateCurrentlyOpen}
                        className="toggle-input"
                      />
                      <span className={`toggle-switch ${isDateCurrentlyOpen ? "on" : ""}`}>
                        <span className="toggle-knob" />
                      </span>
                      <span className="toggle-text">Allow students to book this date</span>
                    </label>

                    {!isDateCurrentlyOpen && isWithin24hLockOpenSelected && (
                      <div className="toggle-disabled-text below-toggle">
                        You can’t open a date less than 24 hours in advance.
                      </div>
                    )}

                    {isSelectedBaseAllowed && isSelectedInCurrentWeekFuture && (
                      <div className="toggle-disabled-text below-toggle">
                        Fixed days can only be marked unavailable starting next week.
                      </div>
                    )}

                    {isSelectedClosedFixed && (
                      <div className="toggle-disabled-text below-toggle">
                        {canReopenSelectedClosedFixed
                          ? "Closed (fixed day) — you can reopen within the 24-hour grace period."
                          : "Closed (fixed day) — reopening is no longer allowed (grace period ended)."}
                      </div>
                    )}
                  </div>

                  {selectedIsPast && (
                    <div className="toggle-disabled-text below-toggle">
                      Past dates cannot be opened/closed or edited.
                    </div>
                  )}
                </div>
              </section>

              <div
                className="bookings-card"
                role="region"
                aria-labelledby="availability-heading"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <div className="mentoring-in-bookings">
                  <div className="muted-title-row">
                    <div
                      className="muted-title"
                      style={{
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>Mentoring Time</span>
                      <span style={{ color: "#6b7280", fontWeight: 500 }}>
                        — {t24To12(savedStart24)} to {t24To12(savedEnd24)}
                      </span>
                    </div>

                    <div className="inline-actions">
                      <button
                        type="button"
                        className={editingMentorTime ? "btn-primary" : "btn-outline"}
                        onClick={onEditSaveClick}
                        title={editingMentorTime ? "Save mentoring time" : "Edit mentoring time"}
                        aria-label={editingMentorTime ? "Save mentoring time" : "Edit mentoring time"}
                      >
                        {editingMentorTime ? "Save" : "Edit"}
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
                    This applies to the entire duration of the term.
                  </div>

                  {editingMentorTime && (
                    <div className="edit-lock-note">
                      Save your mentoring time to continue using the calendar and other actions.
                    </div>
                  )}

                  <div className="mentoring-grid">
                    <div className="selects-wrapper">
                      <div className="time-label">Start</div>
                      <div className="selects-row">
                        <select className="select small" value={startHour} onChange={(e) => setStartHour(e.target.value)} disabled={!editingMentorTime}>
                          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <select className="select small" value={startMinute} onChange={(e) => setStartMinute(e.target.value)} disabled={!editingMentorTime}>
                          {["00", "15", "30", "45"].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select className="select small" value={startAmpm} onChange={(e) => setStartAmpm(e.target.value)} disabled={!editingMentorTime}>
                          <option>AM</option><option>PM</option>
                        </select>
                      </div>
                    </div>

                    <div className="selects-wrapper">
                      <div className="time-label">End</div>
                      <div className="selects-row">
                        <select className="select small" value={endHour} onChange={(e) => setEndHour(e.target.value)} disabled={!editingMentorTime}>
                          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <select className="select small" value={endMinute} onChange={(e) => setEndMinute(e.target.value)} disabled={!editingMentorTime}>
                          {["00", "15", "30", "45"].map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select className="select small" value={endAmpm} onChange={(e) => setEndAmpm(e.target.value)} disabled={!editingMentorTime}>
                          <option>AM</option><option>PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {editingMentorTime && (
                  <div
                    className="mentoring-inline-controls"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginTop: "auto",
                      paddingTop: 12,
                      borderTop: "1px solid #e5e7eb",
                    }}
                  >
                    <span
                      style={{
                        color: "#9ca3af",
                        fontStyle: "italic",
                        fontWeight: 500,
                        fontSize: 12,
                      }}
                    >
                      {isDraftDifferent
                        ? `(editing: ${t24To12(draftStart24)} to ${t24To12(draftEnd24)})`
                        : " "}
                    </span>

                    <button
                      type="button"
                      className="btn-outline"
                      onClick={resetMentoringTime}
                      title="Load the course default time (press Save to apply)"
                    >
                      Reset to default
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}