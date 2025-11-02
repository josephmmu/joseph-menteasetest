// src/pages/Notifications.jsx
import React, { useState, useEffect, useMemo } from "react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import MobileNav from "../components/MobileNav";
import "./Notifications.css";

/* =========================
   API helpers
   ========================= */
const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");

const tokenHeaders = () => {
  const t = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

const pickArray = (json) => {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.notifications)) return json.notifications;
  return [];
};

const toIdString = (v) =>
  (v && (v._id || v.id || v.notification_id || v.$id || v.$oid || v).toString()) || "";

/* =========================
   Chip colors
   ========================= */
const TYPE_META = {
  session: { label: "My Schedule", fg: "#0b3b8a", bg: "#e7f0ff" },
  feedback: { label: "My Feedback", fg: "#7a4a00", bg: "#fff4c4" },
  notes: { label: "Session Notes", fg: "#760f6cff", bg: "#ffe6fcff" },
};

/* =========================
   Time “x ago”
   ========================= */
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];
const timeAgo = (iso) => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") {
      return rtf.format(Math.round(-diff / ms), unit);
    }
  }
  return "";
};

/* =========================
   Normalizer
   ========================= */
function normalizeNotif(n) {
  const id = toIdString(n?._id || n?.id || n?.notification_id);
  const createdAt =
    n?.createdAt || n?.timestamp || n?.time || n?.created_at || new Date().toISOString();
  const read =
    Boolean(n?.read) ||
    Boolean(n?.isRead) ||
    String(n?.status || "").toLowerCase() === "read";

  const rawType = (n?.type || n?.category || "session").toString().toLowerCase();
  const type = ["session", "feedback", "notes"].includes(rawType) ? rawType : "session";

  const title = n?.title || n?.subject || "Update";
  const message = n?.content || n?.message || n?.body || n?.text || "";
  const link = n?.pageRelated || n?.link || n?.url || "/my-schedule";

  return { id, type, title, message, createdAt, read, link };
}

/* =========================
   API calls
   ========================= */
async function fetchMyNotifications() {
  const tries = [
    `${API}/api/notifications/mine`,
    `${API}/api/notifications?recipient=me`,
    `${API}/api/notifications`,
  ];
  for (const url of tries) {
    try {
      const res = await fetch(url, { headers: tokenHeaders(), credentials: "include" });
      if (!res.ok) continue;
      const data = await res.json();
      const arr = pickArray(data).map(normalizeNotif);
      if (arr.length || url.endsWith("/mine")) return arr;
    } catch {}
  }
  return [];
}

async function markNotificationRead(id) {
  if (!id) return false;
  const tries = [
    { url: `${API}/api/notifications/${id}`, method: "PATCH", body: { read: true } },
    { url: `${API}/api/notifications/mark-read`, method: "POST", body: { ids: [id] } },
    { url: `${API}/api/notifications/${id}/read`, method: "POST", body: {} },
  ];
  for (const t of tries) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: tokenHeaders(),
        credentials: "include",
        body: JSON.stringify(t.body || {}),
      });
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

async function markAllNotificationsRead() {
  const tries = [
    { url: `${API}/api/notifications/mark-all-read`, method: "POST" },
    { url: `${API}/api/notifications/read-all`, method: "POST" },
    { url: `${API}/api/notifications`, method: "PATCH", body: { read: true } },
  ];
  for (const t of tries) {
    try {
      const res = await fetch(t.url, {
        method: t.method,
        headers: tokenHeaders(),
        credentials: "include",
        body: t.body ? JSON.stringify(t.body) : undefined,
      });
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

/* =========================
   Skeleton components
   ========================= */
function NotifSkeletonCard() {
  return (
    <li className="notification-card skeleton-card" aria-hidden="true">
      <div className="notif-top-row">
        <div className="notif-top-left">
          <div className="skeleton skeleton-chip" />
        </div>
        <div className="skeleton skeleton-time" />
      </div>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-text short" />
    </li>
  );
}
function NotifSkeletonList({ count = 6 }) {
  return (
    <ul className="notification-list" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <NotifSkeletonCard key={`skel-${i}`} />
      ))}
    </ul>
  );
}

/* =========================
   Pagination helpers (MySchedule/MyFeedback-style)
   ========================= */
const getPaginationItems = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const base = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) base.push(i);
  }
  const items = [];
  let prev = 0;
  for (const p of base) {
    if (prev) {
      const gap = p - prev;
      if (gap === 2) items.push(prev + 1);
      else if (gap > 2) items.push("...");
    }
    items.push(p);
    prev = p;
  }
  return items;
};

/* =========================
   Component
   ========================= */
export default function Notifications() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const isMobile = windowWidth <= 1152;

  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 6;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const arr = await fetchMyNotifications();
      arr.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      setItems(arr);
      setLoading(false);
      setCurrentPage(1); // reset to first page on initial load
    })();
  }, []);

  const filtered = useMemo(() => {
    let base = items;
    if (filter === "unread") base = items.filter((n) => !n.read);
    else if (filter !== "all") base = items.filter((n) => n.type === filter);
    const sorted = [...base].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
    return sorted;
  }, [filter, items]);

  // reset page when filter changes or list length changes
  useEffect(() => setCurrentPage(1), [filter]);
  useEffect(() => setCurrentPage(1), [filtered.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const startIndex = (currentPage - 1) * perPage;
  const endIndex = Math.min(startIndex + perPage, filtered.length);
  const pagedList = filtered.slice(startIndex, endIndex);

  const setPage = (p) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

  const handleOpen = async (notif) => {
    if (!notif) return;
    setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    await markNotificationRead(notif.id);
    window.location.assign(notif.link || "/");
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  };

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Notifications" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <div className="notif-header-top">
              <h2>Notifications</h2>

              <div className="notif-controls">
                <label className="notif-filter-label" htmlFor="notif-filter">
                  Filter
                </label>
                <div className="select-wrap">
                  <select
                    id="notif-filter"
                    className="notif-filter"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="Filter notifications"
                  >
                    <option value="all">All</option>
                    <option value="unread">Unread only</option>
                    <option value="session">My Schedule</option>
                    <option value="feedback">My Feedback</option>
                    <option value="notes">Session Notes</option>
                  </select>
                </div>

                <button className="mark-all" onClick={markAllRead} title="Mark all as read">
                  Mark all read
                </button>
              </div>
            </div>

            {/* List area (MyFeedback-style loading/empty/content behavior) */}
            <div
              className={`notif-list-wrap ${!loading && pagedList.length === 0 ? "empty" : ""}`}
              aria-busy={loading}
              key={filter}
            >
              {loading ? (
                <NotifSkeletonList count={perPage} />
              ) : pagedList.length === 0 ? (
                <div className="empty-state" role="status" aria-live="polite">
                  <div className="empty-emoji" aria-hidden="true">🎉</div>
                  <h3 className="empty-title">
                    {filter === "unread" ? "You're all caught up!" : "No notifications found"}
                  </h3>
                  <p className="empty-sub">
                    {filter === "unread"
                      ? "You don’t have any unread notifications right now."
                      : "Try switching filters or check back later."}
                  </p>
                </div>
              ) : (
                <ul className="notification-list">
                  {pagedList.map((notif) => {
                    const meta = TYPE_META[notif.type] || {};
                    const styleVars = {
                      "--chip-bg": meta.bg || "#eef2f7",
                      "--chip-fg": meta.fg || "#334155",
                    };
                    return (
                      <li
                        key={notif.id}
                        className={`notification-card ${notif.read ? "" : "unread"}`}
                        onClick={() => handleOpen(notif)}
                        style={styleVars}
                      >
                        <div className="notif-top-row">
                          <div className="notif-top-left">
                            {!notif.read && <span className="notif-chip unread">Unread</span>}
                            <span className="notif-chip">{meta.label || "Update"}</span>
                          </div>
                          <span className="timestamp">{timeAgo(notif.createdAt)}</span>
                        </div>

                        <strong className="notif-title">{notif.title}</strong>
                        <p className="notif-message">{notif.message}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Range + page meta (matches MyFeedback look/wording) */}
            {!loading && filtered.length > 0 && (
              <div className="schedule-meta">
                <span className="schedule-meta__range">
                  Showing {filtered.length ? startIndex + 1 : 0}-{endIndex} of {filtered.length} notifications
                </span>
                {totalPages > 1 && (
                  <span className="schedule-meta__page">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>
            )}

            {/* Pagination controls (same layout/UX as MyFeedback) */}
            {!loading && totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                  paddingBottom: "2rem",
                }}
              >
                <button
                  onClick={() => setPage(currentPage - 1)}
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
                  aria-label="Previous page"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Previous
                </button>

                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {getPaginationItems(currentPage, totalPages).map((item, idx) =>
                    item === "..." ? (
                      <span key={`dots-${idx}`} style={{ padding: "0.5rem", color: "#9ca3af" }}>
                        ...
                      </span>
                    ) : (
                      <button
                        key={`p-${item}`}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? "page" : undefined}
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: item === currentPage ? "#3b82f6" : "white",
                          color: item === currentPage ? "white" : "#374151",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          minWidth: "40px",
                          transition: "all 0.2s ease",
                        }}
                        title={`Go to page ${item}`}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "0.5rem 0.75rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    background: currentPage === totalPages ? "#f9fafb" : "white",
                    color: currentPage === totalPages ? "#9ca3af" : "#374151",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    transition: "all 0.2s ease",
                  }}
                  aria-label="Next page"
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
    </div>
  );
}