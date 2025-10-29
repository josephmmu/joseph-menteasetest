import React, { useEffect, useRef } from 'react';
import './AboutModal.css';

export default function AboutMentEaseModal({ open, onClose }) {
  const panelRef = useRef(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Initial focus into modal
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="about-modal__overlay" onMouseDown={onClose}>
      <div
        className="about-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={panelRef}
      >
        {/* We reuse your existing About content & classes */}
        <div className="about-card">
          <button className="about-back" onClick={onClose}>Back</button>

          {/* Logo row */}
          <div className="about-logos">
            <img src="/mentease-logo.png" alt="MentEase logo" className="about-logo" />
            <img src="/mmdc-logo.png" alt="MMDC logo" className="about-logo mmdc-logo" />
          </div>

          <h1 id="about-title" className="about-title">About MentEase</h1>

          <p className="about-text lead">
            MentEase is a mentoring platform designed for <strong>Mapúa Malayan Digital College (MMDC)</strong> students and mentors.
            It combines session booking, video calls, note-taking, and feedback into a single platform
            to streamline the mentoring experience.
          </p>

          <div className="about-section">
            <h2 className="about-heading">Our Purpose</h2>
            <p className="about-text">
              We created MentEase to address the challenges of coordinating mentoring sessions
              across multiple platforms. Our goal is to provide a centralized solution that
              makes mentoring more organized and accessible for everyone involved.
            </p>
          </div>

          <p className="about-version">Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
}