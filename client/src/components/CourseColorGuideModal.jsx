import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCourseColor } from "../context/CourseColorContext";
import "./CourseColorGuideModal.css";

export default function CourseColorGuideModal({ open, onClose }) {
  const { palettes, getCourseColor } = useCourseColor();
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const Chip = ({ label, color }) => (
    <div className="ccg-chip" title={`${label} • ${color}`}>
      <span className="ccg-chip-swatch" style={{ background: color }} />
      <span className="ccg-chip-label">{label}</span>
    </div>
  );

  const Example = ({ label, sample }) => (
    <div className="ccg-example" aria-label={label}>
      <span
        className="ccg-example-swatch"
        style={{ background: getCourseColor(sample) }}
        aria-hidden="true"
      />
      <span className="ccg-example-label">{label}</span>
    </div>
  );

  const body = (
    <div
      className="ccg-overlay"
      data-ccg-root
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="ccg-modal"
        data-ccg="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccg-title"
      >
        <div className="ccg-header">
          <h3 id="ccg-title">Course Color Guide</h3>
          <button
            className="ccg-iconbtn"
            type="button"
            aria-label="Close"
            onClick={onClose}
            ref={closeRef}
          >
            ×
          </button>
        </div>

        {/* Quick summary */}
        <div className="ccg-quick">
          <div className="ccg-quick-title">How colors are decided</div>
          <ul className="ccg-bullets">
            <li>
              <strong>Capstone</strong> (IT200D1/IT200D2 or “Capstone 1/2”) is
              always{" "}
              <span
                className="ccg-pill"
                style={{ background: palettes.CAPSTONE }}
              >
                teal
              </span>
              .
            </li>
            <li>
              <strong>Internship / PEP / Practicum</strong> uses the program’s{" "}
              <em>Year 4</em> color.
            </li>
            <li>
              <strong>GenEd</strong> uses the GenEd palette by year. In sections
              like <code>H3102</code>/<code>A2101</code>/<code>S1101</code>, the
              first digit is the year.
            </li>
            <li>Unknowns use a neutral fallback.</li>
          </ul>
        </div>

        {/* Palettes */}
        <div className="ccg-section">
          <h4>Program palettes</h4>
          <div className="ccg-grid">
            <div className="ccg-block">
              <div className="ccg-subtitle">IT</div>
              <div className="ccg-row">
                <Chip label="Year 1" color={palettes.IT[1]} />
                <Chip label="Year 2" color={palettes.IT[2]} />
                <Chip label="Year 3" color={palettes.IT[3]} />
                <Chip label="Year 4" color={palettes.IT[4]} />
              </div>
            </div>

            <div className="ccg-block">
              <div className="ccg-subtitle">BA</div>
              <div className="ccg-row">
                <Chip label="Year 1" color={palettes.BA[1]} />
                <Chip label="Year 2" color={palettes.BA[2]} />
                <Chip label="Year 3" color={palettes.BA[3]} />
                <Chip label="Year 4" color={palettes.BA[4]} />
              </div>
            </div>

            <div className="ccg-block">
              <div className="ccg-subtitle">GenEd</div>
              <div className="ccg-row">
                <Chip label="Year 1" color={palettes.GENED[1]} />
                <Chip label="Year 2" color={palettes.GENED[2]} />
                <Chip label="Year 3" color={palettes.GENED[3]} />
                <Chip label="Year 4" color={palettes.GENED[4]} />
              </div>
            </div>

            <div className="ccg-block">
              <div className="ccg-subtitle">Special</div>
              <div className="ccg-row">
                <Chip label="Capstone" color={palettes.CAPSTONE} />
                <Chip label="Fallback" color={palettes.FALLBACK} />
              </div>
            </div>
          </div>
        </div>

        {/* Examples */}
        <div className="ccg-section">
          <h4>Examples</h4>
          <div className="ccg-examples">
            <Example
              label="MO-IT104 A2201 (IT, Year 2)"
              sample="MO-IT104 A2201"
            />
            <Example
              label="MO-MKT199R1 (BA Internship - Year 4)"
              sample="MO-MKT199R1"
            />
            <Example
              label="MO-ENG039 H1101 (GenEd, Year 1)"
              sample="MO-ENG039 H1101"
            />
            <Example label="Capstone 2 (always teal)" sample="Capstone 2" />
            <Example
              label="MO-IT199 (Practicum - Year 4 color)"
              sample="MO-IT199"
            />
          </div>
          <p className="ccg-tip">
            Tip: A section like <code>H3102</code> means <strong>Year 3</strong>{" "}
            (the first digit after the letter).
          </p>
        </div>

        <div className="ccg-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  return open ? createPortal(body, document.body) : null;
}
