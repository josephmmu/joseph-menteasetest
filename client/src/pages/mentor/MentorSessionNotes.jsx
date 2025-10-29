import React, { useState, useEffect } from "react";
import "../student/SessionNotes.css"; // Reuse the same CSS
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import { useCourseColor } from "../../context/CourseColorContext";
import { useAuth } from "../../context/AuthContext";
import * as programYearUtils from "../../utils/programYear";

const { getProgramFromCode, getYearFromSectionDigit, ordinal } = programYearUtils;

export default function MentorSessionNotes() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const { getYearColor, normalizeCourseKey } = useCourseColor();
  const { user } = useAuth(); // to pass mentorName to popup

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth <= 1152;

  // Date parser for strings like "July 28, 2025 - 8:46 PM"
  const parseDateTime = (str) => {
    try {
      const cleaned = String(str).replace(" - ", " ");
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  // Subject/section accent
  const accentVarsFor = (subject, section) => {
    const key = normalizeCourseKey(`${subject || ""} ${section || ""}`);
    const accent = getYearColor(key);
    return { "--accent": accent, "--accentRing": "rgba(0,0,0,0.08)" };
  };

  const formatStudentDisplay = (students) =>
    !students || students.length === 0 ? "No students" : students.join(", ");

  const getStudentLabel = (students) =>
    students && students.length === 1 ? "Student" : "Students";

  // ==== SAMPLE DATA (mentor perspective) ====
  const sessionNotesData = [
    {
      id: "it115-s3103-2025-07-28-2046",
      subject: "MO-IT115 Object-Oriented Analysis and Design",
      section: "S3103",
      students: ["John Dela Cruz"],
      dateTime: "July 28, 2025 - 8:46 PM",
      excerpt:
        "08:46 — Recap: inconsistent actor lifelines on prior draft. Student showed improvement in understanding UML sequence diagrams...",
      duration: "45 minutes",
      status: "completed",
      topic: "UML Sequence Diagrams",
    },
    {
      id: "it161-a3103-2025-07-30-1530",
      subject: "MO-IT161 Web Systems and Technology",
      section: "A3103",
      students: ["Maria Santos", "Isabella Garcia"],
      dateTime: "July 30, 2025 - 3:30 PM",
      excerpt:
        "Covered principles of responsive web design using flex and grid. Students grasped mobile-first approach quickly...",
      duration: "60 minutes",
      status: "completed",
      topic: "Responsive Web Design",
    },
    {
      id: "it104-a2101-2025-08-05-1300",
      subject: "MO-IT104 Computer Networks",
      section: "A2101",
      students: ["Carlos Rodriguez"],
      dateTime: "August 5, 2025 - 1:00 PM",
      excerpt:
        "Reviewed IPv4 addressing and subnetting exercises. Need to work more on CIDR notation...",
      duration: "50 minutes",
      status: "completed",
      topic: "IPv4 & Subnetting",
    },
    {
      id: "it105-h2102-2025-08-08-1000",
      subject: "MO-IT105 Human-Computer Interaction",
      section: "H2102",
      students: ["Anna Villanueva", "Sofia Chen", "James Wilson"],
      dateTime: "August 8, 2025 - 10:00 AM",
      excerpt:
        "Discussed usability testing methodologies and user feedback analysis. Students showed excellent understanding of user personas...",
      duration: "55 minutes",
      status: "completed",
      topic: "Usability Testing",
    },
    {
      id: "it117-h3103-2025-08-10-1600",
      subject: "MO-IT117 Data Visualization Techniques",
      section: "H3103",
      students: ["Miguel Torres"],
      dateTime: "August 10, 2025 - 4:00 PM",
      excerpt:
        "Explored advanced chart types and interactive dashboard elements. Student created impressive D3.js visualization...",
      duration: "70 minutes",
      status: "completed",
      topic: "Interactive Dashboards",
    },
  ];

  // Filter (by subject) + sort (newest first)
  const subjects = [...new Set(sessionNotesData.map((n) => n.subject))];
  const filtered = sessionNotesData.filter(
    (n) => selectedFilter === "all" || n.subject === selectedFilter
  );
  const sortedNotes = filtered
    .map((note) => ({ ...note, _dt: parseDateTime(note.dateTime) }))
    .filter((note) => note._dt)
    .sort((a, b) => b._dt - a._dt);

  // === OPEN THE SAME FLOATING WINDOW (SessionNotesPopup) ===
  const openFloatingNote = (note) => {
    const dt = parseDateTime(note.dateTime);
    const safeISO = (dt ? dt : new Date()).toISOString();

    const qs = new URLSearchParams({
      id: note.id,
      subject: note.subject,
      section: note.section,
      topic: note.topic || "",
      mentorName: user?.name || "Mentor",
      studentName: (note.students || []).join(", "),
      dateTimeISO: safeISO,
    }).toString();

    const win = window.open(
      `/session-notes-popup?${qs}`,
      "MentEaseNotes",
      "width=560,height=640,left=100,top=100"
    );
    if (win) {
      try {
        win.focus();
      } catch {}
    }
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
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
              >
                <option value="all">All</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            <div className="schedule-list">
              {sortedNotes.map((note) => {
                const vars = accentVarsFor(note.subject, note.section);
                const program = getProgramFromCode(note.subject, normalizeCourseKey);
                const yrNum = getYearFromSectionDigit(note.section);
                const chipLabel = `${yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"} — ${program}`;

                return (
                  <div className="schedule-card is-colored" key={note.id} style={vars}>
                    <div className="year-chip" style={{ "--chip-bg": vars["--accent"] }} aria-hidden="true">
                      {chipLabel}
                    </div>

                    <div className="schedule-info">
                      <p className="date">{note.dateTime}</p>
                      <p className="subject">
                        {note.subject} - {note.section}
                      </p>
                      <p className="mentor">
                        {getStudentLabel(note.students)}: {formatStudentDisplay(note.students)}
                      </p>

                      <div className="bottom-row">
                        <div className="session-notes-preview">
                          {(note.excerpt || "").slice(0, 100)}...
                        </div>

                        {/* Open floating notes window instead of routing */}
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

              {sortedNotes.length === 0 && (
                <p className="empty-msg">No session notes available.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}