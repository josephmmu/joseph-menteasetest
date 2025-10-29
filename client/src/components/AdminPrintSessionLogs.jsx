import React, { useMemo } from "react";
import { useSystemSettings } from "../context/SystemSettingsContext";

const round = (n, d = 1) => (isNaN(n) ? 0 : Math.round(n * 10 ** d) / 10 ** d);

export default function AdminPrintSessionLogs({
  row,
  items = [],
  sessionLookup,
  site = { name: "MentEase", logo: "/mmdc-logo.png" },
  meta = null,
}) {
  const { systemSettings } = useSystemSettings();

  const getCurrentPeriodDisplay = () => {
    const currentTerm = systemSettings?.currentTerm || 1;
    const currentAcademicYear = systemSettings?.currentAcademicYear || 3;

    // Generate academic years to get the label
    const generateAcademicYears = () => {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const baseYear = currentMonth >= 6 ? currentYear : currentYear - 1;

      const years = [];
      for (let i = -2; i <= 2; i++) {
        const startYear = baseYear + i;
        const endYear = startYear + 1;
        years.push({
          year: i + 3,
          label: `${startYear}–${endYear}`,
          startYear,
          endYear,
        });
      }
      return years;
    };

    const academicYears = generateAcademicYears();
    const currentYearData = academicYears.find(
      (y) => y.year === currentAcademicYear
    );
    const academicYearLabel = currentYearData
      ? currentYearData.label
      : "2025–2026";

    return `Term ${currentTerm} S.Y. ${academicYearLabel}`;
  };

  const termDisplay = meta?.term || getCurrentPeriodDisplay();
  const avg = useMemo(() => {
    if (!items.length) return 0;
    const sum = items.reduce((a, b) => a + (b.rating || 0), 0);
    return sum / items.length;
  }, [items]);

  const generated = useMemo(() => new Date().toLocaleString(), []);

  if (!row) {
    return (
      <div
        id="feedback-print-sheet"
        style={{ position: "absolute", left: "-9999px" }}
      >
        <div style={{ padding: "16mm 14mm", fontFamily: "Arial" }}>
          <h1>No course selected</h1>
        </div>
      </div>
    );
  }

  return (
    <div
      id="feedback-print-sheet"
      style={{ position: "absolute", left: "-9999px" }}
    >
      <div
        style={{
          padding: "16mm 14mm",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={site.logo}
            alt={`${site.name} Logo`}
            style={{ height: 44 }}
          />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a8a" }}>
              Session Logs – {row.subject} ({row.section})
            </div>
            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
              {site.name} • {termDisplay}
            </div>
          </div>
        </div>

        <div
          style={{
            height: 2,
            background: "#1e3a8a",
            opacity: 0.15,
            borderRadius: 2,
            margin: "12px 0 16px",
          }}
        />

        {/* Summary */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "12px 14px",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 14, color: "#475569", marginBottom: 4 }}>
            Mentor: <b>{row.teacher || "—"}</b>
          </div>
          <div style={{ fontSize: 15 }}>
            <b>{items.length}</b> session log
            {items.length === 1 ? "" : "s"}
            <span
              style={{
                display: "inline-block",
                marginLeft: 8,
                padding: "2px 8px",
                border: "1px solid #e5e7eb",
                borderRadius: 999,
              }}
            >
              {row.subject}
            </span>
            <span
              style={{
                display: "inline-block",
                marginLeft: 6,
                padding: "2px 8px",
                border: "1px solid #e5e7eb",
                borderRadius: 999,
              }}
            >
              {row.section}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.length === 0 ? (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              No session logs yet for this course.
            </div>
          ) : (
            items.map((f) => {
              const lookup = sessionLookup?.get?.(f.sessionId);
              return (
                <div
                  key={f.sessionId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {lookup?.dateTime}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                        display: "flex",
                        gap: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {lookup?.studentDisplay && (
                        <span>
                          {lookup.studentLabel}: {lookup.studentDisplay}
                        </span>
                      )}
                      {lookup?.status && (
                        <span>
                          Status: <b>{lookup.status}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#334155" }}>
                    <div style={{ marginBottom: 6 }}>
                      Subject: {row.subject} • {row.section}
                    </div>
                    <div>Topic: {lookup?.topic || "—"}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            color: "#64748b",
            fontSize: 12,
          }}
        >
          <div>Generated: {generated}</div>
          <div>{site.name}</div>
        </div>
      </div>
    </div>
  );
}
