import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import GiveFeedbackModal from "../../components/GiveFeedbackModal";
import ViewFeedbackModal from "../../components/ViewFeedbackModal";
import "./MyFeedback.css";
import { useCourseColor } from "../../context/CourseColorContext";
import {
  getProgramFromCode,
  getYearFromSectionDigit,
  ordinal,
} from "../../utils/programYear";

export default function Feedback() {
  const [activeTab, setActiveTab] = useState("received");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSubmitted, setSelectedSubmitted] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const { getCourseColor, normalizeCourseKey } = useCourseColor();
  const isMobile = windowWidth <= 1152;

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastMsg("");
      toastTimer.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Seed data
  const seed = {
    awaiting: [
      {
        id: "await-1",
        date: "August 10, 2025 - 10:00 AM",
        subject: "MO-IT104 Computer Networks",
        section: "A2101",
        mentor: "Ms. Clara Villanueva",
        topic: "OSI Layers Overview",
        submittedAt: "January 1, 2025 at 1:30 PM",
      },
    ],
    submitted: [
      {
        id: "sub-1",
        date: "January 1, 2025 - 1:00 PM",
        subject: "MO-IT101 Computer Programming 1",
        section: "A1101",
        mentor: "Ms. Hannah Cruz",
        topic: "Loops and Conditionals",
        rating: 5,
        comment:
          "Very clear explanations and great examples.\nHelped me understand nested loops.",
        anonymous: true,
        submittedAt: "January 12, 2025 at 1:30 PM",
      },
    ],
    received: [
      {
        id: "rec-1",
        date: "August 12, 2025 - 2:30 PM",
        subject: "MO-IT104 Computer Networks",
        section: "A2101",
        mentor: "Ms. Clara Villanueva",
        topic: "OSI Layers Overview",
        mentorRating: 4,
        mentorComment: "Participated actively and asked thoughtful questions.",
        submittedAt: "March 1, 2025 at 1:30 PM",
      },
    ],
  };

  const [data, setData] = useState(seed);

  const toModalShape = (entry) => {
    if (entry.mentorRating != null || entry.mentorComment != null) {
      return {
        ...entry,
        rating: entry.mentorRating ?? 0,
        comment: entry.mentorComment ?? "",
        anonymous: false,
      };
    }
    return entry;
  };

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="My Feedback" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            <h2>My Feedback</h2>

            <div className="tabs">
              <button
                className={`tab-button ${
                  activeTab === "received" ? "active" : ""
                }`}
                onClick={() => setActiveTab("received")}
              >
                Received
              </button>
              <button
                className={`tab-button ${
                  activeTab === "awaiting" ? "active" : ""
                }`}
                onClick={() => setActiveTab("awaiting")}
              >
                Awaiting
              </button>
              <button
                className={`tab-button ${
                  activeTab === "submitted" ? "active" : ""
                }`}
                onClick={() => setActiveTab("submitted")}
              >
                Submitted
              </button>
            </div>

            <div className="schedule-list" key={activeTab}>
              {data[activeTab].map((entry, i) => {
                const accent = getCourseColor(entry.subject || entry.section);

                const program = getProgramFromCode(
                  entry.subject,
                  normalizeCourseKey
                );
                const yrNum = getYearFromSectionDigit(entry.section);
                const chipLabel = `${
                  yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"
                } — ${program}`;

                return (
                  <div
                    className="feedback-card is-colored"
                    key={entry.id || i}
                    style={{ "--accent": accent }}
                  >
                    {/* Program/year chip */}
                    <div className="year-chip" aria-hidden="true">
                      {chipLabel}
                    </div>

                    <div className="schedule-info">
                      <p className="date">{entry.date}</p>
                      <p className="subject">
                        {entry.subject} - {entry.section}
                      </p>
                      <p className="mentor">{entry.mentor}</p>

                      <div className="bottom-row">
                        <div className="topic">Topic: {entry.topic}</div>

                        {activeTab === "awaiting" ? (
                          <button
                            className="join-btn"
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowFeedbackModal(true);
                            }}
                          >
                            {drafts[entry.id] ? "Continue" : "Give Feedback"}
                          </button>
                        ) : (
                          <button
                            className="fb-view-btn"
                            onClick={() => {
                              const normalized = toModalShape(entry);
                              setSelectedSubmitted({
                                ...normalized,
                                givenBy:
                                  activeTab === "submitted"
                                    ? "You"
                                    : entry.mentor,
                                givenTo:
                                  activeTab === "submitted"
                                    ? entry.mentor
                                    : "You",
                              });
                              setShowViewModal(true);
                            }}
                          >
                            View Feedback
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {data[activeTab].length === 0 && (
                <p className="empty-msg">No {activeTab} feedback sessions.</p>
              )}
            </div>
          </div>
        </main>

        <GiveFeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={(feedbackData) => {
            if (selectedEntry?.id) {
              const entry = {
                notes: feedbackData.notes,
                anonymous: feedbackData.anonymous,
                submittedAt:
                  feedbackData.submittedAt ||
                  new Date().toLocaleDateString() +
                    " at " +
                    new Date().toLocaleTimeString(),
              };
              setDrafts((prev) => ({ ...prev, [selectedEntry.id]: entry }));
            }
          }}
          onSessionComplete={(submittedFeedbackData) => {
            setData((prev) => {
              const session = prev.awaiting.find(
                (s) => s.id === selectedEntry.id
              );
              if (!session) return prev;

              const submittedEntry = {
                ...session,
                comment: submittedFeedbackData.notes,
                anonymous: submittedFeedbackData.anonymous || false,
                submittedAt: submittedFeedbackData.submittedAt,
              };

              return {
                ...prev,
                awaiting: prev.awaiting.filter((s) => s.id !== session.id),
                submitted: [...prev.submitted, submittedEntry],
              };
            });

            setDrafts((prev) => {
              const updated = { ...prev };
              delete updated[selectedEntry.id];
              return updated;
            });

            setShowFeedbackModal(false);
            showToast(
              "✓ Feedback successfully submitted and moved to Submitted tab!"
            );
          }}
          mentorName={selectedEntry?.mentor}
          subject={selectedEntry?.subject}
          section={selectedEntry?.section}
          dateTime={selectedEntry?.date}
          topic={selectedEntry?.topic}
          accentColor={getCourseColor(
            selectedEntry?.subject || selectedEntry?.section
          )}
          sessionId={selectedEntry?.id}
          initialFeedback={selectedEntry ? drafts[selectedEntry.id] : null}
          onFeedbackUpdate={(id, entry) =>
            setDrafts((prev) => ({ ...prev, [id]: entry }))
          }
        />

        <ViewFeedbackModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          feedback={selectedSubmitted}
          viewerRole={"student"}
        />

        {toastMsg && (
          <div className="toast-success" role="status" aria-live="polite">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}