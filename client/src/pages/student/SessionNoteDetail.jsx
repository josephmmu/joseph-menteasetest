import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import Sidebar from '../../components/Sidebar';
import MobileNav from '../../components/MobileNav';
import './SessionNotes.css';
import './SessionNoteDetail.css';

const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    'http://localhost:5000'
  ).replace(/\/+$/, '');

const formatDateTime = (date) =>
  new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export default function SessionNoteEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'All';
  const backHref = `/session-notes${filter && filter !== 'All' ? `?filter=${encodeURIComponent(filter)}` : ''}`;

  // responsive
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );
  const isMobile = windowWidth <= 1152;
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);

  const [topics, setTopics] = useState('');
  const [nextSteps, setNextSteps] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState('idle');
  const editorName = useMemo(() => 'You', []);

  // load (real API)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/session-notes/${encodeURIComponent(id)}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (!alive) return;
        if (data?.ok) {
          setNote(data.data);
          setTopics(data.data?.topicsDiscussed || '');
          setNextSteps(data.data?.nextSteps || '');
        } else {
          setNote(null);
        }
      } catch {
        setNote(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const handler = (e) => {
      if (isEditing && isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditing, isDirty]);

  const startEdit = () => {
    setIsEditing(true);
    setIsDirty(false);
    setStatus('idle');
  };

  const cancelEdit = () => {
    if (note) {
      setTopics(note.topicsDiscussed || '');
      setNextSteps(note.nextSteps || '');
    }
    setIsEditing(false);
    setIsDirty(false);
    setStatus('idle');
  };

  const saveAndClose = async () => {
    if (!note) return;
    setStatus('saving');
    try {
      const res = await fetch(`${API}/api/session-notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicsDiscussed: topics, nextSteps }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error('Save failed');
      setNote((prev) =>
        prev ? { ...prev, topicsDiscussed: topics, nextSteps, ...j.data } : prev
      );
      setIsEditing(false);
      setIsDirty(false);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1200);
    } catch {
      setStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}
        <div className="main-layout">
          {!isMobile && <Sidebar activePage="Session Notes" />}
          <main className="dashboard-main scrollable-content">
            <div className="section loading">
              <p>Loading note…</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="page-wrapper">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}
        <div className="main-layout">
          {!isMobile && <Sidebar activePage="Session Notes" />}
          <main className="dashboard-main scrollable-content">
            <div className="section">
              <Link className="back-link back-link--plain" to={backHref}>Back to Session Notes</Link>
              <h2>Session Note Not Found</h2>
              <p>The note you’re looking for doesn’t exist or was removed.</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Session Notes" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <div className="detail-header">
              <Link className="back-link" to={backHref}>Back to Session Notes</Link>
            </div>

            <div className="note-meta-header">
              <div className="note-compact-meta">
                <div className="note-title-row">
                  <div className="note-title">{/* Subject is not in this payload; keep simple */}
                    Session Note
                  </div>
                  <div className={`autosave-status ${status}`}>
                    {status === 'saving' && 'Saving…'}
                    {status === 'saved' && 'Saved'}
                    {status === 'error' && 'Save failed'}
                  </div>
                </div>
                {/* If you want full course meta here, extend the GET route to return it. */}
              </div>

              <div className="note-meta-actions">
                <div className="note-actions-row">
                  {!isEditing ? (
                    <button className="btn-secondary" onClick={startEdit}>
                      Edit
                    </button>
                  ) : (
                    <>
                      <button className="btn-secondary" onClick={cancelEdit}>Cancel</button>
                      <button
                        className="btn-primary"
                        onClick={saveAndClose}
                        disabled={!isDirty || status === 'saving'}
                        title={!isDirty ? 'No changes to save' : undefined}
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="note-divider" />

            <div id="print-area" className="note-scroll">
              <section className="note-block">
                <h3>Topics Discussed</h3>
                <textarea
                  className="note-textarea"
                  value={topics}
                  readOnly={!isEditing}
                  onChange={(e) => {
                    setTopics(e.target.value);
                    if (!isDirty) setIsDirty(true);
                  }}
                  placeholder="Type key points, decisions, blockers…"
                  rows={12}
                />
                <pre className="print-only print-pre">{topics}</pre>
              </section>

              <section className="note-block">
                <h3>Next Steps</h3>
                <textarea
                  className="note-textarea"
                  value={nextSteps}
                  readOnly={!isEditing}
                  onChange={(e) => {
                    setNextSteps(e.target.value);
                    if (!isDirty) setIsDirty(true);
                  }}
                  placeholder="List action items with owners and due dates…"
                  rows={10}
                />
                <pre className="print-only print-pre">{nextSteps}</pre>
              </section>

              <div className="note-footer">
                <div className="note-edited">
                  Last edited by {note.lastEditedBy || '—'} •{' '}
                  {note.lastEditedAt ? formatDateTime(note.lastEditedAt) : '—'}
                </div>
                <div className="note-actions-row">
                  <button className="btn-secondary" onClick={() => window.print()}>
                    Print / Save PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}