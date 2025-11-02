// src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Login from "./pages/Login";
import StudentDashboard from "./pages/student/StudentDashboard";
import MentorDashboard from "./pages/mentor/MentorDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import HomeRedirect from "./pages/HomeRedirect";
import MySchedule from "./pages/student/MySchedule";
import SessionNotes from "./pages/student/SessionNotes";
import MentorSessionNotes from "./pages/mentor/MentorSessionNotes";
import MentorMySchedule from "./pages/mentor/MentorMySchedule";
import MentorMyFeedback from "./pages/mentor/MentorMyFeedback";
import MyFeedback from "./pages/student/MyFeedback";
import Notifications from "./pages/Notifications";
import AboutMentEase from "./pages/AboutMentEase";
import { CourseColorProvider } from "./context/CourseColorContext";
import { SystemSettingsProvider } from "./context/SystemSettingsContext";
import AdminUserManagement from "./pages/admin/AdminUserManagement";
import CourseControl from "./pages/admin/AdminCourseManagement";
import AdminSystemSettings from "./pages/admin/AdminSystemSettings";
import SessionNotesPopup from "./pages/SessionNotesPopup";

function App() {
  return (
    <SystemSettingsProvider>
      <CourseColorProvider>
        <Router>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />

            {/* Student-only */}
            <Route
              path="/student-dashboard"
              element={
                <ProtectedRoute roles={["student"]}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-schedule"
              element={
                <ProtectedRoute roles={["student"]}>
                  <MySchedule />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session-notes"
              element={
                <ProtectedRoute roles={["student"]}>
                  <SessionNotes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-feedback"
              element={
                <ProtectedRoute roles={["student"]}>
                  <MyFeedback />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute roles={["student", "mentor", "admin"]}>
                  <Notifications />
                </ProtectedRoute>
              }
            />

            {/* Mentor-only */}
            <Route
              path="/mentor-dashboard"
              element={
                <ProtectedRoute roles={["mentor"]}>
                  <MentorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/schedule"
              element={
                <ProtectedRoute roles={["mentor"]}>
                  <MentorMySchedule />
                </ProtectedRoute>
              }
            />
            {/* Backward-compat for any old/hardcoded links */}
            <Route path="/mentor-schedule" element={<Navigate to="/mentor/schedule" replace />} />

            <Route
              path="/mentor/session-notes"
              element={
                <ProtectedRoute roles={["mentor"]}>
                  <MentorSessionNotes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/feedback"
              element={
                <ProtectedRoute roles={["mentor"]}>
                  <MentorMyFeedback />
                </ProtectedRoute>
              }
            />

            {/* Admin-only */}
            <Route
              path="/admin-dashboard"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminUserManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/courses"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <CourseControl />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system-settings"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminSystemSettings />
                </ProtectedRoute>
              }
            />

            {/* Shared or utility */}
            <Route path="/about-mentease" element={<AboutMentEase />} />
            <Route path="/session-notes-popup" element={<SessionNotesPopup />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </CourseColorProvider>
    </SystemSettingsProvider>
  );
}

export default App;