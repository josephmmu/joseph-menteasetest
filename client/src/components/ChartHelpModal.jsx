import React from "react";
import "./ChartHelpModal.css";

export default function ChartHelpModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="ch-modal-overlay" role="dialog" aria-modal="true">
      <div className="ch-modal">
        <div className="ch-modal-header">
          <div className="ch-modal-title">{title}</div>
          <button
            className="ch-modal-close"
            aria-label="Close help"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="ch-modal-body">{children}</div>
        <div className="ch-modal-footer">
          <button className="ch-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
