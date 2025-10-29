import React, { useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useAuth } from "../context/AuthContext";
import "./BookSessionModal.css"; // Reuse existing modal styles

export default function ProgramSelectionModal({
  isOpen,
  onClose,
  user,
  onProgramSelected,
}) {
  const [selectedProgram, setSelectedProgram] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedProgram) {
      setError("Please select a program");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Call the API to update the user's program
      const response = await fetch(
        "http://localhost:5001/api/auth/update-program",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ program: selectedProgram }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update program");
      }

      const updatedData = await response.json();

      // Update the token in localStorage
      localStorage.setItem("token", updatedData.token);

      // Call the callback to update the user context
      // The API returns a user object with populated roleId/programId,
      // but our context expects a flat object from the JWT.
      // We can decode the new token to get the correct flat structure.
      const decodedUser = jwtDecode(updatedData.token);
      onProgramSelected(decodedUser);

      // Close the modal
      onClose();
    } catch (err) {
      console.error("Error updating program:", err);
      setError("Failed to update program. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user is a mentor to show GE option
  const isMentor = user?.role === "mentor";

  return (
    <div
      className="modal-overlay"
      onClick={(e) =>
        e.target === e.currentTarget && !isSubmitting && onClose()
      }
    >
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div
          className="modal-header-program"
          style={{ justifyContent: "left" }}
        >
          <h2 style={{ marginBottom: "0.5rem" }}>Select Your Program</h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            Welcome, {user?.name}! Please select your academic program to
            continue.
          </p>
        </div>

        <div style={{ padding: "1.5rem 0" }}>
          {error && (
            <div
              style={{
                color: "#dc2626",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                padding: "0.75rem",
                marginBottom: "1rem",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              style={{
                display: "block",
                fontWeight: 500,
                marginBottom: "0.5rem",
                color: "#374151",
              }}
            >
              Academic Program
            </label>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: `2px solid ${
                    selectedProgram === "IT" ? "#3b82f6" : "#e5e7eb"
                  }`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: selectedProgram === "IT" ? "#eff6ff" : "#ffffff",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  type="radio"
                  name="program"
                  value="IT"
                  checked={selectedProgram === "IT"}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  style={{
                    marginRight: "0.75rem",
                    width: "18px",
                    height: "18px",
                    accentColor: "#3b82f6",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#111827",
                      lineHeight: "1.4",
                    }}
                  >
                    Information Technology (IT)
                  </div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "#6b7280",
                      marginTop: "0.25rem",
                      lineHeight: "1.4",
                    }}
                  >
                    Software Development, Web Development, Network &
                    Cybersecurity
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: `2px solid ${
                    selectedProgram === "BA" ? "#3b82f6" : "#e5e7eb"
                  }`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: selectedProgram === "BA" ? "#eff6ff" : "#ffffff",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  type="radio"
                  name="program"
                  value="BA"
                  checked={selectedProgram === "BA"}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  style={{
                    marginRight: "0.75rem",
                    width: "18px",
                    height: "18px",
                    accentColor: "#3b82f6",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#111827",
                      lineHeight: "1.4",
                    }}
                  >
                    Business Administration (BA)
                  </div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "#6b7280",
                      marginTop: "0.25rem",
                      lineHeight: "1.4",
                    }}
                  >
                    Marketing Management, Financial Management, Data Analytics
                  </div>
                </div>
              </label>

              {/* Only show GE option for mentors */}
              {isMentor && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.75rem",
                    border: `2px solid ${
                      selectedProgram === "GE" ? "#3b82f6" : "#e5e7eb"
                    }`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    background:
                      selectedProgram === "GE" ? "#eff6ff" : "#ffffff",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="program"
                    value="GE"
                    checked={selectedProgram === "GE"}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                    style={{
                      marginRight: "0.75rem",
                      width: "18px",
                      height: "18px",
                      accentColor: "#3b82f6",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#111827",
                        lineHeight: "1.4",
                      }}
                    >
                      General Education (GE)
                    </div>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#6b7280",
                        marginTop: "0.25rem",
                        lineHeight: "1.4",
                      }}
                    >
                      Mathematics, English, Social Sciences, Humanities,
                      Physical Education
                    </div>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions-program">
          <div
            style={{
              fontSize: "0.75rem",
              color: "#6b7280",
              textAlign: "left",
              marginTop: "1rem",
              fontStyle: "italic",
            }}
          >
            This selection is required to access the system.
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedProgram}
            style={{
              opacity: isSubmitting || !selectedProgram ? 0.6 : 1,
              cursor:
                isSubmitting || !selectedProgram ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
