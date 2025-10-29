export const ActivityData = [
  {
  type: 'session',
  label: "Session Activity",
  value: 18,
  maxValue: 30,
  maxPerWeek: 10,                 // capacity (slots) per week
  totalPossible: 10 * 12,         // 12-week term
  weekly: [
    // w = week number; scheduled = booked; completed/cancelled/noShow as recorded
    { w:1, scheduled:7, completed:6, cancelled:1, noShow:0 },
    { w:2, scheduled:8, completed:7, cancelled:0, noShow:1 },
    { w:3, scheduled:8, completed:7, cancelled:1, noShow:0 },
    { w:4, scheduled:6, completed:5, cancelled:1, noShow:0 },
    { w:5, scheduled:7, completed:6, cancelled:1, noShow:0 },
    { w:6, scheduled:7, completed:5, cancelled:1, noShow:1 },
    { w:7, scheduled:8, completed:6, cancelled:2, noShow:0 },
    { w:8, scheduled:8, completed:7, cancelled:1, noShow:0 },
    { w:9, scheduled:6, completed:5, cancelled:1, noShow:0 },
    { w:10, scheduled:7, completed:6, cancelled:0, noShow:1 },
    { w:11, scheduled:7, completed:6, cancelled:1, noShow:0 },
    { w:12, scheduled:8, completed:7, cancelled:1, noShow:0 },
  ],
  totals: {                      // precomputed (optional—you can compute in modal too)
    scheduled: 84,
    completed: 73,
    cancelled: 10,
    noShow: 4,
  },
}
,
{
  type: 'student',
  label: 'Student Activity',
  value: 80,
  maxPerWeek: 120,                // e.g., cohort size this term
  totalPossible: 120 * 12,        // if you treat “possible” as total students * weeks (optional)
  weekly: [
    // active = students with ≥1 session that week
    { w:1, active:85, inactive:35, feedbackSubmitted:60 },
    { w:2, active:88, inactive:32, feedbackSubmitted:61 },
    { w:3, active:90, inactive:30, feedbackSubmitted:64 },
    { w:4, active:82, inactive:38, feedbackSubmitted:58 },
    { w:5, active:87, inactive:33, feedbackSubmitted:60 },
    { w:6, active:80, inactive:40, feedbackSubmitted:55 },
    { w:7, active:92, inactive:28, feedbackSubmitted:66 },
    { w:8, active:94, inactive:26, feedbackSubmitted:68 },
    { w:9, active:78, inactive:42, feedbackSubmitted:52 },
    { w:10, active:86, inactive:34, feedbackSubmitted:59 },
    { w:11, active:89, inactive:31, feedbackSubmitted:63 },
    { w:12, active:93, inactive:27, feedbackSubmitted:69 },
  ],
  totals: {
    active: 1044,                 // sum of weekly active (can also be unique, your call)
    inactive: 396,
    feedbackSubmitted: 735,
  },
}
,
{
  type: 'mentor',
  label: 'Mentor Activity',
  value: 20,
  maxValue: 52,
  maxPerWeek: 20,                 // e.g., max sessions/week across all mentors (for bars)
  totalPossible: 20 * 12,         // optional; set null if you don’t use it
  weekly: [
    // aggregate mentor throughput per week
    { w:1, completed:14, cancelled:2, noShow:1 },
    { w:2, completed:13, cancelled:1, noShow:1 },
    { w:3, completed:12, cancelled:2, noShow:0 },
    { w:4, completed:10, cancelled:1, noShow:0 },
    { w:5, completed:12, cancelled:1, noShow:1 },
    { w:6, completed:11, cancelled:2, noShow:1 },
    { w:7, completed:13, cancelled:2, noShow:0 },
    { w:8, completed:14, cancelled:1, noShow:0 },
    { w:9, completed:10, cancelled:1, noShow:0 },
    { w:10, completed:12, cancelled:0, noShow:1 },
    { w:11, completed:12, cancelled:1, noShow:0 },
    { w:12, completed:13, cancelled:1, noShow:0 },
  ],
  totals: {
    mentors: 12,
    sessions: 146,                // sum of weekly completed (or unique count from raw)
    cancelled: 15,
    noShow: 5,
  },
  perMentor: [
    { mentor: 'Ms. Aileen Cruz',     sessions: 14, cancelled: 1, noShow: 0, avgPerWeek: 1.2 },
    { mentor: 'Mr. Ramon Dela Cruz', sessions: 12, cancelled: 2, noShow: 1, avgPerWeek: 1.0 },
    { mentor: 'Ms. Louise Navarro',  sessions: 13, cancelled: 1, noShow: 0, avgPerWeek: 1.1 },
    { mentor: 'Ms. Angelica Uy',     sessions: 12, cancelled: 1, noShow: 0, avgPerWeek: 1.0 },
    // …add the rest
  ],
}
]


