import React from "react";
import { useLocation } from "react-router-dom";
import SessionNotesFloatingModal from "../components/SessionNotesFloatingModal";

export default function SessionNotesPopup() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);

  // --- pull raw params (with graceful fallbacks) ---
  const id = params.get("id") || "popup-note";
  const subject = params.get("subject") || "";
  const section = params.get("section") || "";
  const topic = params.get("topic") || "";
  const mentorName = params.get("mentorName") || params.get("mentor") || "Mentor";
  const studentNamesRaw =
    params.get("studentName") || params.get("students") || ""; // comma-separated
  const hideBack = /^(1|true|yes)$/i.test(params.get("hideBack") || "");

  // Prefer ISO; if not present, try parse a free-form dateTime param; else ""
  const dateTimeISOParam = params.get("dateTimeISO") || "";
  const dateTimeDisplayParam = params.get("dateTime") || "";
  let dateTimeISO = dateTimeISOParam;
  if (!dateTimeISO && dateTimeDisplayParam) {
    const parsed = new Date(dateTimeDisplayParam);
    if (!Number.isNaN(parsed.getTime())) {
      dateTimeISO = parsed.toISOString();
    }
  }

  // --- build session object passed to modal ---
  const session = {
    id,
    subject,
    section,
    topic,
    mentorName,
    dateTimeISO,
  };

  // If student names are present, assume the opener is the mentor view.
  // Otherwise treat as a student opening their own session note.
  const isMentorView = studentNamesRaw.trim().length > 0;

  const currentUser = isMentorView
    ? { id: "mentor-uid", name: "Mentor User", role: "M" }
    : { id: "student-uid", name: "Student User", role: "S" };

  // Participants list: always include the mentor + any students parsed
  const students = studentNamesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name, i) => ({ id: `student-${i}`, name, role: "S" }));

  const participants = [
    { id: "mentor", name: mentorName || "Mentor", role: "M" },
    ...students,
  ];

  return (
    <SessionNotesFloatingModal
      mode="standalone"
      isOpen={true}
      onClose={() => window.close()}
      session={session}
      currentUser={currentUser}
      participants={participants}
      onAutosave={async () => {}}
      onFinalize={async () => {}}
      showBackButton={!hideBack} // hide back button when opened from Session Notes list
    />
  );
}