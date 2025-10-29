// Detect program (IT, BA, GE, etc.) from subject code
export const getProgramFromCode = (subject = '', normalizeCourseKey) => {
  const code = normalizeCourseKey ? normalizeCourseKey(subject) : String(subject).toUpperCase();
  const m = code.match(/^MO-(IT|BA|MKT|OM|HRM|MGT|SS|ENG|HUM|MATH|PE|NSTP|ENV)/i);
  if (!m) return 'Unknown';
  const head = m[1].toUpperCase();
  if (head === 'IT') return 'IT';
  if (['BA', 'MKT', 'OM', 'HRM', 'MGT'].includes(head)) return 'BA';
  if (['SS', 'ENG', 'HUM', 'MATH', 'PE', 'NSTP', 'ENV'].includes(head)) return 'GE';
  return 'Unknown';
};

// Extract year from section code (e.g. A2101 → 2)
export const getYearFromSectionDigit = (section = '') => {
  const m = String(section).trim().match(/^[A-Z](\d)/i);
  return m ? Number(m[1]) : null;
};

// Convert number → ordinal string
export const ordinal = (n) =>
  n === 1 ? '1st' :
  n === 2 ? '2nd' :
  n === 3 ? '3rd' :
  n ? `${n}th` : 'N/A';