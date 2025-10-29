import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Layout.css";

export default function MobileNav({ activePage }) {
  const navigate = useNavigate();
  const location = useLocation(); // 👈 get current path
  const { user } = useAuth(); 
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Get current role - prioritize authenticated user's role
  const currentRole = user?.role || localStorage.getItem("testRole") || "student";

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth <= 1152;
  if (!isMobile) return null;

  const is = (path) => location.pathname === path; // simple matcher

  // Define navigation items based on role
  const getNavItems = () => {
    if (currentRole === "mentor") {
      return [
        {
          path: "/mentor-dashboard",
          label: "Dashboard",
          icon: "🏠",
          ariaLabel: "Dashboard",
        },
        {
          path: "/mentor/schedule",
          label: "My Schedule",
          icon: "🗓️",
          ariaLabel: "Schedule",
        },
        {
          path: "/mentor/session-notes",
          label: "Session Notes",
          icon: "📝",
          ariaLabel: "Notes",
        },
        {
          path: "/mentor/feedback",
          label: "My Feedback",
          icon: "⭐",
          ariaLabel: "Feedback",
        },
      ];
    } else if (currentRole === "admin") {
      return [
        {
          path: "/admin-dashboard",
          label: "Dashboard",
          icon: "🏠",
          ariaLabel: "Dashboard",
        },
        {
          path: "/admin/users",
          label: "Users",
          icon: "👥",
          ariaLabel: "Users",
        },
        {
          path: "/admin/analytics",
          label: "Analytics",
          icon: "📊",
          ariaLabel: "Analytics",
        },
        {
          path: "/admin/courses",
          label: "Courses",
          icon: "📖",
          ariaLabel: "Course Management",
        },
        {
          path: "/admin/system-settings",
          label: "Settings",
          icon: "⚙️",
          ariaLabel: "Settings",
        },
      ];
    } else {
      // Default student navigation
      return [
        {
          path: "/student-dashboard",
          label: "Dashboard",
          icon: "🏠",
          ariaLabel: "Dashboard",
        },
        {
          path: "/my-schedule",
          label: "My Schedule",
          icon: "🗓️",
          ariaLabel: "Schedule",
        },
        {
          path: "/session-notes",
          label: "Session Notes",
          icon: "📝",
          ariaLabel: "Notes",
        },
        {
          path: "/my-feedback",
          label: "My Feedback",
          icon: "⭐",
          ariaLabel: "Feedback",
        },
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => (
        <button
          key={item.path}
          className={`mobile-nav-item ${is(item.path) ? "active" : ""}`}
          onClick={() => navigate(item.path)}
          aria-current={is(item.path) ? "page" : undefined}
        >
          <span role="img" aria-label={item.ariaLabel}>
            {item.icon}
          </span>
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}

      <button
        className={`mobile-nav-item ${is("/notifications") ? "active" : ""}`}
        onClick={() => navigate("/notifications")}
        aria-current={is("/notifications") ? "page" : undefined}
      >
        <span role="img" aria-label="Notifications">
          🔔
        </span>
        <span className="mobile-nav-label">Notifications</span>
      </button>
    </nav>
  );
}
