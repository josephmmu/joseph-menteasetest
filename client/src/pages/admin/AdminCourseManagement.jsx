// AdminCourseManagement.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import AdminEditSubjectModal from "./AdminEditSubjectModal";
import AdminAddCourseInstanceModal from "./AdminAddCourseInstanceModal";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import { useSystemSettings } from "../../context/SystemSettingsContext";

import "./AdminUserManagement.css";
import "../../components/BookSessionModal.css";
import "./AdminToast.css";
import "./AdminCourseManagement.css";

/** ===================== Helpers & Constants ===================== **/
const TERMS = [1, 2, 3];

/** ===================== Availability helpers ===================== **/

// HH:mm → normalized or null
const normalizeHHMM = (val) => {
  if (!val || typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm) || h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// "HH:mm-HH:mm" → { start, end } or null
const parseRangeHHMM = (s = "") => {
  const m = String(s || "").match(
    /^\s*(\d{1,2}:[0-5]\d)\s*-\s*(\d{1,2}:[0-5]\d)\s*$/
  );
  if (!m) return null;
  const start = normalizeHHMM(m[1]);
  const end = normalizeHHMM(m[2]);
  if (!start || !end) return null;
  const toMin = (t) => {
    const [hh, mm] = t.split(":").map(Number);
    return hh * 60 + mm;
  };
  if (toMin(end) <= toMin(start)) return null;
  return { start, end };
};

// Matches backend convention: MWF → Wed/Fri, TThS → Thu/Sat
function deriveAllowedDaysFromScheduleDays(daysRaw = "") {
  const s = String(daysRaw || "").toUpperCase().replace(/\s+/g, "");
  // normalize "TT" shenanigans to TH
  const normalized = s
    .replace(/T{2,}HS/g, "THS")
    .replace(/T{2,}H/g, "TH")
    .replace(/TTH/g, "TH");
  if (normalized.includes("MWF")) return ["Wed", "Fri"];
  if (normalized.includes("THS")) return ["Thu", "Sat"];
  if (normalized === "MW") return ["Wed"]; // optional
  if (normalized === "TF") return ["Fri"]; // optional
  return [];
}

function defaultMentoringBlockForSection(section = "") {
  const c = String(section).trim().toUpperCase();
  if (c.startsWith("A")) return { start: "07:00", end: "08:15" };
  if (c.startsWith("H") || c.startsWith("B")) return { start: "13:15", end: "14:30" };
  if (c.startsWith("S") || c.startsWith("E")) return { start: "18:15", end: "19:30" };
  return { start: "07:00", end: "08:15" };
}

// Build the availability payload we POST/PUT (and use to PATCH)
function buildAvailabilityFromSchedule(schedule = {}, section = "") {
  const mb =
    parseRangeHHMM(schedule?.time || "") ||
    defaultMentoringBlockForSection(section);
  const allowedDays = deriveAllowedDaysFromScheduleDays(schedule?.days || "");
  return {
    mentoringBlock: mb,
    allowedDays,
    openDates: [],
    closedDates: [],
  };
}

/** ===================== Page Component ===================== **/
export default function AdminCourseManagement() {
  // API base
  const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

  // Get system settings from context
  const { academicTerm } = useSystemSettings();

  // Local data state for this page
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);

  // Loading flag (content-only)
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [API]);

  const fetchCourses = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCourses(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    }
  }, [API]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchCourses()]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchUsers, fetchCourses]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Layout
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = windowWidth <= 1152;

  // Filters
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Recently added highlight
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);
  const recentlyAddedTimerRef = useRef(null);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalSubject, setEditModalSubject] = useState(null);
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const coursesPerPage = 10;

  // Build subject catalog from existing courses
  const subjectCatalog = useMemo(() => {
    if (!courses || courses.length === 0) return [];

    const uniqueSubjects = new Map();
    courses.forEach((course) => {
      const key = `${course.courseCode} ${course.courseName}`;
      if (!uniqueSubjects.has(key)) {
        uniqueSubjects.set(key, {
          courseCode: course.courseCode,
          courseName: course.courseName,
          program: course.program,
          yearLevel: course.yearLevel,
        });
      }
    });

    return Array.from(uniqueSubjects.keys()).sort();
  }, [courses]);

  // Get mentor list from users
  const mentorList = useMemo(() => {
    if (!users || users.length === 0) return [];

    const isMentorUser = (u) => {
      if (!u) return false;
      const roleCandidates = [
        u.role,
        u.roleName,
        u.roleId,
        u.type,
        u.roles,
      ].filter(Boolean);
      for (const r of roleCandidates) {
        if (Array.isArray(r)) {
          if (r.some((x) => String(x).toLowerCase().includes("mentor")))
            return true;
        } else if (String(r).toLowerCase().includes("mentor")) return true;
      }
      if (u.isMentor) return true;
      return false;
    };

    return users.filter(isMentorUser).map((user) => ({
      _id: user._id || user.id || "",
      name: user.name || "",
      email: user.email || "",
      program: user.program || "N/A",
    }));
  }, [users]);

  // Helper to format SY
  const getSchoolYearLabel = (schoolYearStr) => {
    if (typeof schoolYearStr === "string" && schoolYearStr.includes("-")) {
      return `SY ${schoolYearStr}`;
    }
    if (academicTerm?.startYear && academicTerm?.endYear) {
      return `SY ${academicTerm.startYear}-${academicTerm.endYear}`;
    }
    return "SY (unknown)";
  };

  // Available years for filter
  const getAvailableSchoolYears = () => {
    const years = new Set();
    courses.forEach((course) => {
      if (course.schoolYear) years.add(course.schoolYear);
    });
    return Array.from(years).sort();
  };

  // All courses
  const allCourses = useMemo(() => courses || [], [courses]);

  // Filtered courses
  const getFilteredCourses = () => {
    let filtered = [...allCourses];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((course) => {
        const derivedMentor =
          course.assignedMentor ||
          (
            mentorList.find(
              (m) => m._id === (course.mentorId || course.mentor)
            ) || {}
          ).name;
        return (
          course.courseCode?.toLowerCase().includes(q) ||
          course.courseName?.toLowerCase().includes(q) ||
          derivedMentor?.toLowerCase().includes(q) ||
          course.section?.toLowerCase().includes(q) ||
          course.program?.toLowerCase().includes(q)
        );
      });
    }

    // Year
    if (selectedYear) {
      filtered = filtered.filter(
        (course) => course.schoolYear === selectedYear
      );
    }

    // Term
    if (selectedTerm) {
      filtered = filtered.filter(
        (course) => course.term === parseInt(selectedTerm)
      );
    }

    // Program
    if (selectedProgram) {
      filtered = filtered.filter(
        (course) => course.program?.toUpperCase() === selectedProgram
      );
    }

    // Sort newest
    filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    // Pin recent
    if (recentlyAddedId) {
      const idx = filtered.findIndex(
        (c) => c._id === recentlyAddedId || c.id === recentlyAddedId
      );
      if (idx > 0) {
        const pinned = filtered[idx];
        filtered = [
          pinned,
          ...filtered.slice(0, idx),
          ...filtered.slice(idx + 1),
        ];
      }
    }

    return filtered;
  };

  const filteredCourses = getFilteredCourses();

  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / coursesPerPage);
  const startIndex = (currentPage - 1) * coursesPerPage;
  const endIndex = startIndex + coursesPerPage;
  const paginatedCourses = filteredCourses.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear, selectedTerm, selectedProgram, searchQuery]);

  // Auto-clear "New" highlight
  useEffect(() => {
    if (recentlyAddedId) {
      if (recentlyAddedTimerRef.current)
        clearTimeout(recentlyAddedTimerRef.current);
      recentlyAddedTimerRef.current = setTimeout(() => {
        setRecentlyAddedId(null);
        recentlyAddedTimerRef.current = null;
      }, 8000);
    }
    return () => {
      if (recentlyAddedTimerRef.current) {
        clearTimeout(recentlyAddedTimerRef.current);
        recentlyAddedTimerRef.current = null;
      }
    };
  }, [recentlyAddedId]);

  // Toast cleanup
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = (message, type = "success") => {
    if (!message) return;

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }

    if (toast) {
      setToast(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const id = Date.now() + Math.random().toString(36).slice(2, 7);
          setToast({ id, type, message });
          toastTimer.current = setTimeout(() => {
            setToast(null);
            toastTimer.current = null;
          }, 3000);
        });
      });
      return;
    }

    const id = Date.now() + Math.random().toString(36).slice(2, 7);
    setToast({ id, type, message });
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3000);
  };

  /** ===================== Handlers ===================== **/

  const handleAddCourseInstance = async (courseData) => {
    try {
      if (!academicTerm || !academicTerm._id) {
        showToast(
          "No active academic term found. Please set an active term first.",
          "error"
        );
        return;
      }

      const parts = courseData.subject.split(" ");
      const courseCode = parts[0];
      const courseName = parts.slice(1).join(" ");

      const mentorMatch =
        mentorList.find((m) => m._id === courseData.mentor) ||
        mentorList.find((m) => m.name === courseData.mentor);

      if (!mentorMatch) {
        showToast("Mentor not found. Please select a valid mentor.", "error");
        return;
      }

      const inferProgram = (code) => {
        const c = (code || "").toUpperCase();
        if (/-IT/.test(c) || c.includes("IT")) return "IT";
        if (/-BA/.test(c) || c.includes("BA")) return "BA";
        if (/-GE/.test(c) || c.includes("GE") || c.includes("SS")) return "GE";
        return "IT";
      };

      // Build the base course
      const schedule = courseData.schedule || {};
      const section = courseData.section.trim();

      // Build availability from schedule + section
      const availability = buildAvailabilityFromSchedule(schedule, section);

      const newCourse = {
        courseCode,
        courseName,
        yearLevel: parseInt(courseData.courseYear) || 1,
        program: courseData.newSubjectData?.program || inferProgram(courseCode),
        mentor: mentorMatch._id,
        section,
        academicTerm: academicTerm?._id,
        schedule,
        defaultMeetLink: "",
        // try to seed via POST (some backends accept)
        availability,
      };

      const token = localStorage.getItem("token");

      const response = await axios.post(`${API}/api/courses`, newCourse, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const created = response.data;
      if (created && (created._id || created.id)) {
        const cid = created._id || created.id;

        // Also PATCH in case POST ignored availability:
        // 1) mentoring block
        try {
          await axios.patch(
            `${API}/api/courses/${cid}/mentoring`,
            {
              start: availability.mentoringBlock.start,
              end: availability.mentoringBlock.end,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (e) {
          console.warn("Mentoring PATCH failed (create):", e?.response?.data || e?.message);
        }

        // 2) allowedDays/open/closed dates
        try {
          await axios.patch(
            `${API}/api/courses/${cid}/availability`,
            {
              allowedDays: availability.allowedDays,
              openDates: availability.openDates,
              closedDates: availability.closedDates,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (e) {
          console.warn("Availability PATCH failed (create):", e?.response?.data || e?.message);
        }

        await refreshData();
        setRecentlyAddedId(cid);
        showToast(
          `${courseData.subject} has been added successfully for ${getSchoolYearLabel(
            academicTerm.schoolYear
          )}, Term ${academicTerm.term}.`,
          "success"
        );
        setShowAddCourseModal(false);
      }
    } catch (error) {
      console.error("Error adding course:", error);
      showToast(
        error.response?.data?.message || "Failed to add course",
        "error"
      );
    }
  };

  const handleSaveEditModal = async (updatedCourse) => {
    try {
      if (!updatedCourse || !updatedCourse.id) return;

      const mentorMatch = mentorList.find(
        (m) => m.name === updatedCourse.assignedMentor
      );
      if (!mentorMatch) {
        showToast("Mentor not found. Please select a valid mentor.", "error");
        return;
      }

      const schedule = updatedCourse.schedule || {};
      const section = updatedCourse.section || "";

      // Keep availability aligned with the schedule
      const availability = buildAvailabilityFromSchedule(schedule, section);

      const updateData = {
        courseCode: updatedCourse.courseCode,
        courseName: updatedCourse.courseName,
        section: updatedCourse.section,
        mentor: mentorMatch._id,
        schedule,
        program: updatedCourse.program,
        availability, // some backends accept it directly
      };

      const token = localStorage.getItem("token");

      await axios.put(`${API}/api/courses/${updatedCourse.id}`, updateData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Also PATCH to guarantee calendars update:
      try {
        await axios.patch(
          `${API}/api/courses/${updatedCourse.id}/mentoring`,
          {
            start: availability.mentoringBlock.start,
            end: availability.mentoringBlock.end,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.warn("Mentoring PATCH failed (update):", e?.response?.data || e?.message);
      }

      try {
        await axios.patch(
          `${API}/api/courses/${updatedCourse.id}/availability`,
          {
            allowedDays: availability.allowedDays,
            openDates: availability.openDates,
            closedDates: availability.closedDates,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (e) {
        console.warn("Availability PATCH failed (update):", e?.response?.data || e?.message);
      }

      await refreshData();
      setRecentlyAddedId(updatedCourse.id || updatedCourse._id);
      showToast(
        `${updatedCourse.courseCode} ${updatedCourse.courseName} has been updated successfully.`,
        "success"
      );
      setShowEditModal(false);
      setEditModalSubject(null);
    } catch (error) {
      console.error("Error updating course:", error);
      showToast(
        error.response?.data?.message || "Failed to update course",
        "error"
      );
    }
  };

  const handleDelete = async (courseId) => {
    try {
      await axios.delete(`${API}/api/courses/${courseId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      await refreshData();
      setDeleteConfirm(null);
      showToast("Course has been deleted successfully.", "success");
    } catch (error) {
      console.error("Error deleting course:", error);
      showToast(
        error.response?.data?.message || "Failed to delete course",
        "error"
      );
    }
  };

  const handleOpenEditModal = (course) => {
    setEditModalSubject(course);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
  };

  // ===================== FIXED: Proper 12h rendering from 24h or 12h inputs =====================
  const formatScheduleTime = (range, slot) => {
    if (!range) return "";

    const parseHHMM = (t) => {
      const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h < 0 || h > 23 || min < 0 || min > 59) return null;
      return { h, min };
    };

    const to12h = ({ h, min }) => {
      const period = h >= 12 ? "PM" : "AM";
      let hh = h % 12;
      if (hh === 0) hh = 12;
      return { time: `${hh}:${String(min).padStart(2, "0")}`, period };
    };

    const [sRaw, eRaw] = (range || "").split("-").map((x) => (x || "").trim());
    if (!sRaw || !eRaw) return range;

    const s24 = parseHHMM(sRaw);
    const e24 = parseHHMM(eRaw);

    // If valid 24h (or any HH:mm) strings, render proper 12h with AM/PM
    if (s24 && e24) {
      const s12 = to12h(s24);
      const e12 = to12h(e24);
      return s12.period === e12.period
        ? `${s12.time}–${e12.time} ${s12.period}`
        : `${s12.time} ${s12.period}–${e12.time} ${e12.period}`;
    }

    // Fallback for legacy ambiguous values: use slot to hint AM/PM
    const period = slot === "A" ? "AM" : "PM";
    return `${sRaw}–${eRaw} ${period}`;
  };

  /** ===================== UI ===================== **/
  return (
    <div className="page-wrapper admin-user-control admin-course-management">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage={"Course Management"} />}

        {/* dashboard-main is the scroller on desktop; body scroll on small via CSS */}
        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>Course Management</h2>
            <p className="subtext">
              Manage all courses in the system. Search and filter courses by
              subject, mentor, or section.
            </p>

            {/* Course Statistics */}
            <div className="user-stats-section">
              {isLoading ? (
                <div className="stats-grid">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={`stat-skeleton-${i}`}
                      className="stat-card skeleton"
                    >
                      <div className="stat-icon skeleton-icon" />
                      <div className="stat-content">
                        <div className="skeleton-line h-xl w-30 mb-2" />
                        <div className="skeleton-line h-sm w-45" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="stats-grid">
                    <div className="stat-card total accent-purple">
                      <div className="stat-icon">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="4" width="18" height="14" rx="2" />
                          <path d="M3 10h18" />
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-number">{allCourses.length}</div>
                        <div className="stat-label">Total Courses</div>
                      </div>
                    </div>

                    <div className="stat-card students accent-blue">
                      <div className="stat-icon">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="12" rx="2" />
                          <path d="M8 20h8" />
                          <path d="M12 16v4" />
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-number">
                          {
                            allCourses.filter(
                              (c) => (c.program || "").toUpperCase() === "IT"
                            ).length
                          }
                        </div>
                        <div className="stat-label">IT Courses</div>
                      </div>
                    </div>

                    <div className="stat-card mentors accent-green">
                      <div className="stat-icon">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 7h-3V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2H3v12h18V7z" />
                          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                          <path d="M3 13h18" />
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-number">
                          {
                            allCourses.filter(
                              (c) => (c.program || "").toUpperCase() === "BA"
                            ).length
                          }
                        </div>
                        <div className="stat-label">BA Courses</div>
                      </div>
                    </div>

                    <div className="stat-card admins accent-amber">
                      <div className="stat-icon">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
                          <path d="M20 2H6.5A2.5 2.5 0 0 0 4 4.5v15" />
                          <path d="M20 22V2" />
                          <path d="M8 6h6" />
                        </svg>
                      </div>
                      <div className="stat-content">
                        <div className="stat-number">
                          {
                            allCourses.filter(
                              (c) => (c.program || "").toUpperCase() === "GE"
                            ).length
                          }
                        </div>
                        <div className="stat-label">GE Courses</div>
                      </div>
                    </div>
                  </div>
                  <div className="small-muted">
                    Across all academic years and terms.
                  </div>
                </>
              )}
            </div>

            {/* Search and Filter Bar */}
            <div className="search-filter-bar">
              {/* Search Input */}
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
                    placeholder="Search courses by subject, mentor, or section"
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      className="search-clear"
                      onClick={() => setSearchQuery("")}
                      title="Clear search"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Toggle */}
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
                  {(selectedYear || selectedTerm || selectedProgram) && (
                    <span className="filter-badge">
                      {
                        [selectedYear, selectedTerm, selectedProgram].filter(
                          Boolean
                        ).length
                      }
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Filter Panel */}
            {showFilters && (
              <div className="filter-panel-collapsible">
                <div className="filter-panel-header">
                  <h3>Filter Courses</h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedYear("");
                      setSelectedTerm("");
                      setSelectedProgram("");
                    }}
                  >
                    Clear All
                  </button>
                </div>

                <div className={`filter-grid ${isMobile ? "mobile" : ""}`}>
                  <div className="filter-field">
                    <label className="filter-label">Academic Year</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="filter-select"
                    >
                      <option value="">All Years</option>
                      {getAvailableSchoolYears().map((year) => (
                        <option key={year} value={year}>
                          {getSchoolYearLabel(year)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-field">
                    <label className="filter-label">Term</label>
                    <select
                      value={selectedTerm}
                      onChange={(e) => setSelectedTerm(e.target.value)}
                      className="filter-select"
                    >
                      <option value="">All Terms</option>
                      {TERMS.map((t) => (
                        <option key={t} value={t}>
                          Term {t}
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
                      <option value="IT">IT</option>
                      <option value="BA">BA</option>
                      <option value="GE">GE</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Course List */}
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
                    {isLoading ? (
                      "Loading courses…"
                    ) : (
                      <>
                        Showing {startIndex + 1}-
                        {Math.min(endIndex, filteredCourses.length)} of{" "}
                        {filteredCourses.length} course
                        {filteredCourses.length !== 1 ? "s" : ""}
                        {selectedYear ||
                        selectedTerm ||
                        selectedProgram ||
                        searchQuery ? (
                          <>
                            {" "}
                            (filtered
                            {selectedYear &&
                              ` for ${getSchoolYearLabel(selectedYear)}`}
                            {selectedTerm && ` Term ${selectedTerm}`}
                            {selectedProgram && ` Program ${selectedProgram}`}
                            {searchQuery && ` matching "${searchQuery}"`})
                          </>
                        ) : (
                          " (all courses)"
                        )}
                      </>
                    )}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    {!isLoading && totalPages > 1 && (
                      <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                        Page {currentPage} of {totalPages}
                      </span>
                    )}
                    <button
                      onClick={() => setShowAddCourseModal(true)}
                      className="btn btn-outline-primary"
                      title="Add new course"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add Course
                    </button>
                  </div>
                </div>

                <div className="user-list">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={`skeleton-${i}`} className="user-card skeleton">
                        <div className="user-info" style={{ flex: 1 }}>
                          <div className="skeleton-line h-lg w-40 mb-2" />
                          <div className="skeleton-line h-sm w-65 mb-1" />
                          <div className="skeleton-line h-sm w-50" />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                          }}
                        >
                          <div className="skeleton-button" />
                          <div className="skeleton-button" />
                        </div>
                      </div>
                    ))
                  ) : filteredCourses.length === 0 ? (
                    <div
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      No courses found
                      {selectedYear ||
                      selectedTerm ||
                      selectedProgram ||
                      searchQuery ? (
                        <>
                          {selectedYear &&
                            ` for ${getSchoolYearLabel(selectedYear)}`}
                          {selectedTerm && ` Term ${selectedTerm}`}
                          {selectedProgram && ` Program ${selectedProgram}`}
                          {searchQuery && ` matching "${searchQuery}"`}
                        </>
                      ) : (
                        " (all courses)"
                      )}
                      .
                    </div>
                  ) : (
                    paginatedCourses.map((course, idx) => {
                      const key = course._id || course.id || idx;
                      const isNew =
                        recentlyAddedId === (course._id || course.id);
                      return (
                        <div
                          key={key}
                          className={`user-card ${isNew ? "is-new" : ""}`}
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
                                {course.courseCode} - {course.courseName}
                                <span
                                  className={`badge program-${course.program}`}
                                >
                                  {course.program}
                                </span>
                                {isNew && (
                                  <span className="badge new">New</span>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "0.875rem",
                                marginBottom: "0.25rem",
                              }}
                            >
                              Section {course.section} •{" "}
                              {course.assignedMentor ||
                                (
                                  mentorList.find(
                                    (m) =>
                                      m._id ===
                                      (course.mentorId || course.mentor)
                                  ) || {}
                                ).name ||
                                "Unknown"}
                            </div>

                            {(() => {
                              const days =
                                course?.schedule?.days ??
                                course?.meetingDays ??
                                "";
                              const time =
                                course?.schedule?.time ??
                                course?.meetingTime ??
                                "";
                              const slotFromSchedule =
                                course?.schedule?.timeSlot;
                              const slotFromSection = (course?.section ||
                                "")[0];
                              const slot =
                                slotFromSchedule ||
                                (["A", "H", "S"].includes(slotFromSection)
                                  ? slotFromSection
                                  : undefined);
                              const timeStr = formatScheduleTime(time, slot);

                              return days || timeStr ? (
                                <div
                                  style={{
                                    color: "#64748b",
                                    fontSize: "0.875rem",
                                    marginBottom: "0.25rem",
                                  }}
                                >
                                  {days || "---"} • {timeStr || "---"}
                                </div>
                              ) : null;
                            })()}

                            {course.schoolYear && course.term && (
                              <div
                                style={{
                                  fontSize: "0.875rem",
                                  color: "#3b82f6",
                                  marginTop: "0.25rem",
                                }}
                              >
                                {getSchoolYearLabel(course.schoolYear)}, Term{" "}
                                {course.term}
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(course);
                              }}
                              className="btn btn-action btn-edit"
                              title="Edit course"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                              </svg>
                              Edit
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({
                                  id: course._id || course.id,
                                  name: `${course.courseCode} ${course.courseName}`,
                                });
                              }}
                              className="btn btn-action btn-delete"
                              title="Delete course"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {!isLoading && totalPages > 1 && (
                  <div className="pagination">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="page-btn"
                    >
                      Previous
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (pageNumber) => {
                        const isCurrentPage = pageNumber === currentPage;
                        const isNearCurrent =
                          pageNumber === 1 ||
                          pageNumber === totalPages ||
                          Math.abs(pageNumber - currentPage) <= 1;

                        if (!isNearCurrent) {
                          if (pageNumber === 2 && currentPage > 4) {
                            return (
                              <span
                                key={`ellipsis-${pageNumber}`}
                                className="ellipsis"
                              >
                                ...
                              </span>
                            );
                          } else if (
                            pageNumber === totalPages - 1 &&
                            currentPage < totalPages - 3
                          ) {
                            return (
                              <span
                                key={`ellipsis-${pageNumber}`}
                                className="ellipsis"
                              >
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
                            className={`page-btn ${
                              isCurrentPage ? "active" : ""
                            }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      }
                    )}

                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="page-btn"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Edit Subject Modal */}
            {showEditModal && (
              <AdminEditSubjectModal
                isOpen={showEditModal}
                onClose={handleCloseEditModal}
                subject={editModalSubject}
                onSave={handleSaveEditModal}
                mentorList={mentorList}
                getAcademicYearLabel={getSchoolYearLabel}
              />
            )}

            {/* Add Course Instance Modal */}
            {showAddCourseModal && (
              <AdminAddCourseInstanceModal
                isOpen={showAddCourseModal}
                onClose={() => setShowAddCourseModal(false)}
                onSave={handleAddCourseInstance}
                subjectCatalog={subjectCatalog}
                mentorList={mentorList}
                academicTerm={academicTerm}
                getSchoolYearLabel={getSchoolYearLabel}
              />
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm &&
              createPortal(
                <div
                  className="modal-overlay"
                  onClick={() => setDeleteConfirm(null)}
                  style={{ zIndex: 5100 }}
                >
                  <div
                    className="modal-content"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "50%",
                          background: "#fef2f2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="2"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </div>
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "1.125rem",
                            fontWeight: "600",
                            color: "#111827",
                          }}
                        >
                          Delete Course
                        </h3>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.875rem",
                            color: "#6b7280",
                          }}
                        >
                          This action cannot be undone
                        </p>
                      </div>
                    </div>

                    <div style={{ marginBottom: "1.5rem" }}>
                      <p
                        style={{
                          margin: 0,
                          color: "#374151",
                          fontSize: "0.875rem",
                          lineHeight: "1.5",
                        }}
                      >
                        Are you sure you want to delete this course? This will
                        permanently remove the course and all associated data.
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="btn btn-ghost"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(deleteConfirm.id)}
                        className="btn btn-action btn-delete"
                      >
                        Delete Course
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

            {/* Toast */}
            {toast &&
              createPortal(
                <div
                  key={toast.id}
                  className={`toast ${toast.type}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {toast.message}
                </div>,
                document.body
              )}
          </div>
        </main>
      </div>
    </div>
  );
}