// src/pages/mentor/MentorSessionNotes.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "../student/SessionNotes.css";
import "../student/MySchedule.css"; // bring in the same skeleton styles used by MySchedule
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import { useCourseColor } from "../../context/CourseColorContext";
import { useAuth } from "../../context/AuthContext";
import * as programYearUtils from "../../utils/programYear";

const { getProgramFromCode, getYearFromSectionDigit, ordinal } = programYearUtils;

const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");

const pick = (...cands) => {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
};

// ===== time range helpers (local time, same-day compression) =====
function fmtDateMDY(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}
function fmtTime12h(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function formatLocalRange(startISO, endISO) {
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;
  if (!start || isNaN(start.getTime())) return "—";
  const endEff = end && !isNaN(end.getTime()) ? end : new Date(start.getTime() + 30 * 60 * 1000);
  const sameDay =
    start.getFullYear() === endEff.getFullYear() &&
    start.getMonth() === endEff.getMonth() &&
    start.getDate() === endEff.getDate();
  if (sameDay) {
    // e.g., November 2, 2025, 10:00 AM – 11:00 AM
    const longDate = start.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return `${longDate}, ${fmtTime12h(start)} – ${fmtTime12h(endEff)}`;
  }
  // cross-day range
  return `${fmtDateMDY(start)} ${fmtTime12h(start)} – ${fmtDateMDY(endEff)} ${fmtTime12h(endEff)}`;
}

export default function MentorSessionNotes() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth <= 1152;

  const { getCourseColor } = useCourseColor();
  const { user } = useAuth();

  // auth header
  const rawToken = user?.token || user?.jwt || localStorage.getItem("token") || "";
  const normToken = useMemo(() => (rawToken?.startsWith("Bearer ") ? rawToken.slice(7) : rawToken), [rawToken]);
  const authHeaders = useMemo(() => (normToken ? { Authorization: `Bearer ${normToken}` } : {}), [normToken]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [notesData, setNotesData] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setFetchError("");
      try {
        const res = await axios.get(`${API}/api/session-notes/mine`, {
          headers: authHeaders,
          withCredentials: false,
        });
        const apiNotes = Array.isArray(res.data?.notes) ? res.data.notes : [];
        if (!alive) return;
        setNotesData(apiNotes);
      } catch (err) {
        const code = err?.response?.status || "ERR";
        const msg = err?.response?.data?.message || err?.message || "Failed to load";
        if (alive) setFetchError(`${code}: ${msg}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [API, authHeaders]);

  // Normalize (use authoritative schedule start/end; never updatedAt)
  const normalized = useMemo(() => {
    return (notesData || []).map((n) => {
      const rs = n.rawSession || {};

      const subject = pick(
        n.subject, n.subjectText,
        rs.subject?.code, rs.subject?.name,
        rs.courseCode, rs.courseName
      );

      const section = pick(
        n.section, n.sectionText,
        rs.section?.name, rs.section?.code,
        rs.sectionName, rs.sectionCode, rs.block, rs.section
      );

      const topic = pick(n.topic, rs.topic);

      // Prefer session.scheduleStart/End; then API-provided dateTimeISO/endISO
      const dateTimeISO = pick(
        rs.scheduleStart,
        n.dateTimeISO,
        rs.startISO,
        rs.startDateTime
      );

      const endISO = pick(
        rs.scheduleEnd,
        n.endISO,
        rs.endISO
      );

      // Prefer API-provided students; fallback to deriving names from participants
      const fromApi = Array.isArray(n.students) ? n.students.filter(Boolean) : [];
      let fallback = [];
      const parts = rs.participants || [];
      if (!fromApi.length && Array.isArray(parts)) {
        fallback = parts
          .map((p) => {
            if (!p) return "";
            if (typeof p === "string") return "";
            if (p.user && (p.user.name || p.user.firstName || p.user.lastName)) {
              return p.user.name || [p.user.firstName, p.user.lastName].filter(Boolean).join(" ");
            }
            return p.name || [p.firstName, p.lastName].filter(Boolean).join(" ");
          })
          .filter(Boolean);
      }

      return {
        ...n,
        subject,
        section,
        topic,
        dateTimeISO: dateTimeISO || "",
        endISO: endISO || "",
        students: fromApi.length ? fromApi : fallback,
      };
    });
  }, [notesData]);

  // Filter + sort (match student page: "All")
  const [filter, setFilter] = useState("All");

  const subjects = useMemo(
    () => Array.from(new Set(normalized.map((n) => n.subject))).filter(Boolean).sort(),
    [normalized]
  );

  const filtered = normalized.filter((n) => filter === "All" || n.subject === filter);

  const sortedNotes = filtered
    .map((note) => ({ ...note, _ts: note.dateTimeISO ? new Date(note.dateTimeISO).getTime() : NaN }))
    .sort((a, b) => (isNaN(b._ts) ? -1 : b._ts) - (isNaN(a._ts) ? -1 : a._ts));

  // Labels
  const formatStudentDisplay = (students) =>
    !students || students.length === 0 ? "—" : students.join(", ");
  const getStudentLabel = (students) => (students && students.length === 1 ? "Student" : "Students");

  // Popup
  const openFloatingNote = (note) => {
    const qs = new URLSearchParams({
      id: note.sessionId || note.id,
      subject: note.subject || "",
      section: note.section || "",
      topic: note.topic || "",
      mentorName: user?.name || "Mentor",
      studentNames: formatStudentDisplay(note.students), // for mentor view identity block
      // pass authoritative start/end so popup shows exact range
      startISO: note.dateTimeISO || "",
      endISO: note.endISO || "",
      dateTimeISO: note.dateTimeISO || "", // backward-compat
      hideBack: "1",
    }).toString();

    const win = window.open(
      `/session-notes-popup?${qs}`,
      "MentEaseNotes",
      "width=560,height=640,left=100,top=100"
    );
    if (win) { try { win.focus(); } catch {} }
  };

  // Skeletons — match EXACT structure/classes used by MySchedule
  const renderSkeletons = (count = 3) => (
    <div className="schedule-list" role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
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
      <span className="sr-only">Loading session notes…</span>
    </div>
  );

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Session Notes" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <div className="header-row">
              <h2>Session Notes</h2>

              <select
                className="filter-dropdown"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={loading}
              >
                <option value="All">All</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {fetchError && !loading && (
              <div className="inline-error" style={{ marginBottom: 12, color: "#b91c1c" }}>
                {fetchError}
              </div>
            )}

            {loading ? (
              renderSkeletons(3)
            ) : (
              <div className="schedule-list">
                {sortedNotes.map((note) => {
                  const accent = getCourseColor(note.subject || note.section);
                  const whenRange = formatLocalRange(note.dateTimeISO, note.endISO);

                  return (
                    <div className="schedule-card is-colored" key={note.id} style={{ "--accent": accent }}>
                      <div className="year-chip" aria-hidden="true">
                        {(() => {
                          const program = getProgramFromCode(note.subject);
                          const yrNum = getYearFromSectionDigit(note.section);
                          return `${yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"} — ${program}`;
                        })()}
                      </div>

                      <div className="schedule-info">
                        <p className="datetime">{whenRange}</p>
                        <p className="card-subject-title">
                          {note.subject || "—"} {note.section ? `- ${note.section}` : ""}
                        </p>

                        <p className="mentor">
                          {getStudentLabel(note.students)}: {formatStudentDisplay(note.students)}
                        </p>

                        <div className="bottom-row">
                          <div className="session-notes-preview">
                            <strong>Topic:</strong> {note.topic?.trim() || "—"}
                          </div>

                          <button
                            type="button"
                            className="view-full-notes-btn"
                            onClick={() => openFloatingNote(note)}
                          >
                            View Session Notes
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sortedNotes.length === 0 && <p className="empty-msg">No session notes available.</p>}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}