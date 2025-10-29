import Header from "../../components/Header";
import MobileNav from "../../components/MobileNav";
import Sidebar from "../../components/Sidebar";
import "../../components/BookSessionModal.css";
import "./AdminDashboard.css";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCourseColor } from "../../context/CourseColorContext";
import { ALL_USERS, ALL_COURSES, GENERATED_SESSIONS } from "../../lib/seedData";

export default function AdminDashboard() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = windowWidth <= 1152;
  const { getCourseColor, normalizeCourseKey } = useCourseColor();

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const cardVars = (subject) => {
    const base = getCourseColor(normalizeCourseKey(subject || ""));
    return {
      borderTop: `4px solid ${base}`,
      "--accent": base,
      "--accentHover": base,
      "--accentRing": "rgba(0,0,0,0.08)",
    };
  };

  // Remove emoji / pictographic characters from labels for clean display
  const cleanLabel = (value) => {
    try {
      const s = String(value || "");
      return s.replace(/\p{Extended_Pictographic}/gu, "").trim();
    } catch {
      return String(value || "")
        .replace(
          /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u2600-\u26FF]|[\u2700-\u27BF]/gu,
          ""
        )
        .trim();
    }
  };

  const displayRole = (r) => {
    const cleaned = cleanLabel(r);
    if (!cleaned) {
      const fallback = String(r || "")
        .replace(
          /(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u2600-\u26FF]|[\u2700-\u27BF])/gu,
          ""
        )
        .trim();
      if (!fallback) return r;
      return fallback.charAt(0).toUpperCase() + fallback.slice(1);
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  // Local summary counts
  const [counts, setCounts] = useState({
    users: null,
    courses: null,
    sessions: null,
    usersByRole: null,
    coursesByProgram: null,
    sessionsByProgram: null,
  });

  const refreshCounts = () => {
    try {
      const users = ALL_USERS.length;
      const courses = ALL_COURSES.length;
      const sessions = GENERATED_SESSIONS.length;

      const usersByRole = ALL_USERS.reduce((acc, u) => {
        const r = u.role || "unknown";
        acc[r] = (acc[r] || 0) + 1;
        return acc;
      }, {});

      const coursesByProgram = ALL_COURSES.reduce((acc, c) => {
        const p = c.program || "Unknown";
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {});

      const sessionsByProgram = GENERATED_SESSIONS.reduce((acc, s) => {
        const p = s.program || "Unknown";
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {});

      setCounts({
        users,
        courses,
        sessions,
        usersByRole,
        coursesByProgram,
        sessionsByProgram,
      });
    } catch {
      setCounts({ users: null, courses: null, sessions: null });
    }
  };

  useEffect(() => {
    refreshCounts();
  }, []);

  return (
    <div className="page-wrapper admin-user-control">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Dashboard" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>Admin Dashboard</h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Welcome to the admin dashboard. Get an overview of users, courses,
              and sessions across the system.
            </p>

            {/* System Statistics */}
            <div className="user-stats-section" style={{ marginTop: "0.5rem" }}>
              <div className="stats-grid">
                <div
                  className="stat-card total"
                  style={{ borderLeft: "4px solid #8b5cf6" }}
                >
                  <div
                    className="stat-icon"
                    style={{
                      color: "#8b5cf6",
                      background: "rgba(139,92,246,0.12)",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">{counts.users ?? "—"}</div>
                    <div className="stat-label">Total Users</div>
                  </div>
                </div>

                <div
                  className="stat-card students"
                  style={{ borderLeft: "4px solid #3b82f6" }}
                >
                  <div
                    className="stat-icon"
                    style={{
                      color: "#3b82f6",
                      background: "rgba(59,130,246,0.12)",
                    }}
                  >
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
                    <div className="stat-number">{counts.courses ?? "—"}</div>
                    <div className="stat-label">Total Courses</div>
                  </div>
                </div>

                <div
                  className="stat-card mentors"
                  style={{ borderLeft: "4px solid #10b981" }}
                >
                  <div
                    className="stat-icon"
                    style={{
                      color: "#10b981",
                      background: "rgba(16,185,129,0.12)",
                    }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">{counts.sessions ?? "—"}</div>
                    <div className="stat-label">Total Sessions</div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Breakdown (improved cards) */}
            <div className="breakdown-section" style={{ marginTop: "1.5rem" }}>
              <h3
                style={{
                  marginBottom: "1rem",
                  fontSize: "1.25rem",
                  fontWeight: "600",
                }}
              >
                System Breakdown
              </h3>

              <div className="admin-breakdown-row">
                {/* Users by Role */}
                <div className="breakdown-card breakdown-accent-purple">
                  <div className="breakdown-head">
                    <div className="head-left">
                      <div className="head-dot" />
                      <div className="breakdown-title">Users by Role</div>
                    </div>
                    <div className="head-right">
                      <span className="chip">Total: {counts.users ?? "—"}</span>
                    </div>
                  </div>

                  <div className="breakdown-items">
                    {counts.usersByRole ? (
                      Object.entries(counts.usersByRole)
                        .sort((a, b) => b[1] - a[1])
                        .map(([role, n]) => {
                          const total = counts.users || 0;
                          const pct = total ? Math.round((n / total) * 100) : 0;
                          return (
                            <div key={role} className="breakdown-item">
                              <div className="breakdown-meta">
                                <div className="breakdown-key">
                                  {displayRole(role)}
                                </div>
                                <div className="breakdown-val">
                                  {n}
                                  <span className="pct">{pct}%</span>
                                </div>
                              </div>
                              <div className="progress">
                                <div
                                  className="progress-bar"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="muted">—</div>
                    )}
                  </div>
                </div>

                {/* Courses by Program */}
                <div className="breakdown-card breakdown-accent-blue">
                  <div className="breakdown-head">
                    <div className="head-left">
                      <div className="head-dot" />
                      <div className="breakdown-title">Courses by Program</div>
                    </div>
                    <div className="head-right">
                      <span className="chip">
                        Total:{" "}
                        {counts.coursesByProgram
                          ? Object.values(counts.coursesByProgram).reduce(
                              (a, b) => a + b,
                              0
                            )
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="breakdown-items">
                    {counts.coursesByProgram ? (
                      Object.entries(counts.coursesByProgram)
                        .sort((a, b) => b[1] - a[1])
                        .map(([prog, n]) => {
                          const total = Object.values(
                            counts.coursesByProgram
                          ).reduce((a, b) => a + b, 0);
                          const pct = total ? Math.round((n / total) * 100) : 0;
                          return (
                            <div key={prog} className="breakdown-item">
                              <div className="breakdown-meta">
                                <div className="breakdown-key">{prog}</div>
                                <div className="breakdown-val">
                                  {n}
                                  <span className="pct">{pct}%</span>
                                </div>
                              </div>
                              <div className="progress">
                                <div
                                  className="progress-bar"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="muted">—</div>
                    )}
                  </div>
                </div>

                {/* Sessions by Program */}
                <div className="breakdown-card breakdown-accent-green">
                  <div className="breakdown-head">
                    <div className="head-left">
                      <div className="head-dot" />
                      <div className="breakdown-title">Sessions by Program</div>
                    </div>
                    <div className="head-right">
                      <span className="chip">
                        Total:{" "}
                        {counts.sessionsByProgram
                          ? Object.values(counts.sessionsByProgram).reduce(
                              (a, b) => a + b,
                              0
                            )
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="breakdown-items">
                    {counts.sessionsByProgram ? (
                      Object.entries(counts.sessionsByProgram)
                        .sort((a, b) => b[1] - a[1])
                        .map(([prog, n]) => {
                          const total = Object.values(
                            counts.sessionsByProgram
                          ).reduce((a, b) => a + b, 0);
                          const pct = total ? Math.round((n / total) * 100) : 0;
                          return (
                            <div key={prog} className="breakdown-item">
                              <div className="breakdown-meta">
                                <div className="breakdown-key">{prog}</div>
                                <div className="breakdown-val">
                                  {n}
                                  <span className="pct">{pct}%</span>
                                </div>
                              </div>
                              <div className="progress">
                                <div
                                  className="progress-bar"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="muted">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Controls Section */}
            <div
              className="admin-controls-section"
              style={{ marginTop: "2rem" }}
            >
              <h3
                style={{
                  marginBottom: "1rem",
                  fontSize: "1.25rem",
                  fontWeight: "600",
                }}
              >
                Quick Actions
              </h3>
              <div className="controls-grid">
                <Link
                  to="/admin/users"
                  className="control-card"
                  style={cardVars("quick-info")}
                >
                  <div className="control-card-inner">
                    <div className="control-icon">👥</div>
                    <div className="control-title">User Management</div>
                    <div className="control-desc">
                      Manage students, mentors, and admins. Search, filter, and
                      edit users.
                    </div>
                    <div className="control-cta">Open</div>
                  </div>
                </Link>

                <Link
                  to="/admin/courses"
                  className="control-card"
                  style={cardVars()}
                >
                  <div className="control-card-inner">
                    <div className="control-icon">📚</div>
                    <div className="control-title">Course Management</div>
                    <div className="control-desc">
                      Manage course instances, assign mentors, and edit
                      subjects.
                    </div>
                    <div className="control-cta">Open</div>
                  </div>
                </Link>

                <Link
                  to="/admin/analytics"
                  className="control-card"
                  style={cardVars()}
                >
                  <div className="control-card-inner">
                    <div className="control-icon">📈</div>
                    <div className="control-title">Session Analytics</div>
                    <div className="control-desc">
                      View session trends, program breakdowns, and status
                      distributions.
                    </div>
                    <div className="control-cta">Open</div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}