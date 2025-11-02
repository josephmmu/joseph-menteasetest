// src/pages/SessionNotesPopup.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";
import SessionNotesFloatingModal from "../components/SessionNotesFloatingModal";

const API =
  (import.meta?.env?.VITE_API_BASE_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:5000").replace(/\/+$/, ""); // ✅ unify to :5000

function authHeaders() {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function readUserFromToken() {
  try {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const [, payload] = t.split(".");
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

const OID_RE = /^[a-fA-F0-9]{24}$/;

export default function SessionNotesPopup() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);

  const sessionId = params.get("id") || "";
  const subject = params.get("subject") || "";
  const section = params.get("section") || "";
  const topic = params.get("topic") || "";
  const mentorNameParam = params.get("mentorName") || params.get("mentor") || "";

  let startISOParam = params.get("startISO") || "";
  let endISOParam = params.get("endISO") || "";
  const dateTimeISO = params.get("dateTimeISO") || "";
  if (!startISOParam && dateTimeISO) startISOParam = dateTimeISO;

  const studentNamesParam =
    params.get("studentNames") || params.get("studentName") || params.get("students") || "";

  const validId = OID_RE.test(sessionId);

  const [loading, setLoading] = useState(true);
  const [initialTopics, setInitialTopics] = useState("");
  const [initialNextSteps, setInitialNextSteps] = useState("");

  const [meta, setMeta] = useState({
    subject,
    section,
    mentorName: mentorNameParam,
    startISO: startISOParam || "",
    endISO: endISOParam || "",
  });

  const [currentUser, setCurrentUser] = useState({
    id: "me",
    name: "",
    email: "",
    roleId: null,
    roleCode: "",
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!validId) {
        setLoading(false);
        return;
      }

      // 1) hydrate user
      try {
        const { data } = await axios.get(`${API}/api/auth/me`, {
          withCredentials: true,
          headers: authHeaders(),
        });
        if (!alive) return;
        const uname =
          (data?.name && String(data.name).trim()) ||
          ([data?.firstName, data?.lastName].filter(Boolean).join(" ").trim()) ||
          (data?.fullName && String(data.fullName).trim()) ||
          (data?.email && String(data.email).trim()) ||
          "";
        const uid = data?._id || data?.id || "me";
        const roleId = (data?.roleId && (data.roleId._id || data.roleId)) || null;
        const roleCode = data?.role?.code || data?.roleCode || data?.role?.name || "";
        setCurrentUser({
          id: String(uid),
          name: uname,
          email: String(data?.email || ""),
          roleId: roleId ? String(roleId) : null,
          roleCode: String(roleCode || ""),
        });
      } catch {
        let uname = "";
        let uid = "me";
        let email = "";
        let roleId = null;
        let roleCode = "";
        const tok = readUserFromToken();
        if (tok) {
          uname =
            (tok.name && String(tok.name).trim()) ||
            ([tok.firstName, tok.lastName].filter(Boolean).join(" ").trim()) ||
            (tok.fullName && String(tok.fullName).trim()) ||
            (tok.email && String(tok.email).trim()) ||
            "";
          uid = tok._id || tok.id || uid;
          email = tok.email || "";
          roleId = tok.roleId || null;
          roleCode = tok.roleCode || tok.role?.code || "";
        }
        setCurrentUser({
          id: String(uid),
          name: String(uname),
          email: String(email || ""),
          roleId: roleId ? String(roleId) : null,
          roleCode: String(roleCode || ""),
        });
      }

      // 2) prefill my note
      try {
        setLoading(true);
        const { data } = await axios.get(
          `${API}/api/session-notes/mine/${encodeURIComponent(sessionId)}`,
          { withCredentials: true, headers: authHeaders() }
        );
        if (!alive) return;
        const note = data?.note || {};
        setInitialTopics(note?.topicsDiscussed || "");
        setInitialNextSteps(note?.nextSteps || "");
      } catch (e) {
        console.warn("[session-notes] prefill failed:", e?.response?.status, e?.message);
      } finally {
        if (alive) setLoading(false);
      }

      // 3) meta fallback
      setMeta((m) => ({
        subject: m.subject || subject,
        section: m.section || section,
        mentorName: mentorNameParam || m.mentorName || "",
        startISO: m.startISO || startISOParam || "",
        endISO: m.endISO || endISOParam || "",
      }));
    })();

    return () => {
      alive = false;
    };
  }, [
    validId,
    sessionId,
    subject,
    section,
    mentorNameParam,
    startISOParam,
    endISOParam,
    studentNamesParam,
  ]);

  const onAutosave = React.useMemo(() => {
    return async ({ topicsDiscussed, nextSteps }) => {
      try {
        await axios.patch(
          `${API}/api/session-notes/mine/${encodeURIComponent(sessionId)}`,
          { topicsDiscussed, nextSteps },
          { withCredentials: true, headers: authHeaders() }
        );
      } catch (err) {
        const code = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message;
        console.error("[session-notes] autosave error:", code, msg);
        throw err; // keep behavior the same (shows red error overlay in dev)
      }
    };
  }, [sessionId]);

  if (!validId) {
    return (
      <div style={{ padding: 24, color: "#b91c1c" }}>
        Invalid session id. Expected a 24-hex Mongo ObjectId, got:{" "}
        <strong>{sessionId || "(empty)"}</strong>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  const session = {
    id: sessionId,
    subject: meta.subject,
    section: meta.section,
    topic,
    mentorName: meta.mentorName,
    startISO: meta.startISO || "",
    endISO: meta.endISO || "",
    studentNames: String(studentNamesParam || "").trim(),
  };

  return (
    <SessionNotesFloatingModal
      mode="standalone"
      isOpen={true}
      onClose={() => window.close()}
      session={session}
      currentUser={currentUser}
      initialTopicsDiscussed={initialTopics}
      initialNextSteps={initialNextSteps}
      onAutosave={onAutosave}
      showBackButton={false}
    />
  );
}