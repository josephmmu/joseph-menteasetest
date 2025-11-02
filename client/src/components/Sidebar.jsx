import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Layout.css";

export default function Sidebar({ activePage }) {
  const navigate = useNavigate();
  const { user } = useAuth(); 

   // Get current role - prioritize authenticated user's role over localStorage
  const currentRole = user?.role || localStorage.getItem("testRole") || "student";

  // Define navigation items based on role
  const getNavItems = () => {
    if (currentRole === "mentor") {
      return [
        { label: "Dashboard", path: "/mentor-dashboard" },
        { label: "My Schedule", path: "/mentor/schedule" },
        { label: "Session Notes", path: "/mentor/session-notes" },
        { label: "My Feedback", path: "/mentor/feedback" },
      ];
    } else if (currentRole === "admin") {
      return [
        { label: "Dashboard", path: "/admin-dashboard" },
        { label: "User Management", path: "/admin/users" },
        { label: "Course Management", path: "/admin/courses" },
        { label: "System Settings", path: "/admin/system-settings" },
      ];
    } else {
      // Default student navigation
      return [
        { label: "Dashboard", path: "/student-dashboard" },
        { label: "My Schedule", path: "/my-schedule" },
        { label: "Session Notes", path: "/session-notes" },
        { label: "My Feedback", path: "/my-feedback" },
      ];
    }
  };

  const navItems = getNavItems();

  return (
    <aside className="sidebar fixed-sidebar">
      <nav>
        <ul>
          {navItems.map((item) => (
            <li
              key={item.label}
              onClick={() => navigate(item.path)}
              className={activePage === item.label ? "active" : ""}
            >
              {item.label}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
