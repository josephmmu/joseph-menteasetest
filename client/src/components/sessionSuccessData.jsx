// Data + helpers for "Session Success Tracker"
// Success = sessions with BOTH notes AND feedback submitted

export const sessionSuccessPalette = {
  both: "#22c55e",     // green
  notesOnly: "#f59e0b",// orange
  feedbackOnly: "#3b82f6", // blue
  none: "#cbd5e1"      // gray
};

export const sessionSuccessData = {
  totals: {
    totalSessions: 120,
    withNotesAndFeedback: 72, // 60%
    notesOnly: 24,            // 20%
    feedbackOnly: 12,         // 10%
    noSubmission: 12          // 10%
  },
  weekly: [
    { label: "Wk 1", total: 12, both: 6, notesOnly: 3, feedbackOnly: 2, none: 1 },
    { label: "Wk 2", total: 14, both: 8, notesOnly: 2, feedbackOnly: 2, none: 2 },
    { label: "Wk 3", total: 13, both: 7, notesOnly: 3, feedbackOnly: 1, none: 2 },
    { label: "Wk 4", total: 15, both: 9, notesOnly: 3, feedbackOnly: 1, none: 2 },
    { label: "Wk 5", total: 16, both: 10, notesOnly: 3, feedbackOnly: 1, none: 2 },
    { label: "Wk 6", total: 17, both: 9, notesOnly: 5, feedbackOnly: 1, none: 2 },
    { label: "Wk 7", total: 18, both: 11, notesOnly: 3, feedbackOnly: 2, none: 2 },
    { label: "Wk 8", total: 15, both: 12, notesOnly: 2, feedbackOnly: 2, none: 1 }
  ]
};

// Converts totals -> MultiDonut data (percentages)
export function buildMultiDonutSegments({ totals }, palette = sessionSuccessPalette) {
  const total = Math.max(1, totals.totalSessions);
  const pct = (n) => Math.round((n / total) * 100);

  return [
    { name: "Notes + Feedback", percentage: pct(totals.withNotesAndFeedback), color: palette.both },
    { name: "Notes Only",       percentage: pct(totals.notesOnly),            color: palette.notesOnly },
    { name: "Feedback Only",    percentage: pct(totals.feedbackOnly),         color: palette.feedbackOnly },
    { name: "No Submission",    percentage: pct(totals.noSubmission),         color: palette.none }
  ];
}

export function getSuccessRate({ totals }) {
  const total = Math.max(1, totals.totalSessions);
  return Math.round((totals.withNotesAndFeedback / total) * 100);
}
