import React, { useEffect, useMemo, useState } from "react";
import "./CancelBookingModal.css";

/** ========================
 *  Small cross-component helpers
 *  ======================== */
const API = (
  import.meta?.env?.VITE_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      }
    : { "Content-Type": "application/json", Accept: "application/json" };
};

const toIdString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    return (
      v._id || v.id || v.$id || v.$oid || (v.toString ? v.toString() : "")
    )?.toString();
  }
  return String(v);
};

const tryFetchJson = async (url, method = "GET", body) => {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const getTZShort = (date) => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
};

const formatDateTimeForNotif = (startISO, endISO) => {
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { label: "", dateStr: "", timeRange: "", tzShort: "" };
  }
  const fmtDate = (d) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const fmtTime = (d) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateStr = fmtDate(start);
  const startStr = fmtTime(start);
  const endStr = end && !Number.isNaN(end.getTime()) ? fmtTime(end) : "";
  const tzShort = getTZShort(start);
  const timeRange = endStr ? `${startStr}–${endStr}` : startStr;
  const label = `${dateStr}, ${timeRange} ${tzShort}`.trim();
  return { label, dateStr, timeRange, tzShort };
};

function extractEmail(obj) {
  return (
    obj?.email ||
    obj?.emailAddress ||
    obj?.primaryEmail ||
    obj?.schoolEmail ||
    obj?.login?.email ||
    obj?.user?.email ||
    obj?.account?.email ||
    obj?.student?.email ||
    obj?.profile?.email ||
    (Array.isArray(obj?.emails)
      ? obj.emails.find((e) => e?.primary)?.value || obj.emails[0]?.value
      : "") ||
    ""
  );
}

function normalizeRosterPerson(x) {
  if (!x) return { id: "", email: "", name: "" };
  const user = x.user || x.account || x.student || x; // common shapes
  const id =
    toIdString(user?._id || user?.id || x?._id || x?.id || x?.userId) || "";
  const email = String(extractEmail(x) || extractEmail(user) || "").toLowerCase();
  const name =
    x.name ||
    x.fullName ||
    [x.firstName, x.lastName].filter(Boolean).join(" ").trim() ||
    user?.name ||
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    x.username ||
    user?.username ||
    email ||
    "";
  return { id, email, name };
}

async function resolveEmailsToIds(emails = []) {
  const uniq = [...new Set((emails || []).map((e) => String(e || "").toLowerCase()))];
  const out = new Map();
  if (!uniq.length) return out;

  const bulkCandidates = [
    `${API}/api/users/by-emails?emails=${encodeURIComponent(uniq.join(","))}`,
    `${API}/api/students/by-emails?emails=${encodeURIComponent(uniq.join(","))}`,
    { url: `${API}/api/users/resolve`, method: "POST", body: { emails: uniq } },
    { url: `${API}/api/students/resolve`, method: "POST", body: { emails: uniq } },
  ];
  for (const c of bulkCandidates) {
    const data =
      typeof c === "string" ? await tryFetchJson(c) : await tryFetchJson(c.url, c.method, c.body);
    const arr = Array.isArray(data) ? data : data?.data || data?.users || data?.students || [];
    for (const it of arr || []) {
      const n = normalizeRosterPerson(it);
      if (n?.email && n?.id) out.set(n.email, toIdString(n.id));
    }
    if (out.size === uniq.length) break;
  }
  const missing = uniq.filter((e) => !out.has(e));
  for (const email of missing) {
    const tryUrls = [
      `${API}/api/users/by-email/${encodeURIComponent(email)}`,
      `${API}/api/users/find?email=${encodeURIComponent(email)}`,
      `${API}/api/students/by-email/${encodeURIComponent(email)}`,
      `${API}/api/students/find?email=${encodeURIComponent(email)}`,
    ];
    for (const url of tryUrls) {
      const data = await tryFetchJson(url);
      const n = Array.isArray(data) ? normalizeRosterPerson(data[0]) : normalizeRosterPerson(data);
      if (n?.id) {
        out.set(email, toIdString(n.id));
        break;
      }
    }
  }
  return out; // Map<email,id>
}

/**
 * FIXED: unified notifier that accepts either a userId OR an email.
 * Usage:
 *   await sendUnifiedNotification({ userId, email }, payload)
 *   await sendUnifiedNotification(userId, payload)              // backward compatible
 *   await sendUnifiedNotification({ email }, payload)           // email-only
 */
async function sendUnifiedNotification(target, payload) {
  const headers = authHeaders();
  const baseBody = (extra = {}) =>
    JSON.stringify({ sendEmail: true, ...payload, ...extra });

  // Normalize target
  let userId = "";
  let email = "";
  if (typeof target === "string") {
    userId = target;
  } else if (target && typeof target === "object") {
    userId = target.userId || "";
    email = target.email || "";
  }

  // 1) Prefer userId routes if available
  if (userId && userId !== "placeholder") {
    const attemptsId = [
      { url: `${API}/api/notifications`, body: { toUserId: userId } },
      { url: `${API}/api/notifications/send`, body: { to: userId } },
      { url: `${API}/api/users/${userId}/notifications`, body: {} },
      { url: `${API}/api/users/${userId}/notify`, body: {} },
    ];
    for (const a of attemptsId) {
      try {
        const res = await fetch(a.url, {
          method: "POST",
          headers,
          credentials: "include",
          body: baseBody(a.body),
        });
        if (res.ok) return true;
      } catch {}
    }
  }

  // 2) Fall back to email-based routes if we have an email
  if (email) {
    const attemptsEmail = [
      { url: `${API}/api/notifications/email`, body: { toEmail: email } },
      { url: `${API}/api/notifications/send`, body: { to: email, channel: "email" } },
      { url: `${API}/api/notify/email`, body: { to: email } },
      { url: `${API}/api/email/send`, body: { to: email } },
      { url: `${API}/api/mail/send`, body: { to: email } },
      { url: `${API}/api/notifications`, body: { toEmail: email } },
    ];
    for (const a of attemptsEmail) {
      try {
        const res = await fetch(a.url, {
          method: "POST",
          headers,
          credentials: "include",
          body: baseBody(a.body),
        });
        if (res.ok) return true;
      } catch {}
    }
  }

  return false;
}

async function getSelfUserId() {
  const me = await tryFetchJson(`${API}/api/auth/me`);
  return toIdString(me?._id || me?.id || me?.user?._id || me?.user?.id) || "";
}

async function getMentorUserIdFromSession(session) {
  // try direct fields
  const direct =
    toIdString(session?.mentorId) ||
    toIdString(session?.mentor?._id || session?.mentor?.id) ||
    "";
  if (direct) return direct;

  // try session API
  const sid =
    toIdString(session?._id) ||
    toIdString(session?.id) ||
    toIdString(session?.sessionId) ||
    "";
  if (sid) {
    const s = await tryFetchJson(`${API}/api/sessions/${sid}`);
    const id =
      toIdString(s?.mentorId) ||
      toIdString(s?.mentor?._id || s?.mentor?.id) ||
      "";
    if (id) return id;
  }

  // try course/offering API
  const offId =
    toIdString(session?.offeringId || session?.offeringID) ||
    toIdString(session?.courseId) ||
    "";
  if (offId) {
    const c =
      (await tryFetchJson(`${API}/api/courses/${offId}`)) ||
      (await tryFetchJson(`${API}/api/courseInstances/${offId}`));
    const id =
      toIdString(c?.mentorId) || toIdString(c?.mentor?._id || c?.mentor?.id) || "";
    if (id) return id;
  }

  // fallback via mentor email
  const mentorEmail =
    session?.mentorEmail ||
    session?.mentor?.email ||
    (typeof session?.mentor === "object" ? session?.mentor?.email : "");
  if (mentorEmail) {
    const map = await resolveEmailsToIds([mentorEmail]);
    return map.get(mentorEmail.toLowerCase()) || "";
  }

  return "";
}

/** Normalize any array of strings/objects into display names */
const extractStudentNames = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => {
      if (typeof s === "string") return s.trim();
      if (s && typeof s === "object") {
        const u = s.user && typeof s.user === "object" ? s.user : null;
        const parts = [
          s.name,
          s.fullName,
          [s.firstName, s.lastName].filter(Boolean).join(" ").trim(),
          s.displayName,
          s.username,
          s.email,
          s.rollNo,
          u?.name,
          u?.fullName,
          [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim(),
          u?.displayName,
          u?.username,
          u?.email,
        ];
        const found = parts.find((p) => typeof p === "string" && p.trim());
        if (found) return found.trim();
      }
      return "";
    })
    .filter(Boolean);
};

const collectStudentCandidates = (session) => {
  const pools = []
    .concat(session?.students || [])
    .concat(session?.members || [])
    .concat(session?.participants || [])
    .concat(session?.attendees || [])
    .concat(session?.group || [])
    .concat(session?.groupMembers || [])
    .concat(session?.roster || []);
  const norm = pools.map(normalizeRosterPerson);
  // keep only likely students (not mentors)
  return norm.filter((p) => p.email || p.id || p.name);
};

/** ========================
 *  Component
 *  ======================== */
export default function CancelBookingModal({
  isOpen,
  onClose,
  session,
  onConfirm,
  viewerRole = "student",
}) {
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form each time the modal opens or the selected session changes
  useEffect(() => {
    if (!isOpen) return;
    setReason("");
    setAck(false);
    setSubmitting(false);
  }, [isOpen, session?.id, session?._id, session?.startISO, session?.date]);

  // Names (for mentor view)
  const studentNames = extractStudentNames(
    session?.students ||
      session?.members ||
      session?.participants ||
      session?.attendees ||
      session?.group ||
      session?.groupMembers
  );

  const fromMembersOnly =
    !!session?.members &&
    !session?.students &&
    !session?.participants &&
    !session?.attendees &&
    !session?.group &&
    !session?.groupMembers;

  const isGroup = useMemo(
    () =>
      Boolean(session?.isGroup) ||
      studentNames.length > 1 ||
      (fromMembersOnly && studentNames.length >= 1),
    [session?.isGroup, fromMembersOnly, studentNames]
  );

  if (!isOpen || !session) return null;

  // Role-aware bits
  const isMentor = viewerRole === "mentor";
  const title = isMentor ? "Cancel Session" : "Cancel Booking";
  const notifyTarget = isMentor ? "The student(s)" : "The mentor";

  const mentorDisplay =
    typeof session?.mentor === "string"
      ? session.mentor
      : session?.mentor?.name ||
        session?.mentor?.fullName ||
        session?.mentor?.email ||
        "";

  const whoLine = isMentor
    ? isGroup
      ? `Students: ${studentNames.length ? studentNames.join(", ") : "—"}`
      : `Student: ${studentNames[0] || "—"}`
    : `Mentor: ${mentorDisplay || "—"}`;

  /** ---------- Notify (in-app + email) after successful cancel ---------- */
  const notifyCancellationAll = async () => {
    try {
      const startISO =
        session?.startISO ||
        session?.scheduleStart ||
        (session?.date ? new Date(session.date).toISOString() : "");
      const endISO = session?.endISO || session?.scheduleEnd || "";

      const { label } = formatDateTimeForNotif(startISO, endISO);
      const courseLabel = `${session.subject || "Course"}${
        session.section ? ` — ${session.section}` : ""
      }`.trim();

      const selfId = await getSelfUserId();
      const nowIso = new Date().toISOString();

      if (isMentor) {
        // mentor → notify all students
        const studs = collectStudentCandidates(session);
        const emails = studs.map((s) => s.email).filter(Boolean);
        const idMap = await resolveEmailsToIds(emails);

        for (const s of studs) {
          const uid = s.id || idMap.get((s.email || "").toLowerCase()) || "";
          const recipientEmail = s.email || "";
          const target = uid && uid !== selfId ? { userId: uid, email: recipientEmail } : { email: recipientEmail };
          if (!target.userId && !target.email) continue;

          await sendUnifiedNotification(target, {
            type: "session",
            title: `Session cancelled: ${courseLabel}`,
            message: `Your mentor cancelled ${courseLabel} scheduled ${label}.`,
            content: `Reason: ${reason || "No reason provided."}`,
            link: "/my-schedule",
            pageRelated: "/my-schedule",
            createdAt: nowIso,
            meta: {
              action: "cancel",
              by: "mentor",
              subject: session.subject,
              section: session.section,
              scheduleStart: startISO,
              scheduleEnd: endISO,
              reason,
              origin: "client_cancel_flow",
            },
          });
        }
      } else {
        // student → notify mentor
        const mentorId = await getMentorUserIdFromSession(session);
        const mentorEmail =
          session?.mentorEmail ||
          session?.mentor?.email ||
          (typeof session?.mentor === "object" ? session?.mentor?.email : "");
        const target =
          (mentorId && mentorId !== selfId)
            ? { userId: mentorId, email: mentorEmail || "" }
            : (mentorEmail ? { email: mentorEmail } : null);

        if (target) {
          await sendUnifiedNotification(target, {
            type: "session",
            title: `Booking cancelled: ${courseLabel}`,
            message: `A student cancelled ${courseLabel} scheduled ${label}.`,
            content: `Reason: ${reason || "No reason provided."}`,
            link: "/mentor/schedule",
            pageRelated: "/mentor/schedule",
            createdAt: nowIso,
            meta: {
              action: "cancel",
              by: "student",
              subject: session.subject,
              section: session.section,
              scheduleStart: startISO,
              scheduleEnd: endISO,
              reason,
              origin: "client_cancel_flow",
            },
          });
        }
      }
    } catch {
      // best-effort; swallow
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!ack || !reason.trim() || submitting) return;

    const payload = {
      subject: session.subject,
      section: session.section,
      mentor: session.mentor,
      date: session.date,
      reason: reason.trim(),
      action: "cancel",
      as: viewerRole, // who is acting
      notifyMentor: !isMentor, // student flow
      notifyStudents: isMentor, // mentor flow
    };

    try {
      setSubmitting(true);
      const ok = await onConfirm?.(payload);

      // If parent didn't explicitly prevent close, proceed.
      if (ok !== false) {
        // Fire client-side notifications (in-app + email)
        await notifyCancellationAll();
        onClose?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay mentor-cancel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-title"
      onClick={(e) => {
        if (e.target.classList.contains("modal-overlay")) onClose?.();
      }}
    >
      <div className="modal-content">
        {/* Policy reminder (parent enforces the rule) */}
        <span className="tip-wrapper top-right" aria-describedby="cancel-policy-tip">
          <svg
            className="info-icon-svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" fill="#1e3a8a" />
            <path
              d="M12 7.2c-1.77 0-3.2 1.12-3.2 2.5 0 .41.33.75.75.75s.75-.34.75-.75c0-.62.77-1 1.7-1s1.7.5 1.7 1.2c0 .56-.33.87-.98 1.26-.74.46-1.72 1.07-1.72 2.42v.35c0 .41.34.75.75.75s.75-.34.75-.75v-.35c0-.7.35-1 .98-1.38.79-.47 1.97-1.19 1.97-2.65 0-1.64-1.45-2.95-3.45-2.95Z"
              fill="#fff"
            />
            <circle cx="12" cy="16.8" r="1" fill="#fff" />
          </svg>
          <span id="cancel-policy-tip" className="tip-text">
            Cancellations are allowed up to <strong>24 hours before</strong> the
            session start time.
          </span>
        </span>

        <h2 id="cancel-title">{title}</h2>

        <p>
          <strong>{session.subject}</strong> — {session.section}
        </p>

        <p className="meta" style={{ marginTop: 3 }}>{whoLine}</p>

        <p style={{ marginTop: "0.25rem" }}>Scheduled: {session.date}</p>

        <p className="hint" style={{ marginTop: "1rem" }}>
          {notifyTarget} will be <strong>automatically</strong> emailed about this cancellation.
        </p>

        <form onSubmit={handleConfirm}>
          <div className="row full">
            <label className="label" htmlFor="cancel-reason" style={{fontWeight: 600, color: "#1e3a8a"}}>
              Reason for cancellation
            </label>
            <textarea
              id="cancel-reason"
              name="reason"
              rows="3"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                viewerRole === "mentor"
                  ? "e.g., unavoidable conflict, emergency, illness"
                  : "e.g., schedule conflict, urgent matter"
              }
              disabled={submitting}
            />
          </div>

          <div className="row full checkbox-row">
            <input
              id="acknowledge"
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              disabled={submitting}
            />
            <label htmlFor="acknowledge" className="checkbox-label">
              I understand this action cannot be undone.
            </label>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              disabled={submitting}
            >
              Close
            </button>
            <button
              type="submit"
              className="btn btn-primary btn--center-text"
              disabled={!ack || !reason.trim() || submitting}
              style={{
                background: "#dc2626",
                opacity: !ack || !reason.trim() || submitting ? 0.6 : 1,
                cursor: !ack || !reason.trim() || submitting ? "not-allowed" : "pointer",
              }}
              aria-disabled={!ack || !reason.trim() || submitting}
            >
              {submitting ? "Cancelling…" : "Confirm Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}