// QuickInfoModalSeedData.js
export const UpcomingSessionsSeed = {
  type: "upcoming",
  title: "Upcoming Sessions",
  summary: { totalUpcoming: 12, nextWithin7Days: 5 },
  items: [
    { id: "u1", date: "September 10, 2025 - 10:00 AM", subject: "MO-SS031 Understanding the Self", section: "A2101", mentor: "Ms. Clara Villanueva", topic: "Self-Concept", meetLink: "#" },
    { id: "u2", date: "September 11, 2025 - 2:30 PM", subject: "MO-IT105 Human-Computer Interaction", section: "H2102", mentor: "Ms. Arlene De Guzman", topic: "User-Centered Design", meetLink: "#" },
    { id: "u3", date: "September 12, 2025 - 9:00 AM",  subject: "MO-IT161 Web Systems and Technology", section: "A3103", mentor: "Mr. Bryan Reyes", topic: "Responsive Layouts", meetLink: "#" },
    { id: "u4", date: "September 14, 2025 - 3:00 PM",  subject: "MO-ENG039 Language & Communication", section: "H1101", mentor: "Ms. Aileen Cruz", topic: "Speech Delivery", meetLink: "#" },
    { id: "u5", date: "September 15, 2025 - 4:45 PM",  subject: "MO-SS036 Science, Tech, & Society", section: "H2101", mentor: "Mr. Victor Ramos", topic: "STS & Ethics", meetLink: "#" }
  ]
};

export const CompletedSessionsSeed = {
  type: "completed",
  title: "Completed Sessions",
  summary: { totalCompleted: 45, completedThisMonth: 9, avgPerWeek: 6 },
  items: [
    { id: "c1", date: "August 28, 2025 - 3:30 PM", subject: "MO-IT161 Web Systems and Technology", section: "A3103", mentor: "Mr. Bryan Reyes", topic: "Grid vs Flex", notesLink: "#", feedbackSubmitted: true },
    { id: "c2", date: "August 26, 2025 - 10:00 AM", subject: "MO-SS031 Understanding the Self", section: "A2101", mentor: "Ms. Clara Villanueva", topic: "Johari Window", notesLink: "#", feedbackSubmitted: true },
    { id: "c3", date: "August 25, 2025 - 1:30 PM",  subject: "MO-IT105 HCI", section: "H2102", mentor: "Ms. Arlene De Guzman", topic: "Heuristic Eval", notesLink: "#", feedbackSubmitted: false },
    { id: "c4", date: "August 20, 2025 - 2:00 PM",  subject: "MO-ENG039 Language & Communication", section: "H1101", mentor: "Ms. Aileen Cruz", topic: "Writing Outline", notesLink: "#", feedbackSubmitted: true }
  ]
};

export const FeedbackSubmissionSeed = {
  type: "feedback",
  title: "Feedback Submission Rate",
  gauge: { value: 38, maxValue: 45 },
  summary: { ratePct: Math.round(38 / 45 * 100), missingCount: 7 },
  missing: [
    { id: "f1", date: "August 25, 2025 - 1:30 PM", subject: "MO-IT105 HCI", section: "H2102", mentor: "Ms. Arlene De Guzman", student: "Rei E. Cristobal" },
    { id: "f2", date: "August 19, 2025 - 10:00 AM", subject: "MO-IT115 OOAD", section: "S3103", mentor: "Mr. Nestor Villanueva", student: "Aldrich R. Rondina" },
    { id: "f3", date: "August 18, 2025 - 4:00 PM", subject: "MO-IT161 WebSysTech", section: "A3103", mentor: "Mr. Bryan Reyes", student: "Jodienne A. Esperas" }
  ],
  bySubject: [
    { subject: "MO-IT105 HCI", submitted: 12, total: 14 },
    { subject: "MO-IT161 WebSysTech", submitted: 9,  total: 11 },
    { subject: "MO-ENG039 Lang & Comm", submitted: 8,  total: 9 },
    { subject: "MO-SS031 Understanding the Self", submitted: 9, total: 11 }
  ]
};
