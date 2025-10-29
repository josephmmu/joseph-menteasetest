import React from "react";
import MultiDonut from "./MultiDonut";
import { buildMultiDonutSegments, getSuccessRate } from "./sessionSuccessData";
import "../pages/student/StudentDashboard.css";

export default function SessionSuccessCard({ data, onOpen }) {
  const segments = buildMultiDonutSegments(data);
  const success = getSuccessRate(data);

  return (
    <div className="session-success-card-content">
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
        <MultiDonut title={null} data={segments} />
      </div>

      <div
        style={{
          textAlign: "center",
          fontWeight: 800,
          fontSize: 24,
          color: "#f59e0b",
          marginTop: -25,
        }}
      >
        {success}%
      </div>

      <button type="button" onClick={onOpen} className="action-btn">
        VIEW DETAILS
      </button>
    </div>
  );
}