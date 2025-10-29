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
  const t = localStorage.getItem("token");
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
   Chip colors (unchanged)
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
   Component
   ========================= */
export default function Notifications() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1152);
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1152);
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
    })();
  }, []);

  const filtered = useMemo(() => {
    let base = items;
    if (filter === "unread") base = items.filter((n) => !n.read);
    else if (filter !== "all") base = items.filter((n) => n.type === filter);
    return [...base].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  }, [filter, items]);

  const handleOpen = async (idx) => {
    const item = filtered[idx];
    if (!item) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    await markNotificationRead(item.id);
    window.location.assign(item.link || "/");
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
                <label className="notif-filter-label" htmlFor="notif-filter">Filter</label>
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

            {loading ? (
              <ul className="notification-list">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={`skel-${i}`} className="notification-card" aria-hidden="true" style={{ opacity: 0.6 }}>
                    <div className="notif-top-row">
                      <div className="notif-top-left">
                        <span className="notif-chip">Loading…</span>
                      </div>
                      <span className="timestamp">—</span>
                    </div>
                    <strong className="notif-title">Loading…</strong>
                    <p className="notif-message">Please wait</p>
                  </li>
                ))}
              </ul>
            ) : filtered.length === 0 ? (
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
                {filtered.map((notif, i) => {
                  const meta = TYPE_META[notif.type] || {};
                  const styleVars = { "--chip-bg": meta.bg || "#eef2f7", "--chip-fg": meta.fg || "#334155" };
                  return (
                    <li
                      key={notif.id || `${notif.title}-${i}`}
                      className={`notification-card ${notif.read ? "" : "unread"}`}
                      onClick={() => handleOpen(i)}
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
        </main>
      </div>
    </div>
  );
}