import React, { useEffect } from "react";
import "./GiveFeedbackModal.css";

export default function ConfirmFeedbackModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  bullets = [],
  preface = "",
  postface = "",
  confirmText = "OK",
  cancelText = "Cancel",
  className = "",
  closeOnBackdrop = false, 
  disableEsc = true,    
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e) => {
      if (e.key === "Escape" && !disableEsc) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose, disableEsc]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (closeOnBackdrop) onClose?.();
      }}
      aria-hidden="true"
    >
      <div
        className={`modal-content confirm-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" className="confirm-title">{title}</h3>

        {preface && <p className="confirm-text">{preface}</p>}

        {bullets?.length > 0 && (
          <ul className="confirm-list">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}

        {postface && <p className="confirm-text">{postface}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {cancelText}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}