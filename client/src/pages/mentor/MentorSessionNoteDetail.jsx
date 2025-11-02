import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import MobileNav from "../../components/MobileNav";
import "../student/SessionNotes.css"; // Reuse existing CSS
import "../student/SessionNoteDetail.css"; // Reuse existing CSS

// --- mock API (swap with real endpoints) ---
const mockFetchMentorNote = async (id) => {
  const seed = {
    "it115-s3103-2025-07-28-2046": {
      id,
      subject: "MO-IT115 Object-Oriented Analysis and Design",
      section: "S3103",
      students: ["John Dela Cruz"],
      dateTime: "July 28, 2025 - 8:46 PM",
      duration: "45 minutes",
      sessionType: "Individual",
      topicOfConcern: "Sequence Diagrams & Actor Interactions",
      topics: [
        "08:46 — Session started with review of previous homework.",
        "- Student submitted sequence diagram for booking system but had inconsistent actor lifelines.",
        "- Clarified the difference between lifeline vs. activation bar duration.",
        "- Walked through 'Book mentoring slot' sequence with proper stereotypes:",
        "  Actors: Student",
        "  Boundary: Web UI",
        "  Control: BookingSvc",
        "  Entity: Session",
        "",
        "Key learning moments:",
        "- Student initially confused about when to show activation bars.",
        '- Breakthrough when explaining that activation = "object is processing".',
        "- Successfully redrew diagram with proper message sequencing.",
        "",
        "Areas for improvement:",
        "- Message naming could be more specific (e.g., reserveSlot() vs process()).",
        "- Need practice with alternative flows and guard conditions.",
        "",
        "Student engagement: Excellent - asked thoughtful questions and took detailed notes.",
      ].join("\n"),
      nextSteps: [
        "For Student (Due: Friday 5 PM):",
        "- Draft complete sequence diagram for book/cancel/reschedule flows.",
        "- Add 'alt slot taken' branch with guard condition [slotLocked].",
        "- Rename generic process() messages to be more descriptive.",
        "- Include assumptions in notes section of diagram.",
        "",
        "For Mentor (Next Session Prep):",
        "- Upload rubric PDF and sample diagrams to shared drive.",
        "- Review student's GitHub PR with focus on message naming.",
        "- Prepare examples of complex alternative flows.",
        "",
        "Next Session Plan (Monday 8:30 PM):",
        "- Review completed homework together.",
        "- Introduce state machine diagrams if time permits.",
        "- Address any questions from async work.",
        "",
        "Assessment Notes:",
        "- Student shows strong analytical thinking.",
        "- Grasps concepts quickly once visual examples are provided.",
        "- Participation grade: A- (excellent engagement, minor notation issues).",
      ].join("\n"),
      studentNotes:
        "Student mentioned they found the visual approach very helpful. Expressed interest in learning more about UML best practices.",
      followUpActions: [
        "Send additional UML resources via email",
        "Schedule optional office hours for diagram review",
        "Update student progress in gradebook",
      ],
      lastEditedBy: "Mr. Nestor Villanueva",
      lastEditedAt: "July 28, 2025 - 9:18 PM",
    },
    "it161-a3103-2025-07-30-1530": {
      id,
      subject: "MO-IT161 Web Systems and Technology",
      section: "A3103",
      students: ["Maria Santos", "Isabella Garcia"],
      dateTime: "July 30, 2025 - 3:30 PM",
      duration: "60 minutes",
      sessionType: "Group",
      topicOfConcern: "Responsive Layouts (Flexbox & CSS Grid)",
      topics: [
        "15:30 — Started with layout audit of students' landing pages.",
        "- Maria's implementation uses flexbox for header, CSS Grid for cards.",
        "- Isabella's approach shows good understanding of responsive principles.",
        "- Both layouts break at 1024px breakpoint - cards stack awkwardly.",
        "- Explained mobile-first responsive design principles to the group.",
        "",
        "Technical deep dive:",
        "- Demonstrated proper breakpoint usage: 640px / 768px / 1024px / 1280px.",
        "- Showed how to replace margin hacks with CSS gap property.",
        "- Discussed avoiding nested negative margins that cause overflow.",
        "",
        "Hands-on group practice:",
        "- Students worked together converting card layouts to CSS Grid.",
        "- Implemented responsive typography using clamp().",
        "- Added proper focus states and accessibility considerations.",
        "",
        "Student insights:",
        "- Both are quick learners, grasped mobile-first concept immediately.",
        "- Good eye for design details and user experience.",
        "- Asked excellent questions about performance implications.",
      ].join("\n"),
      nextSteps: [
        "For Student (Due: Tuesday EOD):",
        "- Convert remaining landing page sections to CSS Grid.",
        "- Replace all .card margins with parent gap properties.",
        "- Test layout at all breakpoints: 375px / 768px / 1024px / 1280px.",
        "- Ensure no horizontal scrollbars at any width.",
        "",
        "For Mentor (Code Review):",
        "- Review student's GitHub PR focusing on:",
        "  - Source order and logical document flow",
        "  - Focus ring visibility and keyboard navigation",
        "  - Responsive image handling",
        "",
        "Next Session Topics:",
        "- CSS Grid advanced features (subgrid, named areas)",
        "- CSS custom properties for theming",
        "- Performance optimization techniques",
        "",
        "Assessment Notes:",
        "- Excellent problem-solving approach",
        "- Strong foundation in CSS fundamentals",
        "- Ready for more advanced responsive concepts",
      ].join("\n"),
      studentNotes:
        "Student mentioned they struggle with CSS specificity sometimes. Interested in learning CSS-in-JS approaches.",
      followUpActions: [
        "Share CSS specificity calculator tool",
        "Provide React styled-components examples",
        "Update portfolio project requirements",
      ],
      lastEditedBy: "Mr. Bryan Reyes",
      lastEditedAt: "July 30, 2025 - 4:05 PM",
    },
    "it104-a2101-2025-08-05-1300": {
      id,
      subject: "MO-IT104 Computer Networks",
      section: "A2101",
      students: ["Carlos Rodriguez"],
      dateTime: "August 5, 2025 - 1:00 PM",
      duration: "50 minutes",
      sessionType: "Individual",
      topicOfConcern: "IPv4 Addressing & Subnetting",
      topics: [
        "13:00 — Started with review of previous subnetting homework.",
        "- Student had trouble with CIDR notation calculations.",
        "- Went through /24, /25, /26 subnet examples step by step.",
        "- Explained the relationship between subnet mask and available hosts.",
        "",
        "Hands-on practice:",
        "- Used subnet calculator to verify manual calculations.",
        "- Worked through real-world scenarios: office building network design.",
        "- Student successfully subneted 192.168.1.0/24 into 8 subnets.",
        "",
        "Key breakthroughs:",
        "- Finally understood why we subtract 2 from host count (network + broadcast).",
        "- Grasped the concept of borrowing bits from host portion.",
        "- Successfully calculated valid host ranges for each subnet.",
        "",
        "Areas needing improvement:",
        "- Still struggles with Variable Length Subnet Masking (VLSM).",
        "- Needs more practice with binary-to-decimal conversion.",
        "- Should memorize common subnet mask values.",
      ].join("\n"),
      nextSteps: [
        "For Student (Due: Friday 3 PM):",
        "- Complete VLSM exercises from Chapter 9.",
        "- Practice subnetting 172.16.0.0/16 network for 50 departments.",
        "- Memorize subnet masks: /24, /25, /26, /27, /28, /29, /30.",
        "- Review broadcast domain vs collision domain concepts.",
        "",
        "For Mentor (Next Session Prep):",
        "- Prepare VLSM visual diagrams and examples.",
        "- Create practice scenarios with different department sizes.",
        "- Review student's homework submission for common errors.",
        "",
        "Next Session Plan:",
        "- VLSM practical applications and optimization.",
        "- Introduction to routing protocols (RIP, OSPF basics).",
        "- Network troubleshooting methodology.",
      ].join("\n"),
      lastEditedBy: "Mr. Robert Chen",
      lastEditedAt: "August 5, 2025 - 1:55 PM",
    },
    "it105-h2102-2025-08-08-1000": {
      id,
      subject: "MO-IT105 Human-Computer Interaction",
      section: "H2102",
      students: ["Anna Villanueva", "Sofia Chen", "James Wilson"],
      dateTime: "August 8, 2025 - 10:00 AM",
      duration: "55 minutes",
      sessionType: "Group",
      topicOfConcern: "Usability Testing & User Feedback Analysis",
      topics: [
        "10:00 — Reviewed students' usability testing plans for e-commerce website.",
        "- Anna presented well-structured test scenarios but missing accessibility considerations.",
        "- Sofia's approach shows good understanding of user flow analysis.",
        "- James contributed excellent insights on mobile usability patterns.",
        "- Discussed the importance of diverse user demographics in testing.",
        "- Explained difference between formative vs summative usability testing.",
        "",
        "Practical group session design:",
        "- Collaborated as a team on creating user personas for target demographics.",
        "- Developed task scenarios that reflect real user goals.",
        "- Established success metrics: completion rate, time-on-task, error rate.",
        "",
        "Analysis methodology:",
        "- Walked through qualitative vs quantitative data interpretation.",
        "- Students practiced identifying usability heuristic violations.",
        "- Discussed how to prioritize findings based on severity and frequency.",
        "",
        "Student insights:",
        "- Excellent understanding of user-centered design principles.",
        "- Strong analytical skills for identifying usability issues.",
        "- Good instinct for creating realistic user scenarios.",
      ].join("\n"),
      nextSteps: [
        "For Student (Due: Tuesday 5 PM):",
        "- Conduct usability test with 5 participants using revised protocol.",
        "- Document findings using standard usability report template.",
        "- Create prioritized list of recommendations with effort estimates.",
        "- Include accessibility compliance checklist in evaluation.",
        "",
        "For Mentor (Review Session):",
        "- Review recorded usability sessions if student provides them.",
        "- Evaluate report structure and recommendation quality.",
        "- Prepare feedback on data visualization and presentation.",
        "",
        "Next Session Focus:",
        "- Review usability test results and analysis quality.",
        "- Discuss advanced testing methods (A/B testing, eye tracking).",
        "- Introduction to accessibility testing tools and techniques.",
      ].join("\n"),
      lastEditedBy: "Dr. Sarah Martinez",
      lastEditedAt: "August 8, 2025 - 11:10 AM",
    },
    "it117-h3103-2025-08-10-1600": {
      id,
      subject: "MO-IT117 Data Visualization Techniques",
      section: "H3103",
      students: ["Miguel Torres"],
      dateTime: "August 10, 2025 - 4:00 PM",
      duration: "70 minutes",
      sessionType: "Individual",
      topicOfConcern: "Interactive Dashboard Design & D3.js Implementation",
      topics: [
        "16:00 — Reviewed student's dashboard mockups and data requirements.",
        "- Excellent visual hierarchy and color scheme selection.",
        "- Discussed the importance of progressive disclosure in complex dashboards.",
        "- Analyzed successful dashboard examples from Tableau and Power BI.",
        "",
        "Technical implementation:",
        "- Guided student through D3.js data binding and enter/update/exit pattern.",
        "- Built interactive bar chart with smooth transitions and hover effects.",
        "- Implemented responsive SVG scaling for different screen sizes.",
        "- Added tooltip functionality with formatted data display.",
        "",
        "Advanced features:",
        "- Student successfully created linked brushing between multiple charts.",
        "- Implemented data filtering with real-time chart updates.",
        "- Added export functionality for both PNG and SVG formats.",
        "",
        "Performance considerations:",
        "- Discussed data aggregation strategies for large datasets.",
        "- Optimized rendering for 10,000+ data points using canvas fallback.",
        "- Student learned about virtual scrolling for large data tables.",
      ].join("\n"),
      nextSteps: [
        "For Student (Due: Friday EOD):",
        "- Complete the multi-chart dashboard with 4 visualization types.",
        "- Implement cross-filtering between all charts in the dashboard.",
        "- Add data export functionality (CSV, JSON, PDF report).",
        "- Create user guide documentation with interaction examples.",
        "",
        "For Mentor (Code Review):",
        "- Review D3.js code structure and performance optimizations.",
        "- Evaluate accessibility features (keyboard navigation, screen reader support).",
        "- Check responsive design implementation across devices.",
        "",
        "Next Session Topics:",
        "- Advanced D3.js animations and micro-interactions.",
        "- Integration with React.js for component-based architecture.",
        "- Real-time data streaming and live dashboard updates.",
      ].join("\n"),
      lastEditedBy: "Prof. David Kim",
      lastEditedAt: "August 10, 2025 - 5:15 PM",
    },
  };
  await new Promise((r) => setTimeout(r, 250));
  return seed[id] || null;
};

const formatDateTime = (date) =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const mockSaveMentorNote = async (payload) => {
  await new Promise((r) => setTimeout(r, 450));
  const now = formatDateTime(new Date());
  return { lastEditedBy: payload.editorName || "You", lastEditedAt: now };
};

// -------------------------------------------

export default function MentorSessionNoteDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "all";
  const backHref = `/mentor/session-notes${
    filter && filter !== "all" ? `?filter=${encodeURIComponent(filter)}` : ""
  }`;

  // Helper function to format students display for session note detail context
  const formatStudentDisplay = (students) => {
    if (!students || students.length === 0) return "No students";
    return students.join(", ");
  };

  // Helper function to get the correct label (Student vs Students)
  const getStudentLabel = (students) => {
    return students && students.length === 1 ? "Student" : "Students";
  };

  // responsive
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1920
  );
  const isMobile = windowWidth <= 1152;
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);

  // editable fields (local only)
  const [topics, setTopics] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  // edit mode + dirty state
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // status badge: idle | saving | saved | error
  const [status, setStatus] = useState("idle");
  const editorName = useMemo(() => "You", []);

  // load
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const data = await mockFetchMentorNote(id);
      if (!alive) return;
      setNote(data);
      if (data) {
        setTopics(data.topics || "");
        setNextSteps(data.nextSteps || "");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // warn if closing tab with unsaved edits
  useEffect(() => {
    const handler = (e) => {
      if (isEditing && isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditing, isDirty]);

  // actions
  const startEdit = () => {
    setIsEditing(true);
    setIsDirty(false);
    setStatus("idle");
  };

  const cancelEdit = () => {
    if (note) {
      // revert local edits back to server copy
      setTopics(note.topics || "");
      setNextSteps(note.nextSteps || "");
    }
    setIsEditing(false);
    setIsDirty(false);
    setStatus("idle");
  };

  const saveAndClose = async () => {
    if (!note) return;
    setStatus("saving");
    try {
      const res = await mockSaveMentorNote({
        id: note.id,
        topics: topics,
        nextSteps,
        editorName,
      });
      // update server copy in state
      setNote((prev) =>
        prev
          ? {
              ...prev,
              ...res,
              topics: topics,
              nextSteps,
            }
          : prev
      );
      setIsEditing(false);
      setIsDirty(false);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } catch {
      setStatus("error");
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}
        <div className="main-layout">
          {!isMobile && <Sidebar activePage="Session Notes" />}
          <main className="dashboard-main scrollable-content">
            <div className="section loading">
              <p>Loading session note…</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="page-wrapper">
        <Header isMobile={isMobile} />
        {isMobile && <MobileNav />}
        <div className="main-layout">
          {!isMobile && <Sidebar activePage="Session Notes" />}
          <main className="dashboard-main scrollable-content">
            <div className="section">
              <Link className="back-link back-link--plain" to={backHref}>
                Back to Session Notes
              </Link>
              <h2>Session Note Not Found</h2>
              <p>
                The session note you're looking for doesn't exist or was
                removed.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <Header isMobile={isMobile} />
      {isMobile && <MobileNav />}

      <div className="main-layout">
        {!isMobile && <Sidebar activePage="Session Notes" />}

        <main className="dashboard-main scrollable-content">
          <div className="section">
            {/* Header row (outline pill link) */}
            <div className="detail-header">
              <Link className="back-link" to={backHref}>
                Back to Session Notes
              </Link>
            </div>

            {/* Meta + actions (top-right) */}
            <div className="note-meta-header">
              <div className="note-compact-meta">
                <div className="note-title-row">
                  <div className="note-title">
                    {note.subject} - {note.section}
                  </div>
                  <div className={`autosave-status ${status}`}>
                    {status === "saving" && "Saving…"}
                    {status === "saved" && "Saved"}
                    {status === "error" && "Save failed"}
                  </div>
                </div>
                <div className="note-meta-muted">
                  {getStudentLabel(note.students)}:{" "}
                  {formatStudentDisplay(note.students)}
                </div>
                <div className="note-meta-muted">
                  {note.dateTime} • {note.duration} • {note.sessionType}
                </div>
                <div className="note-meta-muted">
                  Topic: {note.topicOfConcern}
                </div>
              </div>

              {/* right column: buttons only */}
              <div className="note-meta-actions">
                <div className="note-actions-row">
                  {!isEditing ? (
                    <button className="btn-secondary" onClick={startEdit}>
                      Edit
                    </button>
                  ) : (
                    <>
                      <button className="btn-secondary" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button
                        className="btn-primary"
                        onClick={saveAndClose}
                        disabled={!isDirty || status === "saving"}
                        title={!isDirty ? "No changes to save" : undefined}
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="note-divider" />

            {/* Body (wrapped for print targeting) */}
            <div id="print-area" className="note-scroll">
              <section className="note-block">
                <h3>Topics Discussed</h3>
                <textarea
                  className="note-textarea"
                  value={topics}
                  readOnly={!isEditing}
                  onChange={(e) => {
                    setTopics(e.target.value);
                    if (!isDirty) setIsDirty(true);
                  }}
                  placeholder="Type key points, decisions, blockers…"
                  rows={12}
                />
                {/* print-only mirror */}
                <pre className="print-only print-pre">{topics}</pre>
              </section>

              <section className="note-block">
                <h3>Next Steps</h3>
                <textarea
                  className="note-textarea"
                  value={nextSteps}
                  readOnly={!isEditing}
                  onChange={(e) => {
                    setNextSteps(e.target.value);
                    if (!isDirty) setIsDirty(true);
                  }}
                  placeholder="List action items with owners and due dates…"
                  rows={10}
                />
                {/* print-only mirror */}
                <pre className="print-only print-pre">{nextSteps}</pre>
              </section>

              {/* Footer row: edited (left) + print button (right) */}
              <div className="note-footer">
                <div className="note-edited">
                  Last edited by {note.lastEditedBy} • {note.lastEditedAt}
                </div>
                <div className="note-actions-row">
                  <button
                    className="btn-secondary"
                    onClick={() => window.print()}
                  >
                    Print / Save PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
