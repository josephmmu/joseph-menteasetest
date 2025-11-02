// utils/leadTime.js
export const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

export function has24hLead(ts) {
  return Number.isFinite(ts) && ts - Date.now() >= MIN_LEAD_MS;
}

export function coerceStartTs(session) {
  // Accept normalized sessions (with _startTs) or raw (with startISO/scheduleStart)
  if (typeof session?._startTs === "number") return session._startTs;
  const iso = session?.startISO || session?.scheduleStart;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}