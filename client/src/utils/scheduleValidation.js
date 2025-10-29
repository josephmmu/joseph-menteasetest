/**
 * Returns true if the session time overlaps with any blocked slot
 * @param {Date} sessionDateTime - The proposed session start time
 * @param {Array<{ start: string, end: string }>} blockedSlots - Time ranges in "HH:MM" 24hr format
 * @returns {boolean}
 */
export function isTimeBlocked(sessionDateTime, blockedSlots = []) {
  const sessionHour = sessionDateTime.getHours();
  const sessionMinute = sessionDateTime.getMinutes();
  const sessionTotalMinutes = sessionHour * 60 + sessionMinute;

  return blockedSlots.some(({ start, end }) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    return sessionTotalMinutes >= startMins && sessionTotalMinutes < endMins;
  });
}

/**
 * Returns true if the session date falls on an unavailable date (e.g., mentor declared OOO)
 * @param {Date} sessionDateTime
 * @param {Array<string>} unavailableDates - ISO date strings (e.g., "2025-09-30")
 */
export function isDateUnavailable(sessionDateTime, unavailableDates = []) {
  const dateStr = sessionDateTime.toISOString().slice(0, 10);
  return unavailableDates.includes(dateStr);
}
