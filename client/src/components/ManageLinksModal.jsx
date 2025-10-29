// components/ManageLinksModal.jsx
import React, { useEffect, useRef } from "react";
import "./ManageLinksModal.css"; // dedicated modal CSS

export default function ManageLinksModal({
  isOpen,
  onClose,
  filteredPairs,
  meetingLinks,
  manageSearch,
  onChangeSearch,
  onSelectPair, // (subject, section) => void
  getAccentVars, // (subject, section) => style vars
}) {
  const overlayRef = useRef(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="ml-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="ml-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Manage Meeting Links"
      >
        <div className="ml-head">
          <div className="manage-menu-title">Manage Meeting Links</div>
          <button className="ml-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="ml-search">
          <input
            className="manage-search"
            placeholder="Search subject/section…"
            value={manageSearch}
            onChange={(e) => onChangeSearch(e.target.value)}
          />
        </div>

        <div className="ml-list manage-list" role="group" aria-label="Subjects">
          {filteredPairs.length === 0 && (
            <div className="manage-empty">No matches</div>
          )}

          {filteredPairs.map(({ subject, section }) => {
            const key = `${subject}__${section}`;
            const hasLink = !!meetingLinks[key];
            const vars = getAccentVars ? getAccentVars(subject, section) : {};

            return (
              <button
                key={key}
                className="manage-item"
                style={vars}
                onClick={() => onSelectPair(subject, section)}
                role="menuitem"
                title={hasLink ? "Modify default link" : "Set default link"}
              >
                <div className="mi-left">
                  <div className="mi-title">{subject}</div>
                  <div className="mi-sub">
                    <span className="mi-section">{section}</span>
                    <span
                      className={`status-badge ${hasLink ? "linked" : "unset"}`}
                    >
                      {hasLink ? "Linked" : "Not set"}
                    </span>
                  </div>
                </div>
                <span className="mi-cta">Modify</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
