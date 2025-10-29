import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const roleHome = {
  student: "/student-dashboard",
  mentor: "/mentor-dashboard",
  admin: "/admin-dashboard",
};

export default function ProtectedRoute({ roles = [], children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // or a spinner

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles.length && !roles.includes(user.role)) {
    return <Navigate to={roleHome[user.role] || "/"} replace />;
  }

  return children;
}