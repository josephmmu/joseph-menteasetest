import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AboutMentEase.css';

export default function AboutMentEase() {
  const navigate = useNavigate();

  return (
    <div className="about-container">
      <div className="about-card">
        <button className="about-back" onClick={() => navigate(-1)}>Back</button>

        {/* Logo row */}
        <div className="about-logos">
          <img
            src="/mentease-logo.png"
            alt="MentEase logo"
            className="about-logo"
          />
          <img
            src="/mmdc-logo.png"
            alt="MMDC logo"
            className="about-logo mmdc-logo"
          />
        </div>

        <h1 className="about-title">About MentEase</h1>

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
  );
}