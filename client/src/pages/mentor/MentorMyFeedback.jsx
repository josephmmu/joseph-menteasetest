import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import ViewFeedbackModal from "../../components/ViewFeedbackModal";
import GroupGiveFeedbackModal from "../../components/GroupGiveFeedbackModal";
import MentorGiveFeedbackModal from "../../components/MentorGiveFeedbackModal";
import "../student/MyFeedback.css";
import { useCourseColor } from "../../context/CourseColorContext";
import {
  getProgramFromCode,
  getYearFromSectionDigit,
  ordinal,
} from "../../utils/programYear";

export default function MentorMyFeedback() {
  const [activeTab, setActiveTab] = useState("received");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showGroupFeedbackModal, setShowGroupFeedbackModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSingleFeedbackModal, setShowSingleFeedbackModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  // Store in-progress feedback by session ID - this persists when modal is closed and reopened
  const [persistentFeedback, setPersistentFeedback] = useState({}); // For group sessions
  const [singleStudentFeedback, setSingleStudentFeedback] = useState({}); // For single student sessions - persists when modal closes
  const { getCourseColor } = useCourseColor();
  const toastTimer = useRef(null);
  const isMobile = windowWidth <= 1152;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Toast functionality
  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastMsg("");
      toastTimer.current = null;
    }, 3000);
  };

  // Helper function to format student display (like in My Schedule and Session Notes)
  const formatStudentDisplay = (students, isSchedulePage = false) => {
    if (!students || students.length === 0) return "No students";

    // Extract names from student objects
    const studentNames = students.map((student) => student.name || student);

    if (studentNames.length === 1) {
      return `Student: ${studentNames[0]}`;
    }

    if (isSchedulePage) {
      // For feedback page: show all student names
      return `Students: ${studentNames.join(", ")}`;
    } else {
      // For Dashboard: show first student + count
      return `Students: ${studentNames[0]}, ${studentNames.length - 1}+`;
    }
  };

  // Feedback data that matches actual sessions from My Schedule and Session Notes
  // - Received: Feedback from students after completed sessions (from session notes)
  // - Awaiting: Recent/upcoming sessions that need mentor feedback (from my schedule)
  // - Submitted: Mentor feedback given to students after past sessions
  const [feedbackData, setFeedbackData] = useState({
    received: [
      {
        id: 1,
        date: "Octo 30, 2025 - 3:30 PM",
        subject: "MO-IT161 Web Systems and Technology",
        section: "A3103",
        student: "Maria Santos",
        topic: "Responsive Layouts (Flexbox & CSS Grid)",
        comment:
          "Great mentoring session! The explanation of flexbox and CSS grid was very clear and the hands-on examples really helped solidify my understanding. Thank you for the extra practice exercises!",
        anonymous: false,
        submittedAt: "July 30, 2025 at 4:15 PM",
      },
      {
        id: 2,
        date: "August 5, 2025 - 1:00 PM",
        subject: "MO-IT104 Computer Networks",
        section: "A2101",
        student: "Carlos Rodriguez",
        topic: "IPv4 Addressing & Subnetting",
        comment:
          "The session was helpful, especially the CIDR notation examples. I feel more confident about subnetting now. The step-by-step approach made complex concepts easier to understand.",
        anonymous: false,
        submittedAt: "August 5, 2025 at 1:45 PM",
      },
      {
        id: 3,
        date: "August 8, 2025 - 10:00 AM",
        subject: "MO-IT105 Human-Computer Interaction",
        section: "H2102",
        student: "Sofia Chen",
        topic: "Usability Testing & User Feedback Analysis",
        comment:
          "Excellent session on usability testing methods. The real-world examples and user persona exercises were particularly valuable for my project.",
        anonymous: false,
        submittedAt: "August 8, 2025 at 10:50 AM",
      },
      {
        id: 12,
        date: "August 10, 2025 - 4:00 PM", // From session notes
        subject: "MO-IT117 Data Visualization Techniques",
        section: "H3103",
        student: "Miguel Torres",
        topic: "Advanced Chart Types & Interactive Dashboards",
        comment:
          "Amazing mentoring session! The D3.js tutorial was incredibly detailed and the interactive dashboard examples really helped me understand the concepts. Thank you for the extra time to work through the complex visualizations!",
        anonymous: false,
        submittedAt: "August 10, 2025 at 5:10 PM",
      },
      {
        id: 14,
        date: "August 8, 2025 - 10:00 AM", // From session notes - anonymous from group session
        subject: "MO-IT105 Human-Computer Interaction",
        section: "H2102",
        student: "Anonymous", // One of the students from the group session chose to be anonymous
        topic: "Usability Testing & User Feedback Analysis",
        comment:
          "The session provided good insights into usability testing. The group discussion was helpful and the mentor's guidance on user feedback analysis was clear and practical.",
        anonymous: true,
        submittedAt: "August 8, 2025 at 11:15 AM",
      },
    ],
    awaiting: [
      {
        id: 4,
        date: "September 12, 2025 - 6:00 PM", // Today evening - From updated upcoming sessions
        subject: "MO-IT104 Computer Networks",
        section: "A2101",
        topic: "Network Security Fundamentals",
        students: [{ id: 1, name: "Sofia Chen", needsFeedback: true }],
      },
      {
        id: 5,
        date: "September 13, 2025 - 9:00 AM", // Tomorrow morning - From updated upcoming sessions
        subject: "MO-IT105 Human-Computer Interaction",
        section: "H2102",
        topic: "Mobile UI/UX Best Practices",
        students: [
          { id: 2, name: "James Wilson", needsFeedback: true },
          { id: 3, name: "Kevin Martinez", needsFeedback: true },
        ],
      },
      {
        id: 6,
        date: "September 13, 2025 - 1:30 PM", // Tomorrow afternoon - From updated upcoming sessions
        subject: "MO-IT161 Web Systems and Technology",
        section: "A3103",
        topic: "API Integration & RESTful Services",
        students: [{ id: 4, name: "Isabella Garcia", needsFeedback: true }],
      },
      {
        id: 10,
        date: "September 15, 2025 - 10:00 AM", // 3 days from now - From updated upcoming sessions (group session)
        subject: "MO-IT104 Computer Networks",
        section: "A2101",
        topic: "OSI Layers Overview",
        students: [
          { id: 5, name: "John Dela Cruz", needsFeedback: true },
          { id: 6, name: "Maria Santos", needsFeedback: true },
          { id: 7, name: "Carlos Rodriguez", needsFeedback: true },
        ],
      },
    ],
    submitted: [
      {
        id: 7,
        date: "July 28, 2025 - 8:46 PM", // From session notes
        subject: "MO-IT115 Object-Oriented Analysis and Design",
        section: "S3103",
        student: "John Dela Cruz",
        topic: "Sequence Diagrams & Actor Interactions",
        comment:
          "Good improvement in understanding UML sequence diagrams. Focus on consistent actor lifelines in future diagrams. Continue practicing with the provided examples.",
        anonymous: false,
        submittedAt: "July 28, 2025 at 9:30 PM",
      },
      {
        id: 8,
        date: "July 30, 2025 - 3:30 PM", // From session notes - Isabella's feedback
        subject: "MO-IT161 Web Systems and Technology",
        section: "A3103",
        student: "Isabella Garcia",
        topic: "Responsive Layouts (Flexbox & CSS Grid)",
        comment:
          "Excellent participation in the group session. Your questions about grid template areas showed deep thinking. Keep experimenting with different layout techniques.",
        anonymous: false,
        submittedAt: "July 30, 2025 at 4:20 PM",
      },
      {
        id: 9,
        date: "August 8, 2025 - 10:00 AM", // From session notes
        subject: "MO-IT105 Human-Computer Interaction",
        section: "H2102",
        student: "Anna Villanueva",
        topic: "Usability Testing & User Feedback Analysis",
        comment:
          "Outstanding work on user personas development. Your understanding of user-centered design principles is impressive. Consider applying these concepts to your current project.",
        anonymous: false,
        submittedAt: "August 8, 2025 at 11:00 AM",
      },
      {
        id: 11,
        date: "August 8, 2025 - 10:00 AM", // From session notes - James Wilson's feedback
        subject: "MO-IT105 Human-Computer Interaction",
        section: "H2102",
        student: "James Wilson",
        topic: "Usability Testing & User Feedback Analysis",
        comment:
          "Good grasp of usability principles. Your insights during the group discussion were valuable. Work on documenting your testing observations more systematically.",
        anonymous: false,
        submittedAt: "August 8, 2025 at 11:05 AM",
      },
      {
        id: 13,
        date: "August 10, 2025 - 4:00 PM", // From session notes
        subject: "MO-IT117 Data Visualization Techniques",
        section: "H3103",
        student: "Miguel Torres",
        topic: "Advanced Chart Types & Interactive Dashboards",
        comment:
          "Excellent work on the D3.js visualization project! Your understanding of data binding and interactive elements exceeded expectations. The dashboard you created shows real mastery of the concepts we covered.",
        anonymous: false,
        submittedAt: "August 10, 2025 at 5:15 PM",
      },
    ],
  });

  const filteredFeedback = feedbackData[activeTab] || [];

  const handleGroupFeedbackSubmit = (feedbackData) => {
    console.log("Group feedback submitted:", feedbackData);
  };

  const handleSingleFeedbackSubmit = (feedbackData) => {
    console.log("Single feedback submitted:", {
      ...feedbackData,
      studentId: selectedStudent?.student.id,
      studentName: selectedStudent?.student.name,
      sessionId: selectedStudent?.session.id,
    });
  };

  // Handle persistent feedback updates for single student sessions
  const handleSingleFeedbackUpdate = (sessionId, feedbackData) => {
    setSingleStudentFeedback((prev) => ({
      ...prev,
      [sessionId]: feedbackData,
    }));
  };

  const handleSingleFeedbackComplete = (submittedFeedbackData) => {
    if (!selectedStudent) return;

    // Move the session from awaiting to submitted tab
    setFeedbackData((prevData) => {
      const updatedData = { ...prevData };

      // Remove from awaiting feedback
      updatedData.awaiting = updatedData.awaiting.filter(
        (session) => session.id !== selectedStudent.session.id
      );

      // Create submitted entry for the student
      const submittedEntry = {
        id: Date.now() + Math.random(), // Generate unique ID
        date: selectedStudent.session.date,
        subject: selectedStudent.session.subject,
        section: selectedStudent.session.section,
        student: selectedStudent.student.name,
        topic: selectedStudent.session.topic,
        comment: submittedFeedbackData.notes,
        anonymous: false,
        submittedAt: submittedFeedbackData.submittedAt,
      };

      updatedData.submitted.push(submittedEntry);

      return updatedData;
    });

    // Clear persistent feedback for this session since it's completed
    setSingleStudentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[selectedStudent.session.id];
      return updated;
    });

    // Show success toast
    showToast(
      `✓ Feedback successfully submitted for ${selectedStudent.student.name} and moved to Submitted tab!`
    );
  };

  const handleSessionComplete = (completedSession, submittedFeedbackData) => {
    // Move the session from awaiting to submitted tab
    setFeedbackData((prevData) => {
      const updatedData = { ...prevData };

      // Remove from awaiting feedback
      updatedData.awaiting = updatedData.awaiting.filter(
        (session) => session.id !== completedSession.id
      );

      // Create submitted entries for each student that received feedback
      Object.values(submittedFeedbackData).forEach((feedback) => {
        const submittedEntry = {
          id: Date.now() + Math.random(), // Generate unique ID
          date: completedSession.date,
          subject: completedSession.subject,
          section: completedSession.section,
          student: feedback.studentName,
          topic: completedSession.topic,
          comment: feedback.notes,
          anonymous: false,
          submittedAt: feedback.submittedAt,
        };

        updatedData.submitted.push(submittedEntry);
      });

      return updatedData;
    });

    // Clear persistent feedback for this session since it's completed
    setPersistentFeedback((prev) => {
      const updated = { ...prev };
      delete updated[completedSession.id];
      return updated;
    });

    // Show success toast
    const studentCount = Object.keys(submittedFeedbackData).length;
    const studentText = studentCount === 1 ? "student" : "students";
    showToast(
      `✓ Feedback successfully submitted for ${studentCount} ${studentText} and moved to Submitted tab!`
    );
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
              {filteredFeedback.map((feedback) => {
                const accent = getCourseColor(
                  feedback.subject || feedback.section
                );

                // Add year chip calculation
                const program = getProgramFromCode(feedback.subject);
                const yrNum = getYearFromSectionDigit(feedback.section);
                const chipLabel = `${
                  yrNum ? `${ordinal(yrNum)} Year` : "Year N/A"
                } — ${program}`;

                return (
                  <div
                    className="feedback-card is-colored"
                    key={feedback.id}
                    style={{ "--accent": accent }}
                  >
                    {/* Year chip */}
                    <div
                      className="year-chip"
                      style={{ "--chip-bg": accent }}
                      aria-hidden="true"
                    >
                      {chipLabel}
                    </div>

                    <div className="schedule-info">
                      <p className="date">{feedback.date}</p>
                      <p className="subject">
                        {feedback.subject} - {feedback.section}
                      </p>
                      <p className="mentor">
                        {activeTab === "awaiting"
                          ? formatStudentDisplay(feedback.students, true)
                          : formatStudentDisplay(
                              [
                                feedback.anonymous
                                  ? "Anonymous"
                                  : feedback.student,
                              ],
                              true
                            )}
                      </p>

                      <div className="bottom-row">
                        <div className="topic">Topic: {feedback.topic}</div>
                        {activeTab === "awaiting"
                          ? (() => {
                              const studentsNeedingFeedback =
                                feedback.students?.filter(
                                  (s) => s.needsFeedback
                                ) || [];

                              let hasProgress, buttonText;

                              if (studentsNeedingFeedback.length === 1) {
                                // Single student session - check single student feedback
                                hasProgress =
                                  !!singleStudentFeedback[feedback.id];
                                buttonText = hasProgress
                                  ? "Continue"
                                  : "Give Feedback";
                              } else {
                                // Multiple students - check group feedback
                                const sessionFeedback =
                                  persistentFeedback[feedback.id] || {};
                                const completedCount =
                                  Object.keys(sessionFeedback).length;
                                const totalCount =
                                  studentsNeedingFeedback.length;
                                hasProgress = completedCount > 0;
                                buttonText = hasProgress
                                  ? `Continue (${completedCount}/${totalCount})`
                                  : "Give Feedback";
                              }

                              return (
                                <button
                                  className="join-btn"
                                  onClick={() => {
                                    if (studentsNeedingFeedback.length === 1) {
                                      // Single student - use simple modal
                                      setSelectedStudent({
                                        student: studentsNeedingFeedback[0],
                                        session: feedback,
                                      });
                                      setShowSingleFeedbackModal(true);
                                    } else {
                                      // Multiple students - use group modal
                                      setSelectedSession(feedback);
                                      setShowGroupFeedbackModal(true);
                                    }
                                  }}
                                >
                                  {buttonText}
                                </button>
                              );
                            })()
                          : (activeTab === "received" ||
                              activeTab === "submitted") &&
                            feedback.comment && (
                              <button
                                className="join-btn"
                                onClick={() => {
                                  setSelectedFeedback({
                                    ...feedback,
                                    givenBy: activeTab === "received" ? feedback.student : "You",
                                    givenTo: activeTab === "submitted" ? feedback.student : "You",
                                    accentColor: accent,
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

              {filteredFeedback.length === 0 && (
                <p className="empty-msg">No feedback found for this tab.</p>
              )}
            </div>
          </div>
        </main>

        <ViewFeedbackModal
          isOpen={showViewModal}
          onClose={() => setShowViewModal(false)}
          feedback={selectedFeedback}
          viewerRole={"mentor"}
          accentColor={selectedFeedback?.accentColor || "#1d4ed8"}
        />

        <GroupGiveFeedbackModal
          isOpen={showGroupFeedbackModal}
          onClose={() => {
            setShowGroupFeedbackModal(false);
            setSelectedSession(null);
          }}
          onSubmit={handleGroupFeedbackSubmit}
          onSessionComplete={handleSessionComplete}
          onFeedbackUpdate={(sessionId, feedbackData) => {
            setPersistentFeedback((prev) => ({
              ...prev,
              [sessionId]: feedbackData,
            }));
          }}
          session={selectedSession}
          initialFeedback={
            selectedSession?.id
              ? persistentFeedback[selectedSession.id] || {}
              : {}
          }
          topic={selectedSession?.topic}
          accentColor={getCourseColor(selectedSession?.subject || selectedSession?.section) || "#1d4ed8"}
        />

        <MentorGiveFeedbackModal
          isOpen={showSingleFeedbackModal}
          onClose={() => {
            setShowSingleFeedbackModal(false);
            setSelectedStudent(null);
          }}
          onSubmit={handleSingleFeedbackSubmit}
          onSessionComplete={handleSingleFeedbackComplete}
          onFeedbackUpdate={handleSingleFeedbackUpdate}
          sessionId={selectedStudent?.session.id}
          initialFeedback={
            selectedStudent?.session.id
              ? singleStudentFeedback[selectedStudent.session.id] || null
              : null
          }
          studentName={selectedStudent?.student.name}
          subject={selectedStudent?.session.subject}
          section={selectedStudent?.session.section}
          dateTime={selectedStudent?.session.date}
          topic={selectedStudent?.session.topic}
          accentColor={selectedStudent?.accentColor || getCourseColor(selectedStudent?.session.subject || selectedStudent?.session.section) || "#1d4ed8"}
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
