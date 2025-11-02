import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import "../../components/BookSessionModal.css";
import "./AdminUserManagement.css";
import "./AdminToast.css";
import { useCourseColor } from "../../context/CourseColorContext";
import { useAuth } from "../../context/AuthContext";

export default function AdminUserManagement() {
  const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
  const { user: currentUser } = useAuth();

  // --- Constants (kept at the top so we can reuse in normalization) ---
  const PROGRAMS = ["IT", "BA", "GE"];
  const PROGRAM_LABELS = {
    IT: "Information Technology",
    BA: "Business Administration",
    GE: "General Education",
  };
  const ROLES = ["student", "mentor", "admin"];
  const ROLE_LABELS = { student: "Student", mentor: "Mentor", admin: "Admin" };

  // Layout
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1152);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1152);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Modal states
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editProgram, setEditProgram] = useState("");

  // Filter states
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Toast
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  // Data
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Course colors
  const { palettes } = useCourseColor();
  const getUserAccent = (program) => {
    if (!program) return palettes.FALLBACK;
    const key = program === "GE" ? "GENED" : program;
    const table = palettes[key];
    if (!table) return palettes.FALLBACK;
    return table[1] || palettes.FALLBACK;
  };

  // Helpers
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000
    );
  };

  // --- Normalization: ensure admins have no program; drop unknown codes
  const sanitizeProgram = (role, program) => {
    if (role === "admin") return null;
    return PROGRAMS.includes(program) ? program : null;
  };

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Failed to fetch users");
        }
        const data = await res.json();
        const normalized = data.map((u) => ({
          ...u,
          program: sanitizeProgram(u.role, u.program),
        }));
        setAllUsers(normalized);
      } catch (error) {
        console.error("Fetch users error:", error);
        showToast(error.message || "Failed to load user data.", "error");
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete user
  const handleDeleteUser = async (userToDelete) => {
    if (currentUser && userToDelete.id === currentUser.id) {
      showToast("You cannot delete your own account.", "error");
      setDeleteConfirm(null);
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API}/api/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete user");
      }
      setAllUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      showToast(
        `${userToDelete.name} has been removed from the system.`,
        "success"
      );
    } catch (error) {
      showToast(error.message || "An error occurred.", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Edit user
  const handleEditUser = (user) => {
    if (currentUser && user.id === currentUser.id) {
      showToast("You cannot edit your own account.", "error");
      return;
    }
    setEditUser(user);
    setEditRole(user.role);
    setEditProgram(user.program || "");
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;

    let programToSend = editProgram;
    if (
      editRole !== "admin" &&
      (programToSend === "N/A" || programToSend === "")
    ) {
      programToSend = "IT";
    } else if (editRole === "admin") {
      programToSend = null;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API}/api/users/${editUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: editRole, program: programToSend }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update user");
      }

      const updatedUser = await response.json();
      const normalizedUpdated = {
        ...updatedUser,
        program: sanitizeProgram(updatedUser.role, updatedUser.program),
      };

      setAllUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? normalizedUpdated : u))
      );
      showToast(`${editUser.name}'s information has been updated.`, "success");
    } catch (error) {
      showToast(error.message || "An error occurred.", "error");
    } finally {
      handleCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setEditUser(null);
    setEditRole("");
    setEditProgram("");
  };

  // Filtering
  const getFilteredUsers = () => {
    let users = allUsers;
    if (selectedRole) users = users.filter((u) => u.role === selectedRole);
    if (selectedProgram)
      users = users.filter((u) => u.program === selectedProgram);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q)
      );
    }
    return users;
  };
  const filteredUsers = getFilteredUsers();

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRole, selectedProgram, searchQuery]);

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <div className="page-wrapper admin-user-control">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}
        <div className="main-layout">
          {!isMobile && <Sidebar activePage="User Management" />}
          <main className="dashboard-main scrollable-content">
            <div className="section">
              <h2>User Management</h2>
              <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
                Manage all users in the system. View and filter students,
                mentors, and administrators.
              </p>

              {/* Stats skeleton */}
              <div className="user-stats-section">
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
              </div>

              {/* List skeletons */}
              <div className="user-list-panel">
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
                    <span>Loading users…</span>
                  </div>

                  <div className="user-list">
                    {Array.from({ length: 6 }).map((_, i) => (
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
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper admin-user-control">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="User Management" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>User Management</h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Manage all users in the system. View and filter students, mentors,
              and administrators.
            </p>

            {/* User Statistics */}
            <div className="user-stats-section">
              <div className="stats-grid">
                <div className="stat-card total">
                  <div className="stat-icon">
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
                    <div className="stat-number">{allUsers.length}</div>
                    <div className="stat-label">Total Users</div>
                  </div>
                </div>

                <div className="stat-card students">
                  <div className="stat-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 10v6M2 10l10-5 10 5L12 15z" />
                      <path d="M6 12v5c3 3 9 3 12 0v-5" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">
                      {allUsers.filter((u) => u.role === "student").length}
                    </div>
                    <div className="stat-label">Students</div>
                  </div>
                </div>

                <div className="stat-card mentors">
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
                      aria-hidden="true"
                    >
                      <path d="M9 18h6" />
                      <path d="M10 22h4" />
                      <path d="M12 2a7 7 0 0 0-7 7c0 2.1 1 3.9 2.5 5.2A7 7 0 0 1 9 18h6a7 7 0 0 1 1.5-3.8A7 7 0 0 0 19 9a7 7 0 0 0-7-7Z" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">
                      {allUsers.filter((u) => u.role === "mentor").length}
                    </div>
                    <div className="stat-label">Mentors</div>
                  </div>
                </div>

                <div className="stat-card admins">
                  <div className="stat-icon">
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">
                      {allUsers.filter((u) => u.role === "admin").length}
                    </div>
                    <div className="stat-label">Admins</div>
                  </div>
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
                    placeholder="Search users by name or email"
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
                  {(selectedRole || selectedProgram) && (
                    <span className="filter-badge">
                      {[selectedRole, selectedProgram].filter(Boolean).length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Filter Panel */}
            {showFilters && (
              <div className="filter-panel-collapsible">
                <div className="filter-panel-header">
                  <h3>Filter Users</h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedRole("");
                      setSelectedProgram("");
                    }}
                  >
                    Clear All
                  </button>
                </div>

                <div className={`filter-grid ${isMobile ? "mobile" : ""}`}>
                  <div className="filter-field">
                    <label className="filter-label">Role</label>
                    <select
                      value={selectedRole}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        setSelectedRole(newRole);
                        if (newRole === "admin") setSelectedProgram("");
                      }}
                      className="filter-select"
                    >
                      <option value="">All Roles</option>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
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
                      disabled={selectedRole === "admin"}
                    >
                      <option value="">All Programs</option>
                      {PROGRAMS.map((p) => (
                        <option
                          key={p}
                          value={p}
                          disabled={selectedRole === "student" && p === "GE"}
                        >
                          {PROGRAM_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* User List */}
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
                    Showing {startIndex + 1}-
                    {Math.min(endIndex, filteredUsers.length)} of{" "}
                    {filteredUsers.length} users
                    {filteredUsers.length !== allUsers.length &&
                      ` (filtered from ${allUsers.length} total)`}
                  </span>
                  {totalPages > 1 && (
                    <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                      Page {currentPage} of {totalPages}
                    </span>
                  )}
                </div>

                <div className="user-list">
                  {filteredUsers.length === 0 ? (
                    <div
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      No users found with the current filters.
                    </div>
                  ) : (
                    paginatedUsers.map((user, index) => {
                      const accent = user.program
                        ? getUserAccent(user.program)
                        : user.role === "mentor"
                        ? "#10b981"
                        : user.role === "admin"
                        ? "#ef4444"
                        : "#6b7280";

                      const getRoleBadgeColor = (role) => {
                        switch (role) {
                          case "student":
                            return {
                              bg: "#fef3c7",
                              text: "#92400e",
                              border: "#fbbf24",
                            };
                          case "mentor":
                            return {
                              bg: "#ecfdf5",
                              text: "#047857",
                              border: "#10b981",
                            };
                          case "admin":
                            return {
                              bg: "#fef2f2",
                              text: "#dc2626",
                              border: "#ef4444",
                            };
                          default:
                            return {
                              bg: "#f8fafc",
                              text: "#64748b",
                              border: "#e2e8f0",
                            };
                        }
                      };

                      const roleBadge = getRoleBadgeColor(user.role);
                      const isSelf = currentUser && currentUser.id === user.id;

                      return (
                        <div
                          key={user.email || index}
                          className="user-card"
                          style={{
                            "--accent": accent,
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
                                }}
                              >
                                {user.name}
                              </div>
                              <div
                                style={{
                                  background: roleBadge.bg,
                                  color: roleBadge.text,
                                  border: `1px solid ${roleBadge.border}`,
                                  padding: "0.125rem 0.5rem",
                                  borderRadius: "12px",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  textTransform: "capitalize",
                                }}
                              >
                                {user.role}
                              </div>
                            </div>

                            <div
                              className="user-email"
                              style={{
                                color: "#64748b",
                                fontSize: "0.875rem",
                                marginBottom: "0.5rem",
                              }}
                            >
                              {user.email}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                fontSize: "0.875rem",
                                flexWrap: "wrap",
                              }}
                            >
                              {user.role !== "admin" &&
                                user.program &&
                                PROGRAM_LABELS[user.program] && (
                                  <div>
                                    <span
                                      style={{
                                        color: "#64748b",
                                        fontWeight: "500",
                                      }}
                                    >
                                      Program:{" "}
                                    </span>
                                    <span style={{ color: "#0f172a" }}>
                                      {PROGRAM_LABELS[user.program]}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>

                          <div
                            style={{
                              marginLeft: "1rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "1rem",
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditUser(user);
                              }}
                              disabled={isSelf}
                              style={{
                                background: isSelf ? "#d1d5db" : "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.5rem 0.75rem",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                cursor: isSelf ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.375rem",
                                transition: "background-color 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelf)
                                  e.currentTarget.style.background = "#2563eb";
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelf)
                                  e.currentTarget.style.background = "#3b82f6";
                              }}
                              title={
                                isSelf
                                  ? "You cannot edit your own account"
                                  : "Edit user information"
                              }
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
                                setDeleteConfirm(user);
                              }}
                              disabled={isSelf}
                              style={{
                                background: isSelf ? "#d1d5db" : "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.5rem 0.75rem",
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                cursor: isSelf ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.375rem",
                                transition: "background-color 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelf)
                                  e.currentTarget.style.background = "#dc2626";
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelf)
                                  e.currentTarget.style.background = "#ef4444";
                              }}
                              title={
                                isSelf
                                  ? "You cannot delete your own account"
                                  : "Delete user"
                              }
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
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "2rem",
                  paddingBottom: "2rem",
                }}
              >
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background: currentPage === 1 ? "#f9fafb" : "white",
                    color: currentPage === 1 ? "#9ca3af" : "#374151",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (currentPage !== 1) {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#9ca3af";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      currentPage === 1 ? "#f9fafb" : "white";
                    e.currentTarget.style.borderColor = "#d1d5db";
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Previous
                </button>

                <div style={{ display: "flex", gap: "0.25rem" }}>
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
                          <span
                            key={pageNumber}
                            style={{ padding: "0.5rem", color: "#9ca3af" }}
                          >
                            ...
                          </span>
                        );
                      }
                      if (
                        pageNumber === totalPages - 1 &&
                        currentPage < totalPages - 3
                      ) {
                        return (
                          <span
                            key={pageNumber}
                            style={{ padding: "0.5rem", color: "#9ca3af" }}
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
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: isCurrentPage ? "#3b82f6" : "white",
                          color: isCurrentPage ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          minWidth: "40px",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrentPage) {
                            e.currentTarget.style.background = "#f3f4f6";
                            e.currentTarget.style.borderColor = "#9ca3af";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isCurrentPage
                            ? "#3b82f6"
                            : "white";
                          e.currentTarget.style.borderColor = "#d1d5db";
                        }}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background:
                      currentPage === totalPages ? "#f9fafb" : "white",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor:
                      currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (currentPage !== totalPages) {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#9ca3af";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      currentPage === totalPages ? "#f9fafb" : "white";
                    e.currentTarget.style.borderColor = "#d1d5db";
                  }}
                >
                  Next
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm &&
              createPortal(
                <div
                  className="modal-overlay"
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                  }}
                >
                  <div
                    className="modal-content"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "white",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      maxWidth: "400px",
                      width: "90%",
                      boxShadow:
                        "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                    }}
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
                          Delete User
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
                        Are you sure you want to delete{" "}
                        <strong style={{ color: "#111827" }}>
                          {deleteConfirm.name}
                        </strong>{" "}
                        ({deleteConfirm.email})? This will permanently remove
                        their account and all associated data.
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
                        style={{
                          background: "white",
                          color: "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "0.5rem 1rem",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f9fafb";
                          e.currentTarget.style.borderColor = "#9ca3af";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "white";
                          e.currentTarget.style.borderColor = "#d1d5db";
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteUser(deleteConfirm)}
                        style={{
                          background: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          padding: "0.5rem 1rem",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: "pointer",
                          transition: "background-color 0.2s ease",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#dc2626")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#ef4444")
                        }
                      >
                        Delete User
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

            {/* Edit User Modal */}
            {editUser && createPortal(
              <div
                className="modal-overlay"
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 5100,
                }}
                onClick={() => setEditUser(null)}
              >
                <div
                  className="modal-content"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "white",
                    borderRadius: "12px",
                    padding: "1.5rem",
                    maxWidth: "500px",
                    width: "90%",
                    boxShadow:
                      "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "#eff6ff",
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
                        stroke="#3b82f6"
                        strokeWidth="2"
                      >
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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
                        Edit User
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.875rem",
                          color: "#6b7280",
                        }}
                      >
                        {editUser.name} ({editUser.email})
                      </p>
                    </div>
                  </div>

                  <div style={{ marginBottom: "1.5rem" }}>
                    <div style={{ marginBottom: "1rem" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          color: "#374151",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Role
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) => {
                          const newRole = e.target.value;
                          setEditRole(newRole);
                          if (newRole === "admin") {
                            setEditProgram("");
                          } else if (
                            editProgram === "" ||
                            (newRole === "student" && editProgram === "GE")
                          ) {
                            setEditProgram("IT");
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          background: "white",
                          cursor: "pointer",
                        }}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginBottom: "1rem" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          color: "#374151",
                          marginBottom: "0.5rem",
                        }}
                      >
                        Program
                      </label>
                      <select
                        value={editProgram}
                        onChange={(e) => setEditProgram(e.target.value)}
                        disabled={editRole === "admin"}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          background:
                            editRole === "admin" ? "#f9fafb" : "white",
                          cursor:
                            editRole === "admin" ? "not-allowed" : "pointer",
                          color: editRole === "admin" ? "#9ca3af" : "#000",
                        }}
                      >
                        {editRole === "admin" && (
                          <option value="" disabled>
                            Admins don't have programs
                          </option>
                        )}
                        {PROGRAMS.map((p) => (
                          <option
                            key={p}
                            value={p}
                            disabled={editRole === "student" && p === "GE"}
                          >
                            {PROGRAM_LABELS[p]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        background: "white",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        padding: "0.5rem 1rem",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f9fafb";
                        e.currentTarget.style.borderColor = "#9ca3af";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.borderColor = "#d1d5db";
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      style={{
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.5rem 1rem",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#2563eb")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "#3b82f6")
                      }
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {toast.show &&
              createPortal(
                <div
                  className={`toast ${toast.type}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic
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
