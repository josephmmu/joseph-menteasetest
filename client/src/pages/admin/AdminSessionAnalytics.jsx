import React, { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import "../student/SessionNotes.css";
import "../student/MySchedule.css";
import "../../components/BookSessionModal.css";
import "./AdminUserManagement.css";
import "./AdminSessionAnalytics.css";
import AdminViewSessionLogsModal from "../../components/AdminViewSessionLogsModal";
import SessionsOverTime from "../../components/analytics/SessionsOverTime";
import StatusDonut from "../../components/analytics/StatusDonut";
import SessionsByProgram from "../../components/analytics/SessionsByProgram";

/* ===================== Helpers & Constants ===================== */

const roundToHalf = (n) => {
  if (isNaN(n)) return 0;
  const r = Math.round(n * 2) / 2;
  return Math.min(5, Math.max(1, r));
};

// Tabs
const TERMS = [1, 2, 3];

// dropdown options for School Year → still map to year indices 1..3
const SCHOOL_YEARS = [
  { year: 1, label: "SY 2023 - 2024" },
  { year: 2, label: "SY 2024 - 2025" },
  { year: 3, label: "SY 2025 - 2026" },
];

const STUDENT_NO_REGEX = /^(202[2-5])\d{6}$/i;
const keyOf = (y, t) => `y${y}-t${t}`;
const round = (n, d = 1) => (isNaN(n) ? 0 : Math.round(n * 10 ** d) / 10 ** d);

// Parse subject code (first token)
const subjectCodeOf = (subjectStr) => (subjectStr || "").split(" ")[0] || "";

// Generate truly unique IDs for course instances (matching AdminCourseManagement)
const generateCourseInstanceId = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `course_${timestamp}_${randomPart}`;
};

// Course instances exactly matching AdminCourseManagement data
function makeInitialCoursesByPeriod() {
  const data = {};

  // Initialize all periods as empty (years 1-5, terms 1-3)
  for (let year = 1; year <= 5; year++) {
    for (const term of TERMS) {
      data[keyOf(year, term)] = [];
    }
  }

  // Populate Year 3, Term 1 with multiple courses (matching AdminCourseManagement)
  data[keyOf(3, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT115",
      courseName: "Object-Oriented Analysis and Design",
      section: "H3103",
      program: "IT",
      assignedMentor: "Maria Santos",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT114",
      courseName: "Mobile Development Fundamentals",
      section: "A3101",
      program: "IT",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT117",
      courseName: "Data Visualization Techniques",
      section: "H3102",
      program: "IT",
      assignedMentor: "Robert Johnson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT161",
      courseName: "Web Systems and Technology",
      section: "S3101",
      program: "IT",
      assignedMentor: "Michael Brown",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT151",
      courseName: "Platform Technologies",
      section: "A3102",
      program: "IT",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-SS041",
      courseName: "The Life and Works of Rizal",
      section: "H3101",
      program: "GE",
      assignedMentor: "Lisa Martinez",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA111",
      courseName: "Strategic Management",
      section: "A3201",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA106",
      courseName: "Marketing Management",
      section: "H3202",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT124",
      courseName: "System Integration and Architecture",
      section: "H3105",
      program: "IT",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
  ];

  // Populate Year 3, Term 2 with different courses
  data[keyOf(3, 2)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT200D1",
      courseName: "Capstone 1",
      section: "A3103",
      program: "IT",
      assignedMentor: "David Thompson",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT149",
      courseName: "Web Technology Application",
      section: "H3104",
      program: "IT",
      assignedMentor: "Patricia Lee",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT118",
      courseName: "Cloud Computing",
      section: "S3102",
      program: "IT",
      assignedMentor: "Jennifer Garcia",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-SS086",
      courseName: "Gender and Society",
      section: "A3104",
      program: "GE",
      assignedMentor: "Mark Rodriguez",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA200D1",
      courseName: "Business Administration Capstone",
      section: "H3203",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA108",
      courseName: "Financial Management",
      section: "A3204",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 3,
    },
  ];

  // Populate Year 2, Term 1 with foundational courses
  data[keyOf(2, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT104",
      courseName: "Computer Networks",
      section: "A2101",
      program: "IT",
      assignedMentor: "Maria Santos",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT105",
      courseName: "Human-Computer Interaction",
      section: "H2102",
      program: "IT",
      assignedMentor: "Robert Johnson",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT112",
      courseName: "Technical Support",
      section: "S2101",
      program: "IT",
      assignedMentor: "Michael Brown",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA103",
      courseName: "Principles of Management",
      section: "A2201",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA105",
      courseName: "Introduction to Accounting",
      section: "H2202",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 2,
    },
  ];

  // Populate Year 1, Term 1 with foundational BA courses
  data[keyOf(1, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA101",
      courseName: "Fundamentals of Business Administration",
      section: "A1101",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 1,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA102",
      courseName: "Business Communication",
      section: "H1102",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 1,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA104",
      courseName: "Business Mathematics",
      section: "S1103",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 1,
    },
  ];

  // Populate Year 2, Term 2 with intermediate BA courses
  data[keyOf(2, 2)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA107",
      courseName: "Human Resource Management",
      section: "A2201",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA109",
      courseName: "Operations Management",
      section: "H2202",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 2,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA110",
      courseName: "Business Ethics and Social Responsibility",
      section: "S2203",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 2,
    },
  ];

  return data;
}

const COURSE_INSTANCES = makeInitialCoursesByPeriod();

// Create a lookup map for backward compatibility
const SUBJECT_PERIODS = {};
Object.values(COURSE_INSTANCES)
  .flat()
  .forEach((course) => {
    const fullName = `${course.courseCode} ${course.courseName}`;
    SUBJECT_PERIODS[fullName] = {
      year: course.schoolYear,
      term: course.term,
      code: course.courseCode,
      program: course.program,
      mentor: course.assignedMentor,
      section: course.section,
    };
  });

// A small pool of realistic student names used for generated sessions.
const STUDENT_NAMES = [
  "Alex Cruz",
  "Bea Santos",
  "Carlos Reyes",
  "Danica Lopez",
  "Elijah Navarro",
  "Francesca Dela Rosa",
  "Gabriel Mendoza",
  "Hannah Garcia",
  "Ian Flores",
  "Janet Ramos",
  "Kevin Aquino",
  "Leah Ramirez",
  "Miguel Ortiz",
  "Nina Villanueva",
  "Oscar Bautista",
  "Paula Gonzales",
  "Quincy dela Cruz",
  "Rosa Fernandez",
  "Samuel Torres",
  "Tessa Morales",
];

// Time pools for different section time slots (A=morning, H=afternoon, S=evening)
const MORNING_TIMES = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"];
const AFTERNOON_TIMES = ["1:00 PM", "1:30 PM", "2:00 PM", "3:00 PM"];
const EVENING_TIMES = ["4:00 PM", "4:30 PM", "5:30 PM", "6:00 PM"];

// Topic pools: specific topics for certain courses and a generic fallback
const TOPICS_BY_COURSE = {
  "MO-IT104": [
    "Network Security Fundamentals",
    "OSI Model and TCP/IP",
    "Routing Basics",
    "Subnetting and IP Addressing",
  ],
  "MO-IT115": ["UML Diagrams", "Design Patterns", "Use Case Modeling"],
};

const GENERIC_TOPICS = [
  "Introduction / Overview",
  "Review & Q&A",
  "Assessment / Short Quiz",
  "Practice Exercises",
  "Project Guidance",
  "Exam Prep",
];

// Generate sessions from course instances
function generateSessionsFromCourses() {
  const sessions = [];
  let sessionId = 1;

  Object.values(COURSE_INSTANCES)
    .flat()
    .forEach((course) => {
      const fullName = `${course.courseCode} ${course.courseName}`;

      // Generate 3-8 sessions per course
      const sessionCount = Math.floor(Math.random() * 6) + 3;

      for (let i = 0; i < sessionCount; i++) {
        const rand = Math.random();
        let status;
        if (rand < 0.7) {
          status = "Completed";
        } else if (rand < 0.85) {
          status = "Missed - Student";
        } else if (rand < 0.95) {
          status = "Missed - Mentor";
        } else {
          status = "Cancelled";
        }

        const sid = sessionId++;

        const slotPrefix = (course.section || "")[0]?.toUpperCase();
        let chosenTimePool = MORNING_TIMES;
        if (slotPrefix === "H") chosenTimePool = AFTERNOON_TIMES;
        else if (slotPrefix === "S") chosenTimePool = EVENING_TIMES;
        const chosenTime = chosenTimePool[(sid - 1) % chosenTimePool.length];

        const topicPool = TOPICS_BY_COURSE[course.courseCode] || GENERIC_TOPICS;
        const chosenTopic = topicPool[(sid - 1) % topicPool.length];

        sessions.push({
          id: sid,
          sessionRef: `${course.courseCode}-${course.section}-${sid}`,
          subject: fullName,
          section: course.section,
          teacher: course.assignedMentor,
          student: (() => {
            const isGroup = Math.random() < 0.2;
            if (!isGroup) return STUDENT_NAMES[(sid - 1) % STUDENT_NAMES.length];
            const groupSize = 2 + ((sid - 1) % 3); // 2..4
            const students = [];
            for (let g = 0; g < groupSize; g++) {
              students.push(STUDENT_NAMES[(sid - 1 + g) % STUDENT_NAMES.length]);
            }
            return students;
          })(),
          time: chosenTime,
          topic: chosenTopic,
          courseCode: course.courseCode,
          program: course.program,
          schoolYear: course.schoolYear,
          term: course.term,
          status,
          date: new Date(
            2024,
            Math.floor(Math.random() * 12),
            Math.floor(Math.random() * 28) + 1
          ),
        });
      }
    });

  return sessions;
}

const GENERATED_SESSIONS = generateSessionsFromCourses();

/* ===================== Page ===================== */

export default function AdminSessionAnalytics() {
  // Layout
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1152);
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setIsMobile(window.innerWidth <= 1152);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const sessionsPerPage = 10;

  // Tabs - using 0 to represent "All"
  const [activeYear, setActiveYear] = useState(0); // 0 = All Years
  const [activeTerm, setActiveTerm] = useState(0); // 0 = All Terms
  const periodKey = keyOf(activeYear, activeTerm);

  // Sessions
  const [sessions] = useState(GENERATED_SESSIONS);

  // Modal selection
  const [selectedRowForModal, setSelectedRowForModal] = useState(null);

  // Shared chart card height (ensures equal heights)
  const CHART_CARD_HEIGHT = 360; // px

  // Derived: sessions grouped per period
  const sessionsByPeriod = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const key = keyOf(s.schoolYear, s.term);
      (map[key] ||= []).push(s);
    }
    return map;
  }, [sessions]);

  // Aggregate sessions by school year + term for the SessionsOverTime chart
  const sessionsOverTime = useMemo(() => {
    const buckets = [];
    for (const sy of SCHOOL_YEARS) {
      for (const t of TERMS) {
        const key = keyOf(sy.year, t);
        const count = (sessionsByPeriod[key] || []).length;
        buckets.push({ period: `${sy.label} T${t}`, count });
      }
    }
    return buckets;
  }, [sessionsByPeriod]);

  const periodSessions = useMemo(() => {
    if (activeYear === 0 && activeTerm === 0) {
      return Object.values(sessionsByPeriod).flat();
    }
    if (activeYear === 0 && activeTerm !== 0) {
      return Object.entries(sessionsByPeriod)
        .filter(([key]) => key.endsWith(`-t${activeTerm}`))
        .map(([, s]) => s)
        .flat();
    }
    if (activeYear !== 0 && activeTerm === 0) {
      return Object.entries(sessionsByPeriod)
        .filter(([key]) => key.startsWith(`y${activeYear}-`))
        .map(([, s]) => s)
        .flat();
    }
    return sessionsByPeriod[periodKey] || [];
  }, [sessionsByPeriod, periodKey, activeYear, activeTerm]);

  // Data for status donut
  const statusDonutData = useMemo(() => {
    const stats = {
      Completed: 0,
      "Missed - Student": 0,
      "Missed - Mentor": 0,
      Cancelled: 0,
    };
    for (const s of periodSessions) {
      if (s.status in stats) stats[s.status]++;
    }
    return [
      { name: "Completed", value: stats.Completed },
      { name: "Missed - Student", value: stats["Missed - Student"] },
      { name: "Missed - Mentor", value: stats["Missed - Mentor"] },
      { name: "Cancelled", value: stats.Cancelled },
    ];
  }, [periodSessions]);

  // Data for sessions by program
  const sessionsByProgramData = useMemo(() => {
    const map = {};
    for (const s of periodSessions) {
      const p = s.program || "Other";
      map[p] = (map[p] || 0) + 1;
    }
    return Object.entries(map).map(([program, count]) => ({ program, count }));
  }, [periodSessions]);

  // Count unique courses (subject + section)
  const totalCoursesCount = useMemo(() => {
    const set = new Set();
    for (const s of periodSessions) {
      set.add(`${s.subject}|${s.section}`);
    }
    return set.size;
  }, [periodSessions]);

  const filteredSessions = useMemo(() => {
    let result = periodSessions;
    if (selectedStatus) {
      result = result.filter((s) => s.status === selectedStatus);
    }
    if (selectedProgram) {
      result = result.filter((s) => {
        const meta = SUBJECT_PERIODS[s.subject];
        return meta && meta.program === selectedProgram;
      });
    }
    return result;
  }, [periodSessions, selectedStatus, selectedProgram]);

  // Apply text search over subject, course code, or mentor
  const searchedSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredSessions;
    return filteredSessions.filter((s) => {
      const subj = (s.subject || "").toLowerCase();
      const code = (s.code || subjectCodeOf(s.subject)).toLowerCase();
      const mentor = (s.teacher || "").toLowerCase();
      return subj.includes(q) || code.includes(q) || mentor.includes(q);
    });
  }, [filteredSessions, searchQuery]);

  // Calculate session statistics for the current period
  const sessionStats = useMemo(() => {
    const stats = {
      total: periodSessions.length,
      completed: 0,
      missedStudent: 0,
      missedMentor: 0,
      cancelled: 0,
    };

    periodSessions.forEach((session) => {
      switch (session.status) {
        case "Completed":
          stats.completed++;
          break;
        case "Missed - Student":
          stats.missedStudent++;
          break;
        case "Missed - Mentor":
          stats.missedMentor++;
          break;
        case "Cancelled":
          stats.cancelled++;
          break;
        default:
          break;
      }
    });

    return stats;
  }, [periodSessions]);

  // Group to unique rows (Course name + Section)
  const groupedRows = useMemo(() => {
    const byKey = new Map();
    for (const s of searchedSessions) {
      const gkey = `${s.subject}|${s.section}`;
      if (!byKey.has(gkey)) {
        byKey.set(gkey, {
          subject: s.subject,
          section: s.section,
          courseCode: s.courseCode,
          teacher: s.teacher,
          sessionIds: [],
          completedCount: 0,
          missedStudentCount: 0,
          missedMentorCount: 0,
          cancelledCount: 0,
        });
      }
      const row = byKey.get(gkey);
      row.sessionIds.push(s.id);

      switch (s.status) {
        case "Completed":
          row.completedCount++;
          break;
        case "Missed - Student":
          row.missedStudentCount++;
          break;
        case "Missed - Mentor":
          row.missedMentorCount++;
          break;
        case "Cancelled":
          row.cancelledCount++;
          break;
        default:
          break;
      }
    }
    return Array.from(byKey.values());
  }, [searchedSessions]);

  // Sorting state
  const [sortBy, setSortBy] = useState({ key: "subject", dir: "asc" });
  const toggleSort = (key) =>
    setSortBy((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );

  // Section comparator
  const sectionRankTuple = (sec) => {
    const letter = (sec || "")[0]?.toUpperCase();
    const letterRank = { A: 0, H: 1, S: 2 }[letter] ?? 99;
    const num = parseInt((sec || "").slice(1), 10) || 0;
    return [letterRank, num];
  };

  const sortedRows = useMemo(() => {
    const rows = groupedRows.slice();
    rows.sort((a, b) => {
      const dir = sortBy.dir === "asc" ? 1 : -1;
      if (sortBy.key === "subject") {
        return a.subject.localeCompare(b.subject) * dir;
      }
      if (sortBy.key === "section") {
        const [ra, na] = sectionRankTuple(a.section);
        const [rb, nb] = sectionRankTuple(b.section);
        if (ra !== rb) return (ra - rb) * dir;
        return (na - nb) * dir;
      }
      if (sortBy.key === "mentor") {
        const ma = a.teacher || "";
        const mb = b.teacher || "";
        return ma.localeCompare(mb) * dir;
      }
      return 0;
    });
    return rows;
  }, [groupedRows, sortBy]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedRows.length / sessionsPerPage);
  const startIndex = (currentPage - 1) * sessionsPerPage;
  const endIndex = startIndex + sessionsPerPage;
  const paginatedRows = sortedRows.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, searchQuery]);

  // Clear dependent filters on tab change
  useEffect(() => {
    setSelectedStatus("");
  }, [periodKey]);

  return (
    <div className="page-wrapper admin-user-control">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Session Analytics" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>Session Analytics</h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Track and analyze mentoring session attendance across terms and
              school years.
            </p>

            {/* Analytics Charts Section */}
            <div style={{ marginBottom: "3rem" }}>
              {/* Main Line Chart */}
              <div style={{ marginBottom: "3rem" }}>
                <SessionsOverTime data={sessionsOverTime} />
              </div>

              {/* Session Statistics Cards */}
              <div className="user-stats-section" style={{ marginBottom: "3rem" }}>
                <div className="stats-grid">
                  <div className="stat-card purple">
                    <div className="stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                    <div className="stat-content">
                      <div className="stat-number">{sessionStats.total}</div>
                      <div className="stat-label">Total Sessions</div>
                    </div>
                  </div>

                  <div className="stat-card completed">
                    <div className="stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4" />
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    </div>
                    <div className="stat-content">
                      <div className="stat-number">{sessionStats.completed}</div>
                      <div className="stat-label">Completed</div>
                    </div>
                  </div>

                  <div className="stat-card students">
                    <div className="stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="stat-content">
                      <div className="stat-number">{sessionStats.missedStudent}</div>
                      <div className="stat-label">Student Missed</div>
                    </div>
                  </div>

                  <div className="stat-card admins">
                    <div className="stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="stat-content">
                      <div className="stat-number">{sessionStats.missedMentor}</div>
                      <div className="stat-label">Mentor Missed</div>
                    </div>
                  </div>

                  <div className="stat-card cancelled">
                    <div className="stat-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    </div>
                    <div className="stat-content">
                      <div className="stat-number">{sessionStats.cancelled}</div>
                      <div className="stat-label">Cancelled</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary Charts — equal height, stack at <=1250px */}
              <div className="analytics-row">
                <div className="analytics-card" style={{ height: CHART_CARD_HEIGHT }}>
                  <StatusDonut
                    data={statusDonutData}
                    onClickSlice={(name) => setSelectedStatus(name)}
                    height={CHART_CARD_HEIGHT}
                  />
                </div>
                <div className="analytics-card" style={{ height: CHART_CARD_HEIGHT }}>
                  <SessionsByProgram
                    data={sessionsByProgramData}
                    height={CHART_CARD_HEIGHT}
                  />
                </div>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="search-filter-bar">
              <div className="search-container">
                <div className="search-input-wrapper">
                  <svg
                    className="search-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by course name or mentor"
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      className="search-clear"
                      onClick={() => setSearchQuery("")}
                      title="Clear search"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="filter-controls">
                <button
                  className={`filter-toggle-btn ${showFilters ? "active" : ""}`}
                  onClick={() => setShowFilters(!showFilters)}
                  title={showFilters ? "Hide filters" : "Show filters"}
                >
                  <svg
                    className="filter-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
                  </svg>
                  <span>Filters</span>
                  {(selectedStatus || selectedProgram) && (
                    <span className="filter-badge">
                      {[selectedStatus, selectedProgram].filter(Boolean).length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Filter Panel */}
            {showFilters && (
              <div className="filter-panel-collapsible">
                <div className="filter-panel-header">
                  <h3>Filter Sessions</h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedStatus("");
                      setSelectedProgram("");
                      setSearchQuery("");
                      setActiveYear(0);
                      setActiveTerm(0);
                      setCurrentPage(1);
                    }}
                  >
                    Clear All
                  </button>
                </div>

                <div className={`filter-grid ${isMobile ? "mobile" : ""}`}>
                  <div className="filter-field">
                    <label className="filter-label">School Year</label>
                    <select
                      value={activeYear}
                      onChange={(e) => setActiveYear(Number(e.target.value))}
                      className="filter-select"
                    >
                      <option value={0}>All School Years</option>
                      {SCHOOL_YEARS.map((opt) => (
                        <option key={opt.year} value={opt.year}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-field">
                    <label className="filter-label">Term</label>
                    <select
                      value={activeTerm}
                      onChange={(e) => setActiveTerm(Number(e.target.value))}
                      className="filter-select"
                    >
                      <option value={0}>All Terms</option>
                      {TERMS.map((term) => (
                        <option key={term} value={term}>
                          Term {term}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-field">
                    <label className="filter-label">Program</label>
                    <select
                      value={selectedProgram}
                      onChange={(e) => setSelectedProgram(e.target.value)}
                      className="filter-select"
                    >
                      <option value="">All Programs</option>
                      <option value="IT">Information Technology</option>
                      <option value="BA">Business Administration</option>
                      <option value="GE">General Education</option>
                    </select>
                  </div>

                  <div className="filter-field">
                    <label className="filter-label">Status</label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="filter-select"
                    >
                      <option value="">All Statuses</option>
                      <option value="Completed">Completed</option>
                      <option value="Missed - Student">Missed - Student</option>
                      <option value="Missed - Mentor">Missed - Mentor</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Session List */}
            <div className={`user-list-panel ${isMobile ? "mobile" : ""}`}>
              <div className="user-list-container">
                <div
                  style={{
                    marginTop: "2rem",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                    color: "#64748b",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    Showing {startIndex + 1}-{Math.min(endIndex, sortedRows.length)} of {sortedRows.length} courses
                    {sortedRows.length !== totalCoursesCount &&
                      ` (filtered from ${totalCoursesCount} total)`}
                  </span>
                  {totalPages > 1 && (
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      Page {currentPage} of {totalPages}
                    </span>
                  )}
                </div>

                <div className="user-list">
                  {sortedRows.length === 0 ? (
                    <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                      No courses found with the current filters.
                    </div>
                  ) : (
                    paginatedRows.map((row, index) => {
                      const mentor = row.teacher || "—";

                      const courseNameOnly =
                        row.subject && row.courseCode
                          ? row.subject.replace(`${row.courseCode} `, "")
                          : row.subject;
                      const displayCourse = row.courseCode
                        ? `${row.courseCode} - ${courseNameOnly}`
                        : row.subject;

                      const totalSessions =
                        row.completedCount +
                        row.missedStudentCount +
                        row.missedMentorCount +
                        row.cancelledCount;

                      const firstSession = searchedSessions.find(
                        (s) => s.subject === row.subject && s.section === row.section
                      );
                      const sessionsForCourse = searchedSessions.filter(
                        (s) => s.subject === row.subject && s.section === row.section
                      );
                      const latestSession = sessionsForCourse.length
                        ? sessionsForCourse.reduce((prev, cur) =>
                            new Date(prev.date) > new Date(cur.date) ? prev : cur
                          )
                        : null;
                      const latestDisplay = latestSession
                        ? `${new Date(latestSession.date).toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}${latestSession.time ? ` - ${latestSession.time}` : ""}`
                        : null;
                      const program = firstSession?.program || "";
                      const schoolYear = firstSession?.schoolYear || 0;
                      const term = firstSession?.term || 0;

                      return (
                        <div
                          key={`${row.subject}|${row.section}`}
                          className="user-card"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "1.25rem",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            marginTop: index === 0 ? "0.5rem" : "0",
                            marginBottom: "0.75rem",
                            background: "#ffffff",
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "#d1d4daff";
                            e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.1)`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#e2e8f0";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          <div className="user-info" style={{ flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                marginBottom: "0.5rem",
                              }}
                            >
                              <div
                                className="user-name"
                                style={{
                                  fontSize: "1rem",
                                  fontWeight: "600",
                                  color: "#0f172a",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                }}
                              >
                                {displayCourse}
                                {program && (
                                  <span
                                    style={{
                                      background:
                                        program === "IT"
                                          ? "#3b82f6"
                                          : program === "BA"
                                          ? "#10b981"
                                          : "#f59e0b",
                                      color: "#fff",
                                      fontSize: "0.75rem",
                                      padding: "0.125rem 0.375rem",
                                      borderRadius: "9999px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {program}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "0.875rem",
                                marginBottom: "0.25rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span>Section {row.section || "—"}</span>
                              <span>•</span>
                              <span>{mentor}</span>
                            </div>

                            {schoolYear > 0 && term > 0 && (
                              <div
                                style={{
                                  fontSize: "0.875rem",
                                  color: "#3b82f6",
                                  marginBottom: "0.25rem",
                                }}
                              >
                                <span>
                                  {SCHOOL_YEARS.find((sy) => sy.year === schoolYear)?.label ||
                                    `Year ${schoolYear}`}
                                  , Term {term}
                                </span>
                              </div>
                            )}

                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                fontSize: "0.875rem",
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              {row.completedCount > 0 && (
                                <span
                                  style={{
                                    background: "#dcfce7",
                                    color: "#166534",
                                    border: "1px solid #bbf7d0",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                  }}
                                >
                                  ✓ {row.completedCount} Completed
                                </span>
                              )}
                              {row.missedStudentCount > 0 && (
                                <span
                                  style={{
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    border: "1px solid #fde68a",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                  }}
                                >
                                  👤 {row.missedStudentCount} Student Missed
                                </span>
                              )}
                              {row.missedMentorCount > 0 && (
                                <span
                                  style={{
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    border: "1px solid #fecaca",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                  }}
                                >
                                  👨‍🏫 {row.missedMentorCount} Mentor Missed
                                </span>
                              )}
                              {row.cancelledCount > 0 && (
                                <span
                                  style={{
                                    background: "#f3f4f6",
                                    color: "#374151",
                                    border: "1px solid #d1d5db",
                                    padding: "0.125rem 0.375rem",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                  }}
                                >
                                  ⚪ {row.cancelledCount} Cancelled
                                </span>
                              )}
                              <span
                                style={{
                                  color: "#6b7280",
                                  fontSize: "0.75rem",
                                  marginLeft: "0.5rem",
                                }}
                              >
                                {totalSessions} total session
                                {totalSessions !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: windowWidth < 700 ? "column" : "row",
                              alignItems: windowWidth < 700 ? "stretch" : "center",
                              gap: "0.75rem",
                              width: windowWidth < 700 ? "100%" : "160px",
                              boxSizing: "border-box",
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRowForModal(row);
                              }}
                              style={{
                                background: "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.5rem 0.75rem",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.375rem",
                                transition: "background-color 0.2s ease",
                                width: "100%",
                                minWidth: windowWidth < 700 ? undefined : "120px",
                              }}
                              onMouseEnter={(e) => (e.target.style.background = "#2563eb")}
                              onMouseLeave={(e) => (e.target.style.background = "#3b82f6")}
                              title="View session details"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-block">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="page-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Previous
                </button>

                <div className="page-list">
                  {[...Array(totalPages)].map((_, i) => {
                    const pageNumber = i + 1;
                    const isCurrentPage = pageNumber === currentPage;

                    const showPage =
                      pageNumber === 1 ||
                      pageNumber === totalPages ||
                      Math.abs(pageNumber - currentPage) <= 1;

                    if (!showPage) {
                      if (pageNumber === 2 && currentPage > 4) {
                        return (
                          <span key={pageNumber} className="ellipsis">
                            ...
                          </span>
                        );
                      }
                      if (pageNumber === totalPages - 1 && currentPage < totalPages - 3) {
                        return (
                          <span key={pageNumber} className="ellipsis">
                            ...
                          </span>
                        );
                      }
                      return null;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`page-btn ${isCurrentPage ? "active" : ""}`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="page-btn"
                >
                  Next
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal Mount */}
      <AdminViewSessionLogsModal
        isOpen={!!selectedRowForModal}
        onClose={() => setSelectedRowForModal(null)}
        row={selectedRowForModal}
        sessions={searchedSessions}
      />
    </div>
  );
}