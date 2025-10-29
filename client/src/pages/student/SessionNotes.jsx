import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import Sidebar from '../../components/Sidebar';
import MobileNav from '../../components/MobileNav';
import './SessionNotes.css';
import { useCourseColor } from '../../context/CourseColorContext';
import { getProgramFromCode, getYearFromSectionDigit, ordinal } from '../../utils/programYear';

export default function SessionNotes() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [searchParams, setSearchParams] = useSearchParams();
  const qpFilter = searchParams.get('filter') || 'All';
  const [filter, setFilter] = useState(qpFilter);
  const { getCourseColor } = useCourseColor();

  useEffect(() => {
    setFilter(qpFilter);
  }, [qpFilter]);

  const isMobile = windowWidth <= 1152;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const notesData = [
    {
      id: 'it115-s3103-2025-07-28-2046',
      subject: 'MO-IT115 Object-Oriented Analysis and Design',
      section: 'S3103',
      mentor: 'Mr. Nestor Villanueva',
      dateTime: 'July 28, 2025 - 8:46 PM',
      excerpt: '08:46 — Recap: inconsistent actor lifelines on prior draft',
    },
    {
      id: 'it161-a1303-2025-07-30-1530',
      subject: 'MO-IT161 Web Systems and Technology',
      section: 'A3103',
      mentor: 'Mr. Bryan Reyes',
      dateTime: 'July 30, 2025 - 3:30 PM',
      excerpt: 'Covered principles of responsive web design using flex and grid.',
    },
  ];

  const handleFilterChange = (value) => {
    setFilter(value);
    setSearchParams(value === 'All' ? {} : { filter: value });
  };

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
              >
                <option value="All">All</option>
                <option value="MO-IT115 Object-Oriented Analysis and Design">
                  MO-IT115 Object-Oriented Analysis and Design
                </option>
                <option value="MO-IT161 Web Systems and Technology">
                  MO-IT161 Web Systems and Technology
                </option>
              </select>
            </div>

            <div className="schedule-list">
              {notesData
              .filter((n) => filter === 'All' || n.subject === filter)
              .map((note) => {
                const accent = getCourseColor(note.subject || note.section);
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
                      <p className="datetime">{note.dateTime}</p>
                      <p className="card-subject-title">
                        {note.subject} - {note.section}
                      </p>

                      <p className="mentor">{note.mentor}</p>

                      <div className="bottom-row">
                        <div className="session-notes-preview">
                          {note.excerpt.length > 100 ? `${note.excerpt.substring(0, 100)}...` : note.excerpt}
                        </div>

                        <Link
                          className="view-full-notes-btn"
                          to={`/session-notes/${note.id}${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`}
                        >
                          View Full Notes
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}

              {notesData.length === 0 && (
                <p className="empty-msg">No session notes available.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}