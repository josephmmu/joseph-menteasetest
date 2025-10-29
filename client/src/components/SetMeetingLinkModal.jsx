import React, { useEffect, useMemo, useState } from "react";
import "./SetMeetingLinkModal.css";

export default function SetMeetingLinkModal({
  isOpen,
  onClose,
  session,      // { subject, section, link?, courseId? }
  onSave,       // (subject, section, link) -> parent UI update (pass "" to clear)
  showToast,
}) {
  const API = (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/$/, "");

  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseId, setCourseId] = useState(session?.courseId || "");
  const [showConfirm, setShowConfirm] = useState(false);     // UI-only confirmation
  const [hasServerLink, setHasServerLink] = useState(false); // true if DB currently has a link

  const token = useMemo(() => localStorage.getItem("token") || "", []);
  const jsonHeaders = useMemo(
    () =>
      token
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" },
    [token]
  );
  const authOnlyHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // Close confirm on Escape (does NOT close the whole modal)
  useEffect(() => {
    if (!showConfirm) return;
    const onKey = (e) => e.key === "Escape" && setShowConfirm(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showConfirm]);

  // Load existing link from Course (if found)
  useEffect(() => {
    const boot = async () => {
      if (!isOpen || !session) return;
      setLoading(true);

      try {
        let cid = session.courseId || courseId;

        if (!cid) {
          const url = new URL(`${API}/api/courses/lookup`);
          url.searchParams.set("subject", session.subject || "");
          url.searchParams.set("section", session.section || "");
          const res = await fetch(url.toString(), { headers: jsonHeaders });
          if (res.ok) {
            const data = await res.json();
            cid = data.courseId;
            setCourseId(cid || "");
            const existing = data.defaultMeetLink || session.link || "";
            setLink(existing);
            setHasServerLink(!!(data.defaultMeetLink || "").trim());
          } else {
            // No server record found; fall back to whatever UI had
            const existing = session.link || "";
            setLink(existing);
            setHasServerLink(false);
          }
        } else {
          const res = await fetch(`${API}/api/courses/${cid}/link`, {
            headers: jsonHeaders,
          });
          if (res.ok) {
            const data = await res.json();
            const existing = data.defaultMeetLink || session.link || "";
            setLink(existing);
            setHasServerLink(!!(data.defaultMeetLink || "").trim());
          } else {
            const existing = session.link || "";
            setLink(existing);
            setHasServerLink(false);
          }
        }
      } catch {
        setLink(session.link || "");
        setHasServerLink(false);
      } finally {
        setLoading(false);
      }
    };

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session]);

  if (!isOpen || !session) return null;

  // ---------- Derived UI states ----------
  const isEmpty = !String(link).trim();
  const isValidMeet = String(link).startsWith("https://meet.google.com/");
  const canSave = isValidMeet;                 // Save only for a valid Meet URL
  const canRemove = hasServerLink || !isEmpty; // Same validation as before
  const saveLabel = saving ? "Saving…" : "Save";

  const handleSave = async () => {
    if (!isValidMeet) {
      showToast?.("⚠️ Please enter a valid Google Meet link.", "error");
      return;
    }

    try {
      setSaving(true);

      let cid = courseId;
      if (!cid) {
        // Resolve one more time
        const url = new URL(`${API}/api/courses/lookup`);
        url.searchParams.set("subject", session.subject || "");
        url.searchParams.set("section", session.section || "");
        const res = await fetch(url.toString(), { headers: jsonHeaders });
        if (res.ok) {
          const data = await res.json();
          cid = data.courseId;
          setCourseId(cid || "");
        }
      }

      if (cid) {
        const res = await fetch(`${API}/api/courses/${cid}/link`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ defaultMeetLink: link }),
        });
        if (!res.ok) throw new Error("Failed to update link on server");
        setHasServerLink(true); // DB now has a link
      }

      onSave?.(session.subject, session.section, link);
      showToast?.("Meeting link saved successfully!", "success");
      onClose();
    } catch (e) {
      showToast?.("Failed to save meeting link.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Remove clicked → validate same as before
  const handleRemoveClick = () => {
    if (!canRemove) {
      showToast?.("There is no meeting link to remove for this course/section.", "error");
      return;
    }
    setShowConfirm(true);
  };

  // Actual delete (called after styled confirm)
  const performDelete = async () => {
    try {
      setSaving(true);

      let cid = courseId;
      if (!cid) {
        // Resolve once more if needed
        const url = new URL(`${API}/api/courses/lookup`);
        url.searchParams.set("subject", session.subject || "");
        url.searchParams.set("section", session.section || "");
        const res = await fetch(url.toString(), { headers: jsonHeaders });
        if (res.ok) {
          const data = await res.json();
          cid = data.courseId;
          setCourseId(cid || "");
        }
      }

      if (cid) {
        // Try DELETE first
        let res = await fetch(`${API}/api/courses/${cid}/link`, {
          method: "DELETE",
          headers: authOnlyHeaders,
        });

        // Treat 204/200/404 as success (already cleared or not found)
        if (!(res.ok || res.status === 204 || res.status === 404)) {
          // Fallback: PATCH with empty string
          res = await fetch(`${API}/api/courses/${cid}/link`, {
            method: "PATCH",
            headers: jsonHeaders,
            body: JSON.stringify({ defaultMeetLink: "" }),
          });
          if (!res.ok) throw new Error("Failed to remove link on server");
        }
      }

      setHasServerLink(false);
      setLink(""); // reflect cleared state in the field
      onSave?.(session.subject, session.section, "");
      showToast?.("✅ Meeting link removed.", "success");
      onClose();
    } catch (e) {
      showToast?.("❌ Failed to remove meeting link.", "error");
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay set-link-modal">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Modify Meeting Link</h2>
        <p>
          {session.subject} - {session.section}
        </p>

        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://meet.google.com/your-meeting-link"
          className="form-input"
          disabled={loading || saving}
        />

        <div className="modal-actions">
          {canRemove && (
            <button
              onClick={handleRemoveClick}
              className="btn btn-danger"
              disabled={saving}
              title="Remove meeting link from database"
            >
              Remove Link
            </button>
          )}

          <div className="spacer" />
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary" disabled={!canSave || saving}>
            {saveLabel}
          </button>
        </div>

        {/* Styled, in-modal delete confirmation */}
        {showConfirm && (
          <>
            <div
              className="confirm-backdrop"
              onClick={() => setShowConfirm(false)}
            />
            <div
              className="confirm-card alert alert-danger"
              role="alertdialog"
              aria-labelledby="del-title"
              aria-describedby="del-desc"
            >
              <div className="alert-title" id="del-title">
                Remove meeting link?
              </div>
              <div className="alert-desc" id="del-desc">
                This will clear the default meeting link for{" "}
                <strong>{session.subject}</strong> — {session.section}. You can
                set it again later.
              </div>
              <div className="alert-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowConfirm(false)}
                >
                  Keep Link
                </button>
                <button
                  className="btn btn-danger"
                  onClick={performDelete}
                  disabled={saving}
                >
                  {saving ? "Removing…" : "Confirm Remove"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}