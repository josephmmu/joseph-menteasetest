import { useAuth } from "../context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

export default function HomeRedirect() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p>Loading...</p>;

  if (!user) return <Navigate to="/login" />;

  // Prevent redirect loop if already on a dashboard page
  const dashboardPaths = [
    "/student-dashboard",
    "/mentor-dashboard",
    "/admin-dashboard",
  ];
  if (dashboardPaths.includes(location.pathname)) {
    return null; // Or return the children if this component wraps other routes
  }

  if (user.role === "admin") return <Navigate to="/admin-dashboard" />;
  if (user.role === "mentor") return <Navigate to="/mentor-dashboard" />;
  return <Navigate to="/student-dashboard" />;
}
