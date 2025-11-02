import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import axios from "axios";

import Header from "../../components/Header";
import MobileNav from "../../components/MobileNav";
import Sidebar from "../../components/Sidebar";
import { useSystemSettings } from "../../context/SystemSettingsContext";

import "./AdminSystemSettings.css";
import "./AdminToast.css";

/* ===================== API base (align with SystemSettingsContext) ===================== */
const API_BASE =
  (typeof window !== "undefined" && window.__API_BASE__) ||
  (typeof import.meta !== "undefined" ? import.meta?.env?.VITE_API_BASE_URL : undefined) ||
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  // Fallback if your server listens on 5000 behind a proxy
  "http://localhost:5000";

const API = String(API_BASE).replace(/\/+$/, "");
const http = axios.create({ baseURL: API, withCredentials: true });

http.interceptors.request.use((config) => {
  try {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

/* ===================== helpers ===================== */
const getId = (term) => term?._id || term?.termId; // support either shape

const toInputDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromInputDate = (val) => {
  // keep as YYYY-MM-DD; backend can parse or store as ISO
  return val || "";
};

const formatDateLong = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export default function AdminSystemSettings() {
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

  // State
  const [terms, setTerms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const { refreshActiveTerm } = useSystemSettings();

  // Form state
  const [formData, setFormData] = useState({
    schoolYear: "",
    term: "1",
    startDate: "",
    endDate: "",
    isActive: false,
  });

  // Year options
  const getAcademicYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const options = [];
    for (let i = -2; i <= 3; i++) {
      const startYear = currentYear + i;
      const endYear = startYear + 1;
      const yearString = `${startYear}-${endYear}`;
      options.push({ label: yearString, value: yearString });
    }
    return options;
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 3000);
  };

  // Fetch terms
  const fetchTerms = async () => {
    setIsLoading(true);
    try {
      const { data } = await http.get("/api/academic-terms");
      // ensure consistent ordering (newest first by schoolYear then term)
      const sorted = [...data].sort((a, b) => {
        const ayA = String(a.schoolYear || "");
        const ayB = String(b.schoolYear || "");
        if (ayA === ayB) return Number(b.term) - Number(a.term);
        return ayB.localeCompare(ayA);
      });
      setTerms(sorted);
    } catch (e) {
      console.error("Fetch terms error:", e);
      showToast("Failed to load academic terms.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  // Active term & stats
  const activeTerm = terms.find((t) => t.isActive);
  const stats = { total: terms.length };

  // Filter
  const filteredTerms = terms.filter((term) =>
    `${term.schoolYear} Term ${term.term}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Modal controls
  const openAddModal = () => {
    setEditingTerm(null);
    setFormData({
      schoolYear: "",
      term: "1",
      startDate: "",
      endDate: "",
      isActive: false,
    });
    setShowModal(true);
  };

  const openEditModal = (term) => {
    setEditingTerm(term);
    setFormData({
      schoolYear: term.schoolYear || "",
      term: String(term.term ?? "1"),
      startDate: toInputDate(term.startDate),
      endDate: toInputDate(term.endDate),
      isActive: !!term.isActive,
    });
    setShowModal(true);
  };

  // Save (create/update)
  const handleSave = async () => {
    const { schoolYear, startDate, endDate } = formData;
    if (!schoolYear || !startDate || !endDate)
      return showToast("Please fill out all fields.", "error");

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) return showToast("End Date must be after Start Date.", "error");

    const [startYear, endYear] = schoolYear.split("-").map(Number);
    const startDateYear = start.getFullYear();
    const endDateYear = end.getFullYear();
    if (startDateYear < startYear || endDateYear > endYear) {
      return showToast(
        `Dates must be within the selected school year (${schoolYear}).`,
        "error"
      );
    }

    try {
      const payload = {
        schoolYear,
        term: Number(formData.term),
        startDate: fromInputDate(formData.startDate),
        endDate: fromInputDate(formData.endDate),
        isActive: !!formData.isActive,
      };

      if (editingTerm) {
        const id = getId(editingTerm);
        if (!id) throw new Error("Invalid term id");
        await http.put(`/api/academic-terms/${id}`, payload);
        showToast("Term updated successfully", "success");
      } else {
        await http.post(`/api/academic-terms`, payload);
        showToast("Term added successfully", "success");
      }

      if (payload.isActive) refreshActiveTerm();
      await fetchTerms();
      setShowModal(false);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Failed to save term";
      showToast(msg, "error");
    }
  };

  const handleDelete = async (term) => {
    try {
      const id = getId(term);
      if (!id) throw new Error("Invalid term id");
      await http.delete(`/api/academic-terms/${id}`);
      showToast("Term deleted successfully", "success");
      await fetchTerms();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Failed to delete term";
      showToast(msg, "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openDeleteConfirm = (term) => {
    if (term.isActive) {
      showToast("Cannot delete an active term. Set another term as active first.", "error");
      return;
    }
    setDeleteConfirm(term);
  };

  const handleSetActive = async (term) => {
    try {
      const id = getId(term);
      if (!id) throw new Error("Invalid term id");
      const { data } = await http.patch(`/api/academic-terms/${id}/set-active`);
      showToast(`Set ${data.schoolYear} Term ${data.term} as active.`, "success");
      await fetchTerms();
      refreshActiveTerm();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Failed to set active term";
      showToast(msg, "error");
    }
  };

  /* ----------------- Loading skeleton (animated) ----------------- */
  if (isLoading) {
    return (
      <div className="page-wrapper admin-academic-terms">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}

        <div className="main-layout">
          {!isMobile && <Sidebar activePage="System Settings" />}

          <main className="dashboard-main scrollable-content">
            <div className="section">
              <h2>System Settings</h2>
              <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
                Manage academic terms, set active periods, and track school years.
              </p>

              <div className="stats-section">
                <div className="stats-grid">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={`stat-skel-${i}`} className="stat-card skeleton">
                      <div className="skeleton-icon" />
                      <div className="stat-content" style={{ width: "100%" }}>
                        <div className="skeleton-line h-xl w-40 mb-2" />
                        <div className="skeleton-line h-sm w-25" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="search-filter-bar">
                <div className="search-container">
                  <div className="search-input-wrapper">
                    <div className="skeleton-line h-lg w-70" />
                  </div>
                </div>
                <div className="skeleton-button" style={{ width: 120 }} />
              </div>

              <div style={{ marginBottom: ".75rem" }}>
                <span className="skeleton-line h-sm w-30" />
              </div>

              <div className="terms-list-panel">
                <div className="terms-list">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={`term-skel-${i}`} className="term-card skeleton">
                      <div className="term-info" style={{ flex: 1 }}>
                        <div
                          className="term-header"
                          style={{ alignItems: "center", gap: ".75rem" }}
                        >
                          <div className="skeleton-line h-lg w-40" />
                        </div>
                        <div className="skeleton-line h-sm w-50 mb-1" />
                      </div>
                      <div className="term-actions" style={{ display: "flex", gap: ".5rem" }}>
                        <div className="skeleton-button" style={{ width: 110 }} />
                        <div className="skeleton-button" style={{ width: 36 }} />
                        <div className="skeleton-button" style={{ width: 36 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /* ----------------- Page (animated) ----------------- */
  return (
    <div className="page-wrapper admin-academic-terms">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="System Settings" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>System Settings</h2>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              Manage academic terms, set active periods, and track school years.
            </p>

            {/* Stats */}
            <div className="stats-section">
              <div className="stats-grid">
                <div className="stat-card active">
                  <div className="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number" style={{ fontSize: activeTerm ? "1.5rem" : "2rem" }}>
                      {activeTerm ? `${activeTerm.schoolYear} - Term ${activeTerm.term}` : "None"}
                    </div>
                    <div className="stat-label">Active Term</div>
                  </div>
                </div>

                <div className="stat-card total">
                  <div className="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </div>
                  <div className="stat-content">
                    <div className="stat-number">{stats.total}</div>
                    <div className="stat-label">Total Terms</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Search + Add */}
            <div className="search-filter-bar">
              <div className="search-container">
                <div className="search-input-wrapper">
                  <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search terms by year or term number"
                    className="search-input"
                  />
                </div>
              </div>
              <button className="add-term-btn" onClick={openAddModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Term
              </button>
            </div>

            {/* Showing text */}
            <div style={{ marginBottom: ".75rem", fontSize: ".875rem", color: "#64748b" }}>
              Showing {filteredTerms.length} of {terms.length} terms
              {searchQuery && ` (filtered)`}
            </div>

            {/* Terms */}
            <div className="terms-list-panel">
              <div className="terms-list">
                {filteredTerms.length === 0 ? (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid var(--at-border)",
                      borderRadius: "var(--at-radius)",
                      padding: "2rem",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    No academic terms found.
                  </div>
                ) : (
                  filteredTerms.map((term) => {
                    const id = getId(term);
                    return (
                      <div key={id} className="term-card">
                        <div className="term-info">
                          <div className="term-header">
                            <div className="term-title">
                              {term.schoolYear} - Term {term.term}
                            </div>
                            {term.isActive && <div className="status-badge active">● Active</div>}
                          </div>
                          <div className="term-dates">
                            Start: {formatDateLong(term.startDate)} | End: {formatDateLong(term.endDate)}
                          </div>
                        </div>
                        <div className="term-actions">
                          {!term.isActive && (
                            <button className="btn-set-active" onClick={() => handleSetActive(term)}>
                              Set Active
                            </button>
                          )}
                          <button className="btn-icon btn-edit" onClick={() => openEditModal(term)} title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                          </button>
                          <button className="btn-icon btn-icon-delete" onClick={() => openDeleteConfirm(term)} title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Add/Edit Modal */}
          {showModal &&
            createPortal(
              <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowModal(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <h3 className="modal-title">{editingTerm ? "Edit Academic Term" : "Add Academic Term"}</h3>
                  </div>

                  <div className="form-group">
                    <label className="form-label">School Year</label>
                    <select
                      className="form-select"
                      value={formData.schoolYear}
                      onChange={(e) => setFormData({ ...formData, schoolYear: e.target.value })}
                      required
                    >
                      <option value="" disabled>
                        Select a school year
                      </option>
                      {getAcademicYearOptions().map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Term</label>
                    <select
                      className="form-select"
                      value={formData.term}
                      onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                    >
                      <option value="1">Term 1</option>
                      <option value="2">Term 2</option>
                      <option value="3">Term 3</option>
                    </select>
                  </div>

                  <div className="date-inputs">
                    <div className="form-group">
                      <label className="form-label">Start Date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      />
                    </div>
                  </div>

                  {!editingTerm && (
                    <label htmlFor="isActiveToggle" className="form-checkbox-inline">
                      <input
                        type="checkbox"
                        id="isActiveToggle"
                        className="form-toggle"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      />
                      <span>Set as active term upon creation</span>
                    </label>
                  )}

                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={() => setShowModal(false)}>
                      Cancel
                    </button>
                    <button className="btn-save" onClick={handleSave}>
                      {editingTerm ? "Update" : "Add"} Term
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {/* Delete Confirm */}
          {deleteConfirm &&
            createPortal(
              <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "#fee2e2",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "#111827" }}>
                        Delete Term
                      </h3>
                      <p style={{ margin: 0, fontSize: ".875rem", color: "#6b7280" }}>This action cannot be undone</p>
                    </div>
                  </div>

                  <div style={{ margin: "1rem 0 1.5rem" }}>
                    <p style={{ margin: 0, color: "#374151", fontSize: ".875rem", lineHeight: 1.5 }}>
                      Are you sure you want to delete{" "}
                      <strong style={{ color: "#111827" }}>
                        {deleteConfirm.schoolYear} - Term {deleteConfirm.term}
                      </strong>
                      ? This will permanently remove the academic term.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: ".75rem", justifyContent: "flex-end" }}>
                    <button onClick={() => setDeleteConfirm(null)} className="btn-cancel">
                      Cancel
                    </button>
                    <button onClick={() => handleDelete(deleteConfirm)} className="btn-delete">
                      Delete Term
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {/* Toast */}
          {toast.show &&
            createPortal(
              <div
                className={`toast ${toast.type}`}
                role="status"
                aria-live="polite"
                aria-atomic
                style={{ zIndex: 10000, position: "fixed" }}
              >
                {toast.message}
              </div>,
              document.body
            )}
        </main>
      </div>
    </div>
  );
}