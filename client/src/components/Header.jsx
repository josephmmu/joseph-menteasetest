// Header.jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useSystemSettings } from "../context/SystemSettingsContext";
import { useNavigate } from "react-router-dom";
import AboutModal from "./AboutModal";
import CourseColorGuideModal from "./CourseColorGuideModal";
import "./Layout.css";

/* =========================
   Shared API helpers (aligned with Notifications page)
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
   Time: relative “x ago”
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
   🔔 Cross-tab / in-app sync for instant icon flips
   ========================= */
let notifBC = null;
const getNotifBC = () => {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  if (!notifBC) notifBC = new BroadcastChannel("notifications");
  return notifBC;
};

const pingNotificationsChanged = () => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("notifLastUpdated", String(Date.now()));
    }
  } catch {}
  try {
    getNotifBC()?.postMessage({ type: "changed", at: Date.now() });
  } catch {}
  try {
    // same-tab instant hook
    window.dispatchEvent(new Event("notifications-changed"));
  } catch {}
};

/* =========================
   Normalizer (aligned with Notifications page)
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
   API calls (aligned with Notifications page)
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
      if (res.ok) {
        pingNotificationsChanged();
        return true;
      }
    } catch {}
  }
  return false;
}

/* ========== helpers ========== */
const getUserInitials = (u) => {
  const name =
    u?.name ||
    u?.fullName ||
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() ||
    u?.displayName ||
    u?.username ||
    u?.email ||
    "";

  const str = String(name).trim();
  if (!str) return "";

  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const local = str.includes("@") ? str.split("@")[0] : str;
  const letters = local.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase();
  return letters[0]?.toUpperCase() || "";
};

/* =========================
   Polling & Push configs
   ========================= */
const POLL_VISIBLE_MS = 10_000;  // faster when tab is visible
const POLL_HIDDEN_MS  = 60_000;  // slower when hidden

export default function Header({ isMobile }) {
  const { user, logout } = useAuth();
  const { systemSettings } = useSystemSettings();
  const navigate = useNavigate();

  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showColorGuide, setShowColorGuide] = useState(false);

  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const [currentRole, setCurrentRole] = useState(
    user?.role || (typeof localStorage !== "undefined" && localStorage.getItem("testRole")) || "student"
  );

  const [notifications, setNotifications] = useState([]);
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const notifIconSrc = useMemo(
    () => (unreadCount > 0 ? "/notif-alert-icon.png" : "/notif-icon.png"),
    [unreadCount]
  );

  // timers & push refs
  const pollTimerRef = useRef(null);
  const sseRef = useRef(null);
  const isMountedRef = useRef(false);

  const clearPoll = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const refreshNow = useCallback(async () => {
    const arr = await fetchMyNotifications();
    arr.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    if (!isMountedRef.current) return;
    setNotifications((prev) => {
      const prevIds = prev.map((n) => n.id).join(",");
      const nextIds = arr.map((n) => n.id).join(",");
      if (prevIds === nextIds) {
        const changed = prev.length === arr.length && prev.some((p, i) => p.read !== arr[i].read);
        return changed ? arr : prev;
      }
      return arr;
    });
  }, []);

  const schedulePoll = useCallback((delayMs) => {
    clearPoll();
    pollTimerRef.current = setTimeout(async () => {
      await refreshNow();
      const nextDelay =
        typeof document !== "undefined" && document.visibilityState === "visible"
          ? POLL_VISIBLE_MS
          : POLL_HIDDEN_MS;
      schedulePoll(nextDelay);
    }, delayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE (try token-in-query too, if cookie auth isn't enough)
  const startSSE = useCallback(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) return;
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
      const url =
        `${API}/api/notifications/stream` +
        (token ? `?token=${encodeURIComponent(token)}` : "");
      const es = new EventSource(url, { withCredentials: true });
      sseRef.current = es;

      es.onmessage = () => {
        refreshNow();
      };
      es.onerror = () => {
        try { es.close(); } catch {}
        sseRef.current = null;
      };
    } catch {
      sseRef.current = null;
    }
  }, [refreshNow]);

  useEffect(() => {
    isMountedRef.current = true;

    // Initial load
    refreshNow();

    // ✅ start polling immediately (was missing before)
    const initialDelay =
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? POLL_VISIBLE_MS
        : POLL_HIDDEN_MS;
    schedulePoll(initialDelay);

    // Adjust polling on visibility change
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      schedulePoll(visible ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
      if (visible) refreshNow();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    // Also refresh on window focus
    const handleFocus = () => refreshNow();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus);
    }

    // 🔔 Cross-tab + same-tab listeners
    const onStorage = (e) => {
      if (e.key === "notifLastUpdated") refreshNow();
    };
    window.addEventListener("storage", onStorage);

    const bc = getNotifBC();
    if (bc) {
      bc.onmessage = (ev) => {
        if (ev?.data?.type === "changed") refreshNow();
      };
    }

    // same-tab custom event
    const onLocalNotif = () => refreshNow();
    window.addEventListener("notifications-changed", onLocalNotif);

    // expose a tiny global hook you can call after booking succeeds
    try {
      window.__notifyNotificationsChanged = pingNotificationsChanged;
    } catch {}

    // Start SSE (if supported)
    startSSE();

    return () => {
      isMountedRef.current = false;
      clearPoll();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("notifications-changed", onLocalNotif);
        try { delete window.__notifyNotificationsChanged; } catch {}
      }
      try {
        sseRef.current?.close?.();
      } catch {}
      sseRef.current = null;
      if (bc) bc.onmessage = null;
    };
  }, [refreshNow, schedulePoll, startSSE]);

  // Quick refresh when opening the dropdown
  useEffect(() => {
    if (showNotif) refreshNow();
  }, [showNotif, refreshNow]);

  // Click-away handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setShowNotif(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const switchRole = (newRole) => {
    setCurrentRole(newRole);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("testRole", newRole);
    }
    if (newRole === "mentor") navigate("/mentor-dashboard");
    else if (newRole === "admin") navigate("/admin-dashboard");
    else navigate("/student-dashboard");
  };

  const getCurrentPeriodDisplay = () => {
    const term = systemSettings?.currentTerm;
    const yearLabel = systemSettings?.currentAcademicYearLabel;
    if (!term || !yearLabel || yearLabel === "Loading...") return "Loading...";
    const displayYear = yearLabel.replace("SY ", "");
    return `Term ${term} S.Y. ${displayYear}`;
  };

  const topSorted = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
        .slice(0, 5),
    [notifications]
  );

  const handleNotifClick = async (index) => {
    const notif = topSorted[index];
    if (!notif) return;

    // optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    pingNotificationsChanged();

    await markNotificationRead(notif.id);

    setShowNotif(false);
    navigate(notif.link || "/");
  };

  const userInitials = useMemo(() => getUserInitials(user), [user]);

  return (
    <>
      <div className="header-bar fixed-header">
        <div className="header-left">
          <img src="/mmdc-logo.png" alt="MMDC Logo" className="header-logo full-logo" />
          <img src="/mmdc-icon.png" alt="MMDC Icon" className="header-logo icon-logo" />
        </div>

        <div className="header-right">
          <span className="term">{getCurrentPeriodDisplay()}</span>

          {!isMobile && (
            <div className="notif-wrapper" ref={notifRef}>
              <button
                className="notif-btn"
                onClick={() => setShowNotif((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={showNotif}
                aria-label={unreadCount ? `${unreadCount} unread notifications` : "No unread notifications"}
                title={unreadCount ? `${unreadCount} unread` : "Notifications"}
              >
                <img src={notifIconSrc} alt="Notifications" className="notif-icon-img" />
                {unreadCount > 0 && <span className="notif-dot" aria-hidden="true" />}
              </button>
              {showNotif && (
                <div className="notif-dropdown">
                  <div className="notif-header">
                    <span>Notifications</span>
                    <button
                      onClick={() => {
                        setShowNotif(false);
                        navigate("/notifications");
                      }}
                    >
                      See all
                    </button>
                  </div>

                  <ul className="notif-items">
                    {topSorted.length === 0 ? (
                      <li className="notif-entry">
                        <div className="notif-message">No notifications yet</div>
                        <div className="notif-meta">
                          <span className="notif-time">—</span>
                        </div>
                      </li>
                    ) : (
                      topSorted.map((notif, i) => (
                        <li
                          key={notif.id || `${notif.title}-${i}`}
                          className={`notif-entry ${!notif.read ? "unread" : ""}`}
                          onClick={() => handleNotifClick(i)}
                        >
                          <div className="notif-message">{notif.message}</div>
                          <div className="notif-meta">
                            <span className="notif-time">{timeAgo(notif.createdAt)}</span>
                            {!notif.read && <span className="notif-dot" />}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="profile-dropdown" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="user-icon"
              aria-haspopup="menu"
              aria-expanded={showMenu}
            >
              {userInitials || "👤"}
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowMenu(false);
                    setShowAbout(true);
                  }}
                >
                  About MentEase
                </button>

                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowMenu(false);
                    setShowColorGuide(true);
                  }}
                >
                  Course Color Guide
                </button>

                <div className="dropdown-sep" aria-hidden="true" />

                <button className="dropdown-item" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
      <CourseColorGuideModal open={showColorGuide} onClose={() => setShowColorGuide(false)} />
    </>
  );
}