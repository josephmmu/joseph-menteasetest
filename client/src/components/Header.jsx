import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useSystemSettings } from "../context/SystemSettingsContext";
import { useNavigate } from "react-router-dom";
import AboutModal from "./AboutModal";
import "./Layout.css";

export default function Header({ isMobile }) {
  const { user, logout } = useAuth();
  const { systemSettings } = useSystemSettings();
  const navigate = useNavigate();

  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const menuRef = useRef(null);
  const notifRef = useRef(null);

  // Role switcher for testing - sync with authenticated user
  const [currentRole, setCurrentRole] = useState(
    user?.role || localStorage.getItem("testRole") || "student"
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false);
      }
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
    localStorage.setItem("testRole", newRole);
    if (newRole === "mentor") navigate("/mentor-dashboard");
    else if (newRole === "admin") navigate("/admin-dashboard");
    else navigate("/student-dashboard");
  };

  // Format the current academic period for display
  const getCurrentPeriodDisplay = () => {
    const term = systemSettings?.currentTerm;
    const yearLabel = systemSettings?.currentAcademicYearLabel;

    if (!term || !yearLabel || yearLabel === "Loading...") {
      return "Loading...";
    }

    // The label from context is "SY YYYY-YYYY", we just need to reformat it slightly.
    const displayYear = yearLabel.replace("SY ", "");
    return `Term ${term} S.Y. ${displayYear}`;
  };

  // --- tiny time parser for “x hours ago” & actual dates (same as Notifications page) ---
  const UNIT_MS = {
    minute: 60_000,
    minutes: 60_000,
    hour: 3_600_000,
    hours: 3_600_000,
    day: 86_400_000,
    days: 86_400_000,
    week: 604_800_000,
    weeks: 604_800_000,
  };
  function ageMs(t) {
    const s = String(t).toLowerCase().trim();
    const m = s.match(
      /(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)\s*ago/
    );
    if (m) return parseInt(m[1], 10) * UNIT_MS[m[2]];
    const d = Date.parse(s);
    return Number.isNaN(d) ? Number.MAX_SAFE_INTEGER : Date.now() - d;
  }
  // -------------------------------------------------------------------------------

  const [notifications, setNotifications] = useState([
    // Sessions
    {
      type: "session",
      title: "Mentoring Session Tomorrow",
      message: "You have a session with Mr. Bryan Reyes at 4:30 PM.",
      time: "3 hours ago",
      read: false,
      link: "/my-schedule",
    },
    {
      type: "session",
      title: "Booking Confirmed",
      message: "OSI Layers session on Sept 22, 10:00 AM is confirmed.",
      time: "2 days ago",
      read: true,
      link: "/my-schedule",
    },

    // Feedback
    {
      type: "feedback",
      title: "Feedback Pending",
      message: "Please submit feedback for MO-IT104 (A2101).",
      time: "1 day ago",
      read: false,
      link: "/my-feedback",
    },
    {
      type: "feedback",
      title: "Mentor Feedback Received",
      message: "Your mentor left feedback for your HCI session.",
      time: "3 days ago",
      read: true,
      link: "/my-feedback",
    },

    // Session Notes
    {
      type: "notes",
      title: "Notes Updated by Mentor",
      message: "Your mentor added resources to the HCI notes.",
      time: "4 days ago",
      read: false,
      link: "/session-notes",
    },
  ]);

  // Sort newest → oldest and show only the top 5 in the dropdown
  const topSorted = useMemo(() => {
    return [...notifications]
      .sort((a, b) => ageMs(a.time) - ageMs(b.time))
      .slice(0, 5);
  }, [notifications]);

  const handleNotifClick = (index) => {
    setNotifications((prev) => {
      const copy = [...prev];
      const target = topSorted[index];
      const origIndex = prev.indexOf(target);
      if (origIndex > -1) {
        copy[origIndex] = { ...copy[origIndex], read: true };
      }
      return copy;
    });
    navigate(topSorted[index].link);
    setShowNotif(false);
  };

  return (
    <>
      <div className="header-bar fixed-header">
        <div className="header-left">
          <img
            src="/mmdc-logo.png"
            alt="MMDC Logo"
            className="header-logo full-logo"
          />
          <img
            src="/mmdc-icon.png"
            alt="MMDC Icon"
            className="header-logo icon-logo"
          />
        </div>

        <div className="header-right">
          <span className="term">{getCurrentPeriodDisplay()}</span>

          {/* Role Switcher for Testing */}
          {/* <div className="role-switcher">
            <select
              value={currentRole}
              onChange={(e) => switchRole(e.target.value)}
              className="role-select"
            >
              <option value="student">👨‍🎓 Student</option>
              <option value="mentor">👨‍🏫 Mentor</option>
              <option value="admin">👨‍💼 Admin</option>
            </select>
          </div> */}

          {/* Notifications (hidden on mobile) */}
          {!isMobile && (
            <div className="notif-wrapper" ref={notifRef}>
              <button
                className="notif-btn"
                onClick={() => setShowNotif((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={showNotif}
                aria-label="Open notifications"
              >
                <img
                  src="/notif-alert-icon.png"
                  alt="Notifications"
                  className="notif-icon-img"
                />
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
                    {topSorted.map((notif, i) => (
                      <li
                        key={`${notif.title}-${i}`}
                        className={`notif-entry ${!notif.read ? "unread" : ""}`}
                        onClick={() => handleNotifClick(i)}
                      >
                        <div className="notif-message">{notif.message}</div>
                        <div className="notif-meta">
                          <span className="notif-time">{notif.time}</span>
                          {!notif.read && <span className="notif-dot" />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Profile menu */}
          <div className="profile-dropdown" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="user-icon"
              aria-haspopup="menu"
              aria-expanded={showMenu}
            >
              {user?.name?.[0]?.toUpperCase() || "👤"}
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

                <div className="dropdown-sep" aria-hidden="true" />

                <button className="dropdown-item" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal lives alongside the header so it overlays the whole app */}
      <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
    </>
  );
}
