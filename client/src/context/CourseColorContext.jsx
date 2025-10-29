import React, { createContext, useContext, useMemo } from "react";

/* ==== Palettes ==== */
const YEAR_PALETTES = {
  IT: {
    1: "#4587f1ff",
    2: "#1353a2ff",
    3: "#2c27bcff",
    4: "#242670ff",
  },
  BA: {
    1: "#ffb35dff",
    2: "#ff784bff",
    3: "#ff4b0fff",
    4: "#b11616ff",
  },
  GENED: {
    1: "#ddb103ff",
    2: "#a09a1fff",
    3: "#605c0cff",
    4: "#393604ff",
  },
  CAPSTONE: "#009688",
  FALLBACK: "#64748B",
};

/* ==== Helpers ==== */
const lc = (s) => String(s || "").toLowerCase().trim();

/** Accepts codes with suffixes: MO-IT200D1, MO-MKT199R1, etc. */
const extractCode = (raw = "") => {
  const s = String(raw).toUpperCase();
  const m = s.match(
    /\bMO-\s?(IT|BA|MKT|OM|HRM|MGT|SS|ENG|HUM|MATH|PE|NSTP|ENV)\s?\d{3}[A-Z0-9]*\b/
  );
  return m ? m[0].replace(/\s+/g, "") : s.trim();
};

/** If a section like H3102 / A2101 / S1203 appears anywhere in the string,
 *  the first digit after the letter is considered the year.
 *  Returns 1|2|3|4 or null if none found.
 */
const extractSectionYear = (raw = "") => {
  const s = String(raw);
  const m = s.match(/\b[ASH](\d)\d{2,3}\b/i);
  if (!m) return null;
  const yr = Number(m[1]);
  return yr >= 1 && yr <= 4 ? yr : null;
};

const isGenEd = (codeLC) =>
  /\bmo-(ss|eng|hum|math|pe|nstp|env)\d{3}[a-z0-9]*\b/.test(codeLC);
const isIT = (codeLC) => /\bmo-it\d{3}[a-z0-9]*\b/.test(codeLC);
const isBA = (codeLC) => /\bmo-(ba|mkt|om|hrm|mgt)\d{3}[a-z0-9]*\b/.test(codeLC);


/* ==== GEN ED by year (IT curriculum placement) ==== */
const GENED_YEAR1 = new Set([
  "MO-ENG039",
  "MO-MATH034",
  "MO-SS033",
  "MO-SS031",
  "MO-PE011",
  "MO-HUM080",
  "MO-MATH035",
  "MO-ENG040",
  "MO-PE012",
  "MO-NSTP021",
  "MO-HUM034",
  "MO-HUM039",
  "MO-PE013",
  "MO-NSTP022",
]);
const GENED_YEAR2 = new Set([
  "MO-SS036",
  "MO-ENV076",
  "MO-PE014",
  "MO-SS032",
  "MO-SS041",
  "MO-SS086",
]);
const GENED_YEAR3 = new Set([]);
const GENED_YEAR4 = new Set([]);

/* ==== IT by year (no GenEds here) ==== */
const IT_YEAR1 = new Set(["MO-IT100", "MO-IT101", "MO-IT103", "MO-IT108"]);
const IT_YEAR2 = new Set([
  "MO-IT102",
  "MO-IT104",
  "MO-IT105",
  "MO-IT106",
  "MO-IT107",
  "MO-IT109",
  "MO-IT110",
  "MO-IT111",
  "MO-IT112",
  "MO-IT113",
  "MO-IT138",
]);
const IT_YEAR3 = new Set([
  "MO-IT115",
  "MO-IT117",
  "MO-IT161",
  "MO-IT150",
  "MO-IT118",
  "MO-IT124",
  "MO-IT152",
  "MO-IT148",
  "MO-IT147",
  "MO-IT151",
  "MO-IT114",
  "MO-IT149",
  "MO-IT119",
  "MO-IT122",
  "MO-IT163",
  "MO-IT142",
  "MO-IT143",
  "MO-IT162",
  "MO-IT128",
  "MO-IT134",
  "MO-IT129",
  "MO-IT154",
  "MO-IT157",
  "MO-IT158",
  "MO-IT160",
  "MO-IT159",
  "MO-IT155",
  "MO-IT121",
  "MO-IT156",
]);
const IT_YEAR4 = new Set(["MO-IT123", "MO-IT153"]);

/* ==== Capstone / Practicum codes ==== */
const IT_CAPSTONE1 = new Set(["MO-IT200D1"]); // Capstone 1 (always CAPSTONE teal)
const IT_CAPSTONE2 = new Set(["MO-IT200D2"]); // Capstone 2 (always CAPSTONE teal)
const IT_PRACTICUM = new Set(["MO-IT199"]); // Year 4 color (not teal)

/* ==== BA anchors (defaults to 3 if unlisted & not internship) ==== */
const BA_YEAR1 = new Set(["MO-BA100", "MO-BA101", "MO-MGT100"]);
const BA_YEAR2 = new Set([
  "MO-BA102",
  "MO-BA103",
  "MO-BA104",
  "MO-MGT101",
  "MO-BA105",
  "MO-OM100",
  "MO-MGT102",
  "MO-BA107",
  "MO-BA106",
  "MO-HRM100",
  "MO-MGT103",
  "MO-MGT104",
  "MO-MKT100",
]);
// Internship/PEP (BA) → Year-4 color, not teal
const BA_YEAR4 = new Set(["MO-MKT199R1"]);

/* ==== Inference helpers ==== */
const inferYearGenEd = (codeUC) => {
  if (GENED_YEAR1.has(codeUC)) return 1;
  if (GENED_YEAR2.has(codeUC)) return 2;
  if (GENED_YEAR3.has(codeUC)) return 3;
  if (GENED_YEAR4.has(codeUC)) return 4;
  return 1; // default safest bucket
};

const inferYearIT = (codeUC, titleLC) => {
  // Internships/PEP/Practicum → Year 4 (program color)
  if (IT_PRACTICUM.has(codeUC) || /(?:practicum|pep|internship)\b/i.test(titleLC))
    return 4;

  if (IT_YEAR1.has(codeUC)) return 1;
  if (IT_YEAR2.has(codeUC)) return 2;
  if (IT_YEAR3.has(codeUC)) return 3;
  if (IT_YEAR4.has(codeUC)) return 4;

  // Unknown IT → most specializations live in year 3
  return 3;
};

const inferYearBA = (codeUC, titleLC) => {
  if (BA_YEAR4.has(codeUC) || /(?:internship|pep|practicum)\b/i.test(titleLC))
    return 4;
  if (BA_YEAR1.has(codeUC)) return 1;
  if (BA_YEAR2.has(codeUC)) return 2;
  return 3;
};

/* ==== Public API ==== */
function getYearColor(titleOrCode = "") {
  const raw = String(titleOrCode || "");
  const codeUC = extractCode(raw);
  const codeLC = codeUC.toLowerCase();
  const titleLC = lc(raw);
  const sectionYr = extractSectionYear(raw); // H3102 → 3, A2101 → 2, S1101 → 1, etc.

  /* --- 1) Capstones are ALWAYS teal, across programs --- */
  const isCapstone =
    IT_CAPSTONE1.has(codeUC) ||
    IT_CAPSTONE2.has(codeUC) ||
    /\b(it200d1|capstone\s*1|it200d2|capstone\s*2)\b/i.test(titleLC);
  if (isCapstone) return YEAR_PALETTES.CAPSTONE;

  /* --- 2) GenEd → year from section if present, else from IT curriculum buckets --- */
  if (isGenEd(codeLC)) {
    const yr = sectionYr ?? inferYearGenEd(codeUC);
    return YEAR_PALETTES.GENED[yr] || YEAR_PALETTES.FALLBACK;
  }

  /* --- 3) IT → internship Year-4 (program color), else year from section if present, else tables --- */
  if (isIT(codeLC)) {
    if (IT_PRACTICUM.has(codeUC) || /(?:practicum|pep|internship)\b/i.test(titleLC)) {
      return YEAR_PALETTES.IT[4];
    }
    const yr = sectionYr ?? inferYearIT(codeUC, titleLC);
    return YEAR_PALETTES.IT[yr] || YEAR_PALETTES.FALLBACK;
  }

  /* --- 4) BA → internship Year-4 (program color), else year from section if present, else tables --- */
  if (isBA(codeLC)) {
    if (BA_YEAR4.has(codeUC) || /(?:internship|pep|practicum)\b/i.test(titleLC)) {
      return YEAR_PALETTES.BA[4];
    }
    const yr = sectionYr ?? inferYearBA(codeUC, titleLC);
    return YEAR_PALETTES.BA[yr] || YEAR_PALETTES.FALLBACK;
  }

  /* --- 5) Unknown → section year if any (use IT palette so it’s readable), else fallback --- */
  if (sectionYr) return YEAR_PALETTES.IT[sectionYr] || YEAR_PALETTES.FALLBACK;
  return YEAR_PALETTES.FALLBACK;
}

const CourseColorContext = createContext({
  getCourseColor: getYearColor,
  getYearColor,
  normalizeCourseKey: extractCode,
  palettes: YEAR_PALETTES,
});

export const useCourseColor = () => useContext(CourseColorContext);

export function CourseColorProvider({ children }) {
  const value = useMemo(
    () => ({
      getCourseColor: getYearColor,
      getYearColor,
      normalizeCourseKey: extractCode,
      palettes: YEAR_PALETTES,
    }),
    []
  );
  return (
    <CourseColorContext.Provider value={value}>
      {children}
    </CourseColorContext.Provider>
  );
}