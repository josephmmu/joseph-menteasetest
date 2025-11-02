import Header from "../../components/Header";
import MobileNav from "../../components/MobileNav";
import Sidebar from "../../components/Sidebar";
import "../../components/BookSessionModal.css";
import "./AdminDashboard.css";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useCourseColor } from "../../context/CourseColorContext";

export default function AdminDashboard() {
  const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

  // Layout
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

  // -----------------------------
  // DB-backed state (no seed data)
  // -----------------------------
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    users: null,
    courses: null,
    usersByRole: null,
    coursesByProgram: null,
  });
  const [error, setError] = useState("");

  // Helpers to normalize server data
  const getUserRole = (u) => {
    // try nested role ref first, then fallbacks you’ve used elsewhere
    return (
      u?.roleId?.roleName ||
      u?.roleName ||
      u?.role ||
      "" // unknown becomes ""
    );
  };

  const getCourseProgramLabel = (c) => {
    // robustly pull a short label from program field in different shapes
    const p = c?.program;
    if (!p) return "Unknown";
    if (typeof p === "string") return p;
    // object forms
    return p.code || p.name || p.title || p.short || "Unknown";
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Not authenticated.");
        setCounts({
          users: 0,
          courses: 0,
          usersByRole: {},
          coursesByProgram: {},
        });
        setLoading(false);
        return;
      }

      // Fetch in parallel
      const [usersRes, coursesRes] = await Promise.all([
        fetch(`${API}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API}/api/courses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!usersRes.ok) {
        const err = await usersRes.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch users");
      }
      if (!coursesRes.ok) {
        const err = await coursesRes.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch courses");
      }

      const users = await usersRes.json();
      const courses = await coursesRes.json();

      // Compute totals and breakdowns
      const usersTotal = Array.isArray(users) ? users.length : 0;
      const usersByRole = (Array.isArray(users) ? users : []).reduce((acc, u) => {
        const role = getUserRole(u) || "unknown";
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      const coursesTotal = Array.isArray(courses) ? courses.length : 0;
      const coursesByProgram = (Array.isArray(courses) ? courses : []).reduce(
        (acc, c) => {
          const prog = getCourseProgramLabel(c) || "Unknown";
          acc[prog] = (acc[prog] || 0) + 1;
          return acc;
        },
        {}
      );

      setCounts({
        users: usersTotal,
        courses: coursesTotal,
        usersByRole,
        coursesByProgram,
      });
    } catch (e) {
      console.error("Dashboard fetch error:", e);
      setError(e.message || "Failed to load dashboard data");
      setCounts({
        users: null,
        courses: null,
        usersByRole: null,
        coursesByProgram: null,
      });
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Re-fetch on window focus (handy after admin changes)
  useEffect(() => {
    const onFocus = () => fetchDashboardData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboardData]);

  // Derived flags
  const hasUsersByRole = useMemo(
    () => counts.usersByRole && Object.keys(counts.usersByRole).length > 0,
    [counts.usersByRole]
  );
  const hasCoursesByProgram = useMemo(
    () => counts.coursesByProgram && Object.keys(counts.coursesByProgram).length > 0,
    [counts.coursesByProgram]
  );

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
              Welcome to the admin dashboard. Get an overview of users and courses across the system.
            </p>

            {/* Optional inline error */}
            {error && (
              <div
                style={{
                  background: "#FEF2F2",
                  color: "#991B1B",
                  border: "1px solid #FCA5A5",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}

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
                    <div className="stat-number">
                      {loading ? "…" : counts.users ?? "—"}
                    </div>
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
                    <div className="stat-number">
                      {loading ? "…" : counts.courses ?? "—"}
                    </div>
                    <div className="stat-label">Total Courses</div>
                  </div>
                </div>

                {/* (Total Sessions removed per your request) */}
              </div>
            </div>

            {/* System Breakdown */}
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
                      <span className="chip">
                        Total: {loading ? "…" : counts.users ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div className="breakdown-items">
                    {loading ? (
                      <div className="muted">Loading…</div>
                    ) : hasUsersByRole ? (
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
                        {loading
                          ? "…"
                          : counts.coursesByProgram
                          ? Object.values(counts.coursesByProgram).reduce(
                              (a, b) => a + b,
                              0
                            )
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="breakdown-items">
                    {loading ? (
                      <div className="muted">Loading…</div>
                    ) : hasCoursesByProgram ? (
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

                {/* (Sessions by Program card removed) */}
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

                {/* (Session Analytics shortcut removed) */}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}