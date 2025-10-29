import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import "./ViewStudentsModal.css";

export default function ViewStudentsModal({
  isOpen,
  onClose,
  subject,
  section,
  studentCount,
  courseId: courseIdProp,
  onRosterChanged,
}) {
  const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

  const [courseId, setCourseId] = useState(courseIdProp || "");
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStudentQuery, setAddStudentQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // suggestion source (legacy prefetch; may stay empty for mentors)
  const [allUsers, setAllUsers] = useState([]);

  // delete
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // filter
  const [searchQuery, setSearchQuery] = useState("");

  // UX
  const [recentlyAddedStudents, setRecentlyAddedStudents] = useState(new Set());
  const [toastMsg, setToastMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState("");
  const toastTimer = useRef(null);
  const studentListRef = useRef(null);

  // helpers
  const authHeaders = useMemo(() => {
    const token = localStorage.getItem("token");
    const h = token ? { Authorization: `Bearer ${token}` } : {};
    return { ...h, "Content-Type": "application/json" };
  }, []);

  const parseSubject = (s) => {
    if (!s) return { code: "", name: "" };
    const i = s.indexOf(" ");
    if (i === -1) return { code: s.trim(), name: "" };
    return { code: s.slice(0, i).trim(), name: s.slice(i + 1).trim() };
  };

  const tryJson = async (res) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastMsg("");
      toastTimer.current = null;
    }, 3000);
  };

  // ---------- API adapters ----------
  const resolveCourse = useCallback(async () => {
    if (courseIdProp) return courseIdProp;
    const { code, name } = parseSubject(subject);
    try {
      // Prefer mentor-safe endpoint
      let res = await fetch(`${API}/api/courses/mine`, {
        headers: authHeaders,
      });
      let data = [];
      if (res.ok) {
        data = await res.json();
      } else {
        // Fallback to all courses (may be admin-only)
        res = await fetch(`${API}/api/courses`, { headers: authHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];
      const match = list.find((c) => {
        const cc = String(c.courseCode || "")
          .trim()
          .toLowerCase();
        const cn = String(c.courseName || "")
          .trim()
          .toLowerCase();
        const sec = String(c.section || "")
          .trim()
          .toLowerCase();
        return (
          cc === String(code).toLowerCase() &&
          cn === String(name).toLowerCase() &&
          sec === String(section || "").toLowerCase()
        );
      });
      return match?._id || match?.id || "";
    } catch (e) {
      console.warn("resolveCourse failed:", e);
      return "";
    }
  }, [API, authHeaders, courseIdProp, subject, section]);

  const fetchRoster = useCallback(
    async (cid) => {
      // 1) GET /courses/:id/students
      try {
        const res = await fetch(`${API}/api/courses/${cid}/students`, {
          headers: authHeaders,
        });
        if (res.ok) {
          const data = await res.json();
          return (Array.isArray(data) ? data : []).map((u) => ({
            _id: u._id || u.id,
            name:
              u.name ||
              `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
              u.email ||
              "Student",
            email: u.email || u.username || "",
          }));
        }
      } catch {}

      // 2) fallback GET /courses/:id
      try {
        const res2 = await fetch(`${API}/api/courses/${cid}`, {
          headers: authHeaders,
        });
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const c = await res2.json();
        const arr = c.students || c.enrolledStudents || c.enrolled || [];
        return (Array.isArray(arr) ? arr : []).map((u) => ({
          _id: u?._id || u?.id,
          name:
            u?.name ||
            `${u?.firstName || ""} ${u?.lastName || ""}`.trim() ||
            u?.email ||
            "Student",
          email: u?.email || u?.username || "",
        }));
      } catch (e) {
        console.warn("fetchRoster fallback failed:", e);
        return null;
      }
    },
    [API, authHeaders]
  );

  const fetchAllUsersForSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/users`, { headers: authHeaders });
      if (!res.ok) return [];
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];

      const isStudent = (u) => {
        const candidates = [u.role, u.roleName, u.type, u.roles].filter(
          Boolean
        );
        for (const r of candidates) {
          if (Array.isArray(r)) {
            if (r.some((x) => String(x).toLowerCase().includes("student")))
              return true;
          } else if (String(r).toLowerCase().includes("student")) return true;
        }
        return !!u.isStudent;
      };

      return arr
        .filter(isStudent)
        .map((u) => ({
          _id: u._id || u.id,
          name:
            u.name ||
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            u.email,
          email: u.email,
        }))
        .filter((u) => u.email);
    } catch (e) {
      console.warn("fetchAllUsersForSuggestions failed; hiding suggestions.");
      return [];
    }
  }, [API, authHeaders]);

  // Server-side student search accessible to mentors/admins
  const serverSearchStudents = useCallback(
    async (q) => {
      try {
        const url = `${API}/api/users/students/search?q=${encodeURIComponent(
          q || ""
        )}`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) return [];
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        return arr
          .map((u) => ({
            _id: u._id || u.id,
            name: u.name || u.email,
            email: u.email,
          }))
          .filter((u) => u.email);
      } catch (_) {
        return [];
      }
    },
    [API, authHeaders]
  );

  const addStudentsToCourse = useCallback(
    async (cid, selected) => {
      const ids = selected.map((u) => u._id).filter(Boolean);
      const emails = selected.map((u) => u.email).filter(Boolean);

      // POST /courses/:id/enroll
      try {
        const res = await fetch(`${API}/api/courses/${cid}/enroll`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(ids.length ? { studentIds: ids } : { emails }),
        });
        if (!res.ok) {
          const body = await tryJson(res);
          showToast(
            body.message || `Failed to add students (HTTP ${res.status})`
          );
          return false;
        }
        return true;
      } catch (e) {}

      // POST /courses/:id/students
      try {
        const res = await fetch(`${API}/api/courses/${cid}/students`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            students: selected.map((u) => ({
              user: u._id,
              email: u.email,
              name: u.name,
            })),
          }),
        });
        if (!res.ok) {
          const body = await tryJson(res);
          showToast(
            body.message || `Failed to add students (HTTP ${res.status})`
          );
          return false;
        }
        return true;
      } catch (e) {}

      // PUT merge fallback
      try {
        const current = await fetchRoster(cid);
        const byEmail = new Map();
        [...(current || []), ...selected].forEach((u) => {
          if (!u?.email) return;
          byEmail.set(u.email.toLowerCase(), u);
        });
        const merged = Array.from(byEmail.values());
        const res = await fetch(`${API}/api/courses/${cid}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ students: merged }),
        });
        if (!res.ok) {
          const body = await tryJson(res);
          showToast(
            body.message || `Failed to add students (HTTP ${res.status})`
          );
          return false;
        }
        return true;
      } catch (e) {}

      showToast("Failed to add students.");
      return false;
    },
    [API, authHeaders, fetchRoster]
  );

  const removeStudentFromCourse = useCallback(
    async (cid, student) => {
      const sid = student?._id;
      const email = student?.email;

      // DELETE by id
      if (sid) {
        try {
          const res = await fetch(`${API}/api/courses/${cid}/students/${sid}`, {
            method: "DELETE",
            headers: authHeaders,
          });
          if (res.ok) return true;
          const body = await tryJson(res);
          showToast(
            body.message || `Failed to remove student (HTTP ${res.status})`
          );
        } catch (e) {}
      }

      // DELETE by email
      if (email) {
        try {
          const res = await fetch(
            `${API}/api/courses/${cid}/students?email=${encodeURIComponent(
              email
            )}`,
            { method: "DELETE", headers: authHeaders }
          );
          if (res.ok) return true;
          const body = await tryJson(res);
          showToast(
            body.message || `Failed to remove student (HTTP ${res.status})`
          );
        } catch (e) {}
      }

      // PUT minus-one fallback
      try {
        const current = await fetchRoster(cid);
        const left = (current || []).filter(
          (u) => u.email?.toLowerCase() !== email?.toLowerCase()
        );
        const res = await fetch(`${API}/api/courses/${cid}`, {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ students: left }),
        });
        if (res.ok) return true;
        const body = await tryJson(res);
        showToast(
          body.message || `Failed to remove student (HTTP ${res.status})`
        );
      } catch (e) {}

      return false;
    },
    [API, authHeaders, fetchRoster]
  );

  // ---------- load course + roster ----------
  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      if (!isOpen) return;
      setIsLoading(true);
      setLoadError("");

      try {
        let cid = courseIdProp || courseId;
        if (!cid) cid = await resolveCourse();
        if (!mounted) return;

        if (!cid) {
          // No course resolved; show empty state without sample data
          setCourseId("");
          setStudents([]);
          setLoadError("");
          setIsLoading(false);
          return;
        }

        setCourseId(cid);

        const roster = await fetchRoster(cid);
        if (!mounted) return;

        if (roster) {
          setStudents(roster);
        } else {
          setStudents([]);
          setLoadError("Could not load roster.");
        }
      } catch (e) {
        setLoadError("Failed to load students.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    boot();
    return () => {
      mounted = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, subject, section]);

  // suggestions (best-effort prefetch; mentors may not have admin access)
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      const list = await fetchAllUsersForSuggestions();
      if (!mounted) return;
      setAllUsers(list || []);
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen, fetchAllUsersForSuggestions]);

  // ---------- add UX ----------
  const handleSearchInput = async (q) => {
    setAddStudentQuery(q);
    if (!q.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      // Prefer server-side search (works for mentors); fallback to local list
      let list = await serverSearchStudents(q);
      if (!list.length && allUsers.length) {
        list = allUsers.filter((user) => {
          const matchesQuery =
            (user.name || "").toLowerCase().includes(q.toLowerCase()) ||
            (user.email || "").toLowerCase().includes(q.toLowerCase());
          return matchesQuery;
        });
      }

      const filtered = list.filter((user) => {
        const alreadyAdded = students.some(
          (s) => s.email.toLowerCase() === (user.email || "").toLowerCase()
        );
        const alreadySelected = selectedUsers.some(
          (u) => u.email === user.email
        );
        return !alreadyAdded && !alreadySelected;
      });

      setSuggestions(filtered.slice(0, 8));
      setShowSuggestions(filtered.length > 0);
    } catch (e) {
      console.warn("Search filtering failed:", e);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (user) => {
    if (selectedUsers.find((u) => u.email === user.email)) return;
    setSelectedUsers((prev) => [...prev, user]);
    setAddStudentQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleRemoveSelectedUser = (email) =>
    setSelectedUsers((prev) => prev.filter((u) => u.email !== email));

  const handleConfirmAddStudents = async () => {
    if (selectedUsers.length === 0) return;

    if (!courseId) {
      // local-only fallback
      const newStudents = selectedUsers.map((u) => ({
        name: u.name,
        email: u.email,
      }));
      setStudents((prev) => [...prev, ...newStudents]);
      const emails = newStudents.map((s) => s.email);
      setRecentlyAddedStudents(new Set(emails));
      setTimeout(() => setRecentlyAddedStudents(new Set()), 5000);
      showToast(`${newStudents.length} student(s) added (local).`);
      setSelectedUsers([]);
      setAddStudentQuery("");
      setShowAddForm(false);
      try {
        onRosterChanged?.();
      } catch {}
      return;
    }

    setSaving(true);
    const ok = await addStudentsToCourse(courseId, selectedUsers);
    setSaving(false);

    if (!ok) return;

    const roster = await fetchRoster(courseId);
    setStudents(roster || []);
    const emails = selectedUsers.map((u) => u.email);
    setRecentlyAddedStudents(new Set(emails));
    setTimeout(() => setRecentlyAddedStudents(new Set()), 5000);
    showToast(
      `${selectedUsers.length} student${
        selectedUsers.length > 1 ? "s" : ""
      } added successfully!`
    );

    setSelectedUsers([]);
    setAddStudentQuery("");
    setShowAddForm(false);
    try {
      onRosterChanged?.();
    } catch {}
  };

  // ---------- remove ----------
  const handleDeleteStudent = async (email) => {
    const removed = students.find((s) => s.email === email);

    if (!courseId) {
      // local-only fallback
      setStudents((prev) => prev.filter((s) => s.email !== email));
      setDeleteConfirm(null);
      setRecentlyAddedStudents((prev) => {
        const copy = new Set(prev);
        copy.delete(email);
        return copy;
      });
      showToast(`${removed?.name || "Student"} removed (local).`);
      return;
    }

    setRemovingEmail(email);
    const ok = await removeStudentFromCourse(courseId, removed || { email });
    setRemovingEmail("");

    if (!ok) return;

    const roster = await fetchRoster(courseId);
    setStudents(roster || []);
    setDeleteConfirm(null);
    setRecentlyAddedStudents((prev) => {
      const copy = new Set(prev);
      copy.delete(email);
      return copy;
    });
    showToast(`${removed?.name || "Student"} removed successfully!`);
    try {
      onRosterChanged?.();
    } catch {}
  };

  // ---------- derived ----------
  const filteredStudents = students
    .filter((student) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (student.name || "").toLowerCase().includes(q) ||
        (student.email || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  if (!isOpen) return null;

  return (
    <>
      {toastMsg && (
        <div
          className="toast vsm success"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: "5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10060,
            pointerEvents: "none",
          }}
        >
          {toastMsg}
        </div>
      )}

      <div
        className="modal-overlay view-students-overlay"
        role="dialog"
        aria-modal="true"
        onClick={() => {
          if (!deleteConfirm) onClose();
        }}
      >
        <div
          className="modal-content view-students-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="view-students-header">
            <h2>
              Students in {subject} - {section}
            </h2>

            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="btn-primary"
                title="Add Student"
                disabled={isLoading}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </button>
            )}
          </div>

          {/* Load state / error */}
          {isLoading && (
            <div className="empty-state" style={{ opacity: 0.8 }}>
              Loading students…
            </div>
          )}
          {!isLoading && loadError && (
            <div className="empty-state" style={{ color: "#ef4444" }}>
              {loadError}
            </div>
          )}

          {/* Add Student Form */}
          {!isLoading && showAddForm && (
            <div className="form-group" style={{ position: "relative" }}>
              <label className="label">Add Student</label>

              {selectedUsers.length > 0 && (
                <div className="selected-chips" aria-live="polite">
                  {selectedUsers.map((user) => (
                    <div key={user.email} className="chip">
                      <span>{user.name}</span>
                      <button
                        onClick={() => handleRemoveSelectedUser(user.email)}
                        aria-label={`Remove ${user.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Type student name or email..."
                  value={addStudentQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  className="form-input"
                  autoFocus
                  disabled={saving}
                />

                {showSuggestions && (
                  <div className="suggestions" role="listbox">
                    {suggestions.length > 0 ? (
                      suggestions.map((user) => (
                        <div
                          key={user.email}
                          tabIndex={0}
                          role="option"
                          className="suggestion-item"
                          onClick={() => handleSelectSuggestion(user)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSelectSuggestion(user);
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>{user.name}</div>
                          <div
                            style={{
                              fontSize: "0.78rem",
                              color: "#6b7280",
                              marginTop: 4,
                            }}
                          >
                            {user.email}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        className="suggestion-item"
                        style={{ cursor: "default" }}
                      >
                        No students found. Make sure they are registered in the
                        system.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: "0.8rem",
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => {
                    setAddStudentQuery("");
                    setSelectedUsers([]);
                    setSuggestions([]);
                    setShowSuggestions(false);
                    setShowAddForm(false);
                  }}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAddStudents}
                  className="btn-primary"
                  disabled={selectedUsers.length === 0 || saving}
                  title={
                    !courseId
                      ? "Will add locally (no server courseId)"
                      : undefined
                  }
                >
                  {saving
                    ? "Adding…"
                    : selectedUsers.length > 0
                    ? `Add ${selectedUsers.length} Student${
                        selectedUsers.length > 1 ? "s" : ""
                      }`
                    : "Add Students"}
                </button>
              </div>
            </div>
          )}

          {/* Search Bar */}
          {!isLoading && (
            <div className="form-group">
              <div className="search-input-container">
                <svg
                  className="search-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search students by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input search-input"
                />
              </div>
            </div>
          )}

          {/* Students List */}
          {!isLoading && (
            <div ref={studentListRef} className="students-list">
              {students.length === 0 ? (
                <div className="empty-state">
                  No students enrolled in this section yet.
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="empty-state">
                  No students found matching "{searchQuery}".
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const isRecent = recentlyAddedStudents.has(student.email);
                  const isRemoving = removingEmail === student.email;
                  return (
                    <div
                      key={student.email}
                      className={`student-row ${isRecent ? "recent" : ""}`}
                    >
                      <div className="student-info">
                        <div className="student-name">{student.name}</div>
                        <div className="student-email">{student.email}</div>
                      </div>
                      <div>
                        <button
                          onClick={() => setDeleteConfirm(student.email)}
                          className="remove-btn"
                          aria-label={`Remove ${student.name}`}
                          disabled={isRemoving}
                          title={
                            !courseId
                              ? "Will remove locally (no server courseId)"
                              : undefined
                          }
                        >
                          {isRemoving ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Footer */}
          {!isLoading && (
            <div className="modal-footer">
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>
                Total: {students.length} student
                {students.length !== 1 ? "s" : ""}
              </p>
              <div>
                <button
                  onClick={() => {
                    setSelectedUsers([]);
                    setAddStudentQuery("");
                    setSuggestions([]);
                    setShowSuggestions(false);
                    setShowAddForm(false);
                    setSearchQuery("");
                    onClose();
                  }}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <div
            className="modal-overlay view-students-overlay"
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              className="modal-content view-students-modal confirm-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 0.75rem 0" }}>Remove Student</h3>
              <p style={{ margin: "0 0 1rem 0", color: "#6b7280" }}>
                Are you sure you want to remove this student from the class?
                This action cannot be undone.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const email = deleteConfirm;
                    await handleDeleteStudent(email);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#dc2626",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
