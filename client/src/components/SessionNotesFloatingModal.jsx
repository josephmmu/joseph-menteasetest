import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./SessionNotesFloatingModal.css";

export default function SessionNotesFloatingModal({
  mode = "modal",
  isOpen = true,
  onClose = () => {},
  session = {
    subject: "Mathematics",
    section: "Section A",
    topic: "Algebra Basics",
    mentorName: "Dr. Smith",
    dateTimeISO: "2024-01-15T10:30:00Z",
    id: "sess-123",
  },
  currentUser = { id: "student-1", name: "John Doe" },
  onAutosave = async () => {},
  participants = [],
  showBackButton = true,
}) {
  const [topicsDiscussed, setTopicsDiscussed] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showEntryWarning, setShowEntryWarning] = useState(true);

  useEffect(() => {
    if (mode !== "modal" || !isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("snx-page-lock");
    body.classList.add("snx-page-lock");
    return () => {
      html.classList.remove("snx-page-lock");
      body.classList.remove("snx-page-lock");
    };
  }, [mode, isOpen]);

  useEffect(() => {
    if (mode === "modal" && !isOpen) return;
    if (showEntryWarning) return;

    const t = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onAutosave({
          sessionId: session?.id,
          topicsDiscussed,
          nextSteps,
          updatedBy: currentUser?.name,
          updatedAt: new Date().toISOString(),
        });
        setLastSavedAt(new Date());
      } finally {
        setIsSaving(false);
      }
    }, 1800);

    return () => clearTimeout(t);
  }, [
    topicsDiscussed,
    nextSteps,
    isOpen,
    mode,
    onAutosave,
    session?.id,
    currentUser?.name,
    showEntryWarning,
  ]);

  if (mode === "modal" && !isOpen) return null;

  const Wrapper = mode === "modal" ? ModalShell : StandaloneShell;

  const dateDisplay = session?.dateTimeISO
    ? formatCustomDateTime(session.dateTimeISO)
    : "—";

  function formatCustomDateTime(input) {
    const date = typeof input === "string" ? new Date(input) : input;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${month}/${day}/${year}, ${hours}:${minutes} ${ampm}`;
  }

  const people = participants.length
    ? participants
    : [
        { id: "mentor", name: session?.mentorName || "Mentor", role: "M" },
        { id: currentUser.id, name: currentUser.name, role: "S" },
      ];
  const mentorName = people.find((p) => p.role === "M")?.name || "[Mentor]";

  // -------------------------------
  // EXACT-contents printer
  // -------------------------------
  function handlePrint() {
    const escapeHTML = (s = "") =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const subject = session?.subject || "";
    const section = session?.section || "";
    const topic = session?.topic || "";
    const mentor = mentorName || "";
    const when = dateDisplay || "";

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title></title>
  <style>
    @page { margin: 16mm; }
    html, body { padding: 0; margin: 0; font-family: ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans"; color: #111827; }
    .wrap { padding: 0; }
    .h1 { font-size: 20px; font-weight: 800; margin: 0 0 6px 0; }
    .row { color: #111827; margin: 2px 0; font-size: 14px; }
    .label { font-weight: 700; }
    .section { margin-top: 16px; page-break-inside: avoid; }
    .h2 { font-weight: 800; font-size: 15px; margin: 0 0 6px 0; }
    .block { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="h1">${escapeHTML(subject)} — ${escapeHTML(section)}</div>
    ${topic ? `<div class="row"><span class="label">Topic:</span> ${escapeHTML(topic)}</div>` : ``}
    <div class="row"><span class="label">Mentor:</span> ${escapeHTML(mentor)}</div>
    <div class="row"><span class="label">Date/Time:</span> ${escapeHTML(when)}</div>

    <div class="section">
      <div class="h2">Topics Discussed</div>
      <div class="block">${escapeHTML(topicsDiscussed?.trim() || "—")}</div>
    </div>

    <div class="section">
      <div class="h2">Next Steps</div>
      <div class="block">${escapeHTML(nextSteps?.trim() || "—")}</div>
    </div>
  </div>
  <script>
    // print, then close the window
    window.addEventListener('load', () => {
      window.print();
      setTimeout(() => window.close(), 150);
    });
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    try { w.focus(); } catch {}
  }

  return (
    <Wrapper onClose={onClose}>
      <div className="snx-root">
        {/* Entry warning */}
        {showEntryWarning &&
          createPortal(
            <div className="snx-entry-overlay" role="dialog" aria-modal="true">
              <div className="snx-entry-modal" role="document">
                <h2>Before You Start</h2>
                <p>
                  If you close this window, you’ll need to open the{" "}
                  <strong>Session Notes</strong> page again to relaunch it.
                </p>
                <div className="snx-entry-actions">
                  <button
                    className="snx-btn primary"
                    onClick={() => setShowEntryWarning(false)}
                  >
                    I Understand
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Header */}
        <header className="snx-header" aria-hidden={showEntryWarning}>
          <div className="snx-left">
            {mode === "modal" && showBackButton && (
              <div className="snx-back-button-container">
                <button
                  className="snx-btn back"
                  onClick={() => setShowConfirm(true)}
                >
                  ⬅ Back to MentEase
                </button>
              </div>
            )}

            <div className="snx-title">
              {session?.subject || "[Subject]"} – {session?.section || "[Section]"}
            </div>
            {session?.topic ? (
              <div className="snx-sub">Topic: {session.topic}</div>
            ) : null}

            <div className="snx-meta-row">
              <div className="snx-sub">
                {mentorName} • {dateDisplay}
              </div>
              <div className="snx-participants">
                {people.map((p) => (
                  <div key={p.id} className="snx-avatar" title={p.name}>
                    {(p.role || p.name || "?")
                      .toString()
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top-right info icon */}
          <div className="snx-right">
            <span className="snx-tip-wrapper" aria-describedby="snx-autosave-tip">
              <svg className="snx-info-icon-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#1e3a8a" />
                <path
                  d="M12 7.2c-1.77 0-3.2 1.12-3.2 2.5 0 .41.33.75.75.75s.75-.34.75-.75c0-.62.77-1 1.7-1s1.7.5 1.7 1.2c0 .56-.33.87-.98 1.26-.74.46-1.72 1.07-1.72 2.42v.35c0 .41.34.75.75.75s.75-.34.75-.75v-.35c0-.7.35-1 .98-1.38.79-.47 1.97-1.19 1.97-2.65 0-1.64-1.45-2.95-3.45-2.95Z"
                  fill="#fff"
                />
                <circle cx="12" cy="16.8" r="1" fill="#fff" />
              </svg>
              <span id="snx-autosave-tip" className="snx-tip-text">
                Notes autosave in real time.
              </span>
            </span>
          </div>
        </header>

        {/* Body */}
        <main className="snx-body" aria-hidden={showEntryWarning}>
          <section className="snx-section">
            <h3 className="snx-section-title">Topics Discussed</h3>
            <div className="snx-editor">
              <textarea
                className="snx-textarea clean"
                value={topicsDiscussed}
                onChange={(e) => setTopicsDiscussed(e.target.value)}
                placeholder="Start typing here…"
              />
            </div>
          </section>

          <section className="snx-section">
            <h3 className="snx-section-title">Next Steps</h3>
            <div className="snx-editor">
              <textarea
                className="snx-textarea clean"
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="Start typing here…"
              />
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="snx-footer" aria-hidden={showEntryWarning}>
          <div className="snx-status-footer">
            {isSaving
              ? "Autosaving…"
              : lastSavedAt
              ? `Last updated at ${formatCustomDateTime(lastSavedAt)}`
              : "Ready"}
          </div>
          <div className="snx-footer-actions">
            <button
              className="snx-btn back"
              onClick={handlePrint}
              title="Print this note or save it as PDF"
            >
              Print / Save PDF
            </button>
          </div>
        </footer>

        {/* Leave Confirmation */}
        {showConfirm && (
          <div className="snx-confirm-overlay" role="dialog" aria-modal="true">
            <div className="snx-confirm-modal">
              <h2>Leaving Session Notes</h2>
              <p>This will close your session notes. Are you sure?</p>
              <div className="snx-confirm-actions">
                <button className="snx-btn back" onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="snx-btn primary"
                  onClick={() => {
                    window.open("/", "_blank");
                    window.close();
                  }}
                >
                  Yes, Go Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

function ModalShell({ children, onClose }) {
  return createPortal(
    <div
      className="snx-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") {
          onClose();
        }
      }}
    >
      <div className="snx-window">{children}</div>
    </div>,
    document.body
  );
}

function StandaloneShell({ children }) {
  return <div className="snx-standalone">{children}</div>;
}