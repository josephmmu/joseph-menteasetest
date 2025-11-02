// src/pages/SessionNotes.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import Sidebar from '../../components/Sidebar';
import MobileNav from '../../components/MobileNav';
import './SessionNotes.css';
import { useCourseColor } from '../../context/CourseColorContext';
import { useAuth } from '../../context/AuthContext';
import { getProgramFromCode, getYearFromSectionDigit, ordinal } from '../../utils/programYear';

const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    'http://localhost:5000'
  ).replace(/\/+$/, '');

// utility — pick first truthy trimmed string
const pick = (...cands) => {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return '';
};

const toISO = (d, t) => {
  const dateStr = typeof d === 'string' ? d.trim() : '';
  const timeStr = typeof t === 'string' ? t.trim() : '';
  if (!dateStr) return '';
  const iso = timeStr ? `${dateStr}T${timeStr}` : dateStr;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? '' : dt.toISOString();
};

// local time range formatter (same-day compress)
function fmtDateMDY(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}
function fmtTime12h(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function formatLocalRange(startISO, endISO) {
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;
  if (!start || isNaN(start.getTime())) return '—';
  const endEff = end && !isNaN(end.getTime()) ? end : new Date(start.getTime() + 30 * 60 * 1000);
  const sameDay =
    start.getFullYear() === endEff.getFullYear() &&
    start.getMonth() === endEff.getMonth() &&
    start.getDate() === endEff.getDate();
  if (sameDay) return `${start.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, ${fmtTime12h(start)} – ${fmtTime12h(endEff)}`;
  return `${fmtDateMDY(start)} ${fmtTime12h(start)} – ${fmtDateMDY(endEff)} ${fmtTime12h(endEff)}`;
}

export default function SessionNotes() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [searchParams, setSearchParams] = useSearchParams();
  const qpFilter = searchParams.get('filter') || 'All';
  const [filter, setFilter] = useState(qpFilter);

  // Optional: read time range from URL if present
  const startISO = searchParams.get('startISO') || '';
  const endISO = searchParams.get('endISO') || '';

  const { getCourseColor } = useCourseColor();
  const { user } = useAuth();

  // Normalize token so we never send "Bearer Bearer ..."
  const rawToken = user?.token || user?.jwt || localStorage.getItem('token') || '';
  const normToken = useMemo(() => {
    if (!rawToken) return '';
    return rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
  }, [rawToken]);

  const authHeaders = useMemo(
    () => (normToken ? { Authorization: `Bearer ${normToken}` } : {}),
    [normToken]
  );

  const isMobile = windowWidth <= 1152;

  const [loading, setLoading] = useState(true);
  const [notesData, setNotesData] = useState([]);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => setFilter(qpFilter), [qpFilter]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* Fetch notes authored by me (mentor/student) — joined backend */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await axios.get(`${API}/api/session-notes/mine`, {
          headers: authHeaders,
          withCredentials: false,
          params: {
            ...(startISO ? { startISO } : {}),
            ...(endISO ? { endISO } : {}),
          },
        });
        const apiNotes = Array.isArray(res.data?.notes) ? res.data.notes : [];
        if (!alive) return;
        setNotesData(apiNotes);
      } catch (err) {
        const code = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || 'Request failed';
        if (alive) {
          setFetchError(`${code || 'ERR'}: ${msg}`);
          setNotesData([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [API, authHeaders, startISO, endISO]);

  // Normalize after fetch — prefer authoritative session schedule
  const normalized = useMemo(() => {
    return (notesData || []).map((n) => {
      const rs = n.rawSession || {};

      const subject = pick(
        n.subject, n.subjectText,
        rs.subject?.code, rs.subject?.name,
        rs.subjectCode, rs.subjectName,
        rs.course?.code, rs.course?.name,
        rs.courseCode, rs.courseName
      );

      const section = pick(
        n.section, n.sectionText,
        rs.section?.name, rs.section?.code,
        rs.sectionName, rs.sectionCode, rs.block, rs.section
      );

      const mentorName = pick(n.mentorName, n.mentorNameText, rs.mentorName);

      // ✅ Prefer session schedule first, then server fields, then legacy
      const start = pick(
        rs.scheduleStart,
        n.dateTimeISO,
        n.startsAt && new Date(n.startsAt).toISOString(),
        rs.startISO,
        rs.startDateTime,
        toISO(rs.startDate, rs.startTime),
        toISO(rs.date, rs.time)
      );

      const end = pick(
        rs.scheduleEnd,
        n.endISO,
        rs.endISO,
        toISO(rs.endDate, rs.endTime)
      );

      const topic = pick(n.topic, rs.topic);

      return {
        ...n,
        subject,
        section,
        mentorName,
        dateTimeISO: start || '',
        endISO: end || '',
        topic,
      };
    });
  }, [notesData]);

  const subjects = useMemo(
    () => Array.from(new Set(normalized.map((n) => n.subject))).filter(Boolean).sort(),
    [normalized]
  );

  const handleFilterChange = (value) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'All') next.delete('filter');
    else next.set('filter', value);
    setSearchParams(next);
  };

  const openFloatingNote = async (note) => {
    try {
      await axios.post(
        `${API}/api/session-notes/ensure`,
        { sessionId: note.sessionId || note.id },
        { headers: { 'Content-Type': 'application/json', ...authHeaders }, withCredentials: false }
      );
    } catch (err) {
      // continue without blocking
    }

    const qs = new URLSearchParams({
      id: note.sessionId || note.id,
      subject: note.subject || '',
      section: note.section || '',
      topic: note.topic || '',
      mentorName: note.mentorName || 'Mentor',
      studentName: user?.name || 'Student',
      // pass the authoritative times so popup shows exact range
      startISO: note.dateTimeISO || '',
      endISO: note.endISO || '',
      dateTimeISO: note.dateTimeISO || '', // backward-compat
      hideBack: '1',
    }).toString();

    const win = window.open(
      `/session-notes-popup?${qs}`,
      'MentEaseNotes',
      'width=560,height=640,left=100,top=100'
    );
    if (win) {
      try { win.focus(); } catch {}
    }
  };

  const filtered = normalized.filter((n) => filter === 'All' || n.subject === filter);

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
                onChange={(e) => handleFilterChange(e.target.value)}
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
              <div className="inline-error" style={{ marginBottom: 12, color: '#b91c1c' }}>
                {fetchError}
              </div>
            )}

            <div className={`schedule-list ${!loading && filtered.length === 0 ? 'empty' : ''}`} aria-busy={loading}>
              {loading && (
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

              {!loading &&
                filtered.map((note) => {
                  const accent = getCourseColor(note.subject || note.section);
                  const whenRange = formatLocalRange(note.dateTimeISO, note.endISO);

                  return (
                    <div
                      className="schedule-card is-colored"
                      key={note.id}
                      style={{ '--accent': accent }}
                    >
                      <div className="year-chip" aria-hidden="true">
                        {(() => {
                          const program = getProgramFromCode(note.subject);
                          const yrNum = getYearFromSectionDigit(note.section);
                          return `${yrNum ? `${ordinal(yrNum)} Year` : 'Year N/A'} — ${program}`;
                        })()}
                      </div>

                      <div className="schedule-info">
                        <p className="datetime">{whenRange}</p>
                        <p className="card-subject-title">
                          {note.subject || '—'} {note.section ? `- ${note.section}` : ''}
                        </p>

                        <p className="mentor">Mentor: {note.mentorName || '—'}</p>

                        <div className="bottom-row">
                          <div className="session-notes-preview">
                            <strong>Topic:</strong> {note.topic?.trim() || '—'}
                          </div>

                          <button
                            type="button"
                            className="view-full-notes-btn"
                            onClick={() => openFloatingNote(note)}
                            aria-label="View Session Notes"
                          >
                            View Session Notes
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {!loading && filtered.length === 0 && (
                <p className="empty-msg">No session notes available.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}