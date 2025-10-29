export const getCourseColorVars = (map, subject) => {
  const code = (subject || '').split(' ')[0]; // e.g., "MO-IT104"
  const color = map[code];
  if (!color) return {};
  return {
    '--course-color': color,
    '--course-color-weak': `${color}20`, // simple alpha fallback
  };
};