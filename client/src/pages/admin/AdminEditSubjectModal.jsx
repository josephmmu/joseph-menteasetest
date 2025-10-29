// AdminEditSubjectModal.jsx
import React from "react";
import { useSystemSettings } from "../../context/SystemSettingsContext";
import "./AdminAddCourseInstanceModal.css"; // reuse the same styles

function AdminEditSubjectModal({
  isOpen,
  onClose,
  subject,
  onSave,
  mentorList = [],
}) {
  const { systemSettings } = useSystemSettings() || {};

  // School year label helper aligned with new active term model
  const getSchoolYearLabel = (schoolYearMaybe) => {
    if (typeof schoolYearMaybe === "string" && schoolYearMaybe.includes("-")) {
      return `SY ${schoolYearMaybe}`;
    }
    return systemSettings?.currentAcademicYearLabel || "SY (unknown)";
  };

  // Preserve the course's existing period when editing
  const subjectYear =
    subject?.schoolYear ??
    subject?.displayYear ??
    systemSettings?.currentAcademicYear;
  const subjectTerm =
    subject?.term ?? subject?.displayTerm ?? systemSettings?.currentTerm;

  /* -------------------- COURSE CODE VALIDATION -------------------- */
  const ALLOWED_PROGRAM_TOKENS = [
    "IT", "BA", "MKT", "OM", "HRM", "MGT", // BA family
    "GE", "SS", "ENG", "HUM", "MATH", "PE", "NSTP", "ENV" // GE family
  ];
  const COURSE_CODE_REGEX = new RegExp(
    `^MO-(?:${ALLOWED_PROGRAM_TOKENS.join("|")})\\d{3}[A-Z0-9]*$`
  );

  // Normalize: uppercase, strip spaces, ensure "MO-" dash is present
  const normalizeCourseCode = (v = "") =>
    String(v).toUpperCase().replace(/\s+/g, "").replace(/^MO-?/, "MO-");

  // Extract full MO-XXX999* token (if any) from a free string
  const extractCode = (raw = "") => {
    const s = String(raw).toUpperCase();
    const m = s.match(
      /\bMO-\s?(IT|BA|MKT|OM|HRM|MGT|GE|SS|ENG|HUM|MATH|PE|NSTP|ENV)\s?\d{3}[A-Z0-9]*\b/
    );
    return m ? m[0].replace(/\s+/g, "") : "";
  };

  // Map any code-ish string to broad program "IT" | "BA" | "GE"
  const detectProgramFromString = (raw = "") => {
    const code = extractCode(raw);
    const lc = code.toLowerCase();

    if (/\bmo-it\d{3}[a-z0-9]*\b/.test(lc)) return "IT";
    if (/\bmo-(ba|mkt|om|hrm|mgt)\d{3}[a-z0-9]*\b/.test(lc)) return "BA";
    if (/\bmo-(ge|ss|eng|hum|math|pe|nstp|env)\d{3}[a-z0-9]*\b/.test(lc))
      return "GE";

    // Fallback heuristics
    const s = String(raw || "").toUpperCase();
    if (/\bIT(?:[-\s]?\d{2,4})?\b/.test(s)) return "IT";
    if (/\b(BA|MKT|OM|HRM|MGT)(?:[-\s]?\d{2,4})?\b/.test(s)) return "BA";
    if (
      /\b(GE|SS|ENG|HUM|MATH|PE|NSTP|ENV)(?:[-\s]?\d{2,4})?\b/.test(s) ||
      s.includes("GENERAL EDUCATION") ||
      s.includes("GEN ED") ||
      s.includes("GENED")
    )
      return "GE";

    return "";
  };

  const DAY_OPTIONS = ["MWF", "TTHS"];
  const TIME_PRESETS = {
    A: ["7:00-8:15", "8:15-9:30", "9:30-10:45"],  // AM
    H: ["1:15-2:30", "2:30-3:45", "3:45-5:00"],   // PM
    S: ["6:15-7:30", "7:30-8:45", "8:45-10:00"],  // PM
  };

  const [formData, setFormData] = React.useState({
    courseCode: "",
    courseName: "",
    program: "",
    section: "",
    sectionTimeSlot: "A",
    sectionNumber: "",
    courseYear: "1",
    mentor: "",
    meetingDays: "",
    meetingTime: "",
    customStartTime: "",
    customEndTime: "",
  });

  /* -------------------- TIME HELPERS -------------------- */
  const toMinutes = (t) => {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return h * 60 + m;
  };
  const slotWindows = {
    A: { start: toMinutes("07:00"), end: toMinutes("10:45") },
    H: { start: toMinutes("13:15"), end: toMinutes("17:00") },
    S: { start: toMinutes("18:15"), end: toMinutes("22:00") },
  };
  const isCustomTimeValidForSlot = (slot, start, end) => {
    const s = toMinutes(start);
    const e = toMinutes(end);
    const w = slotWindows[slot];
    if (s == null || e == null || s >= e) return false;
    return s >= w.start && e <= w.end;
  };

  // ✨ helpers to ensure stored value is always 24h HH:mm-HH:mm
  const pad2 = (n) => String(n).padStart(2, "0");
  const normalizeHHMM = (t) => {
    const [h, m] = (t || "").split(":").map((x) => parseInt(x || "0", 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return "";
    return `${pad2(h)}:${pad2(m)}`;
  };
  const to24FromPreset = (range, slot) => {
    const [rs, re] = (range || "").split("-").map((s) => (s || "").trim());
    const parse = (hhmm) => {
      const [hStr, mStr] = (hhmm || "").split(":");
      let h = parseInt(hStr || "0", 10);
      const m = parseInt(mStr || "0", 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return "";
      if (slot === "H" || slot === "S") {
        if (h >= 1 && h <= 11) h += 12; // treat as PM
      }
      return `${pad2(h)}:${pad2(m)}`;
    };
    const s24 = parse(rs);
    const e24 = parse(re);
    if (!s24 || !e24) return range;
    return `${s24}-${e24}`;
  };

  const parseSection = (section) => {
    if (!section || section.length !== 5) {
      return { timeSlot: "A", year: "1", number: "" };
    }
    const timeSlot = section[0];
    const year = section[1];
    const number = section.substring(2);
    return {
      timeSlot: ["A", "H", "S"].includes(timeSlot) ? timeSlot : "A",
      year,
      number,
    };
  };

  const generateSection = (timeSlot, courseYear, number) => {
    if (!timeSlot || !courseYear || !number) return "";
    const yearDigit = String(courseYear).slice(0, 1);
    const paddedNumber = number.padStart(3, "0").slice(-3);
    return `${timeSlot}${yearDigit}${paddedNumber}`;
  };

  React.useEffect(() => {
    const section = generateSection(
      formData.sectionTimeSlot,
      formData.courseYear,
      formData.sectionNumber
    );
    if (section !== formData.section && formData.sectionNumber) {
      setFormData((prev) => ({ ...prev, section }));
    }
  }, [formData.sectionTimeSlot, formData.sectionNumber, formData.courseYear]); // eslint-disable-line

  const displayedTimeOptions = TIME_PRESETS[formData.sectionTimeSlot] || [];
  const [useCustomTime, setUseCustomTime] = React.useState(false);
  React.useEffect(() => {
    // reset custom/preset if slot changes
    setUseCustomTime(false);
    setFormData((prev) => ({
      ...prev,
      meetingTime: displayedTimeOptions.includes(prev.meetingTime)
        ? prev.meetingTime
        : "",
      customStartTime: "",
      customEndTime: "",
    }));
  }, [formData.sectionTimeSlot]); // eslint-disable-line

  // ----- normalization & preset detection (for prefill) -----
  const normalizeDaysForSelect = (raw = "") => {
    const s = raw.toLowerCase().replace(/\s+/g, "");
    if (s === "mwf") return "MWF";
    if (s === "tths" || s === "tth" || s === "tueth" || s === "tue/thu")
      return "TTHS";
    if (s.includes("sat")) return "TTHS";
    if (s.includes("fri")) return "MWF";
    if (s.includes("mon") || s.includes("wed")) return "MWF";
    if (s.includes("tue") || s.includes("thu") || s.includes("th"))
      return "TTHS";
    return "";
  };

  const splitRangeStrict = (range) =>
    (range || "").split("-").map((x) => (x || "").trim());
  const toMinutesStrict = (t) => {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    return h * 60 + m;
  };
  const findPresetIf75 = (slot, rawRange, PRESETS) => {
    if (!rawRange) return null;
    const [rs, re] = splitRangeStrict(rawRange);
    const sm = toMinutesStrict(rs);
    const em = toMinutesStrict(re);
    if (sm == null || em == null) return null;
    if (em - sm !== 75) return null;

    const presets = PRESETS?.[slot] || [];
    for (const p of presets) {
      const [ps, pe] = splitRangeStrict(p);
      if (toMinutesStrict(ps) === sm && toMinutesStrict(pe) === em) {
        return p; // exact preset match
      }
    }
    return null;
  };

  // Mentor search/filter state
  const [mentorQuery, setMentorQuery] = React.useState("");
  const [selectedProgram, setSelectedProgram] = React.useState("");
  const [filteredMentors, setFilteredMentors] = React.useState(mentorList || []);
  const [selectedMentor, setSelectedMentor] = React.useState(null);
  const [programManuallySelected, setProgramManuallySelected] = React.useState(false);

  React.useEffect(() => {
    let filtered = mentorList || [];
    if (selectedProgram) {
      filtered = filtered.filter(
        (m) => (m?.program || "").toUpperCase() === selectedProgram.toUpperCase()
      );
    }
    if (mentorQuery.trim()) {
      const q = mentorQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q) ||
          (m.program || "").toLowerCase().includes(q)
      );
    }
    setFilteredMentors(filtered);
  }, [mentorQuery, selectedProgram, mentorList]);

  // Init when opening
  React.useEffect(() => {
    if (!subject) return;

    // Derive code & name
    const fullSubjectName = subject.subject
      ? subject.subject
      : subject.courseCode && subject.courseName
      ? `${subject.courseCode} ${subject.courseName}`
      : "";
    const [maybeCode, ...nameParts] = fullSubjectName.split(" ");
    const courseCode = maybeCode || subject.courseCode || "";
    const courseName = nameParts.join(" ").trim() || subject.courseName || "";

    const sectionData = parseSection(subject.section);

    // schedule (if provided previously)
    const initialDaysRaw = subject?.schedule?.days || subject?.meetingDays || "";
    const initialTimeRaw = subject?.schedule?.time || subject?.meetingTime || "";
    const initialSlot = sectionData.timeSlot; // tie schedule slot to section slot

    // Normalize days & decide preset vs custom for time
    const normalizedDays = normalizeDaysForSelect(initialDaysRaw);

    let nextMeetingTime = "";
    let nextCustomStart = "";
    let nextCustomEnd = "";
    let nextUseCustom = false;

    const matchedPreset = findPresetIf75(initialSlot, initialTimeRaw, TIME_PRESETS);
    if (matchedPreset) {
      nextMeetingTime = matchedPreset;
    } else if (initialTimeRaw && initialTimeRaw.includes("-")) {
      const [s, e] = splitRangeStrict(initialTimeRaw);
      nextUseCustom = Boolean(s && e);
      nextCustomStart = s || "";
      nextCustomEnd = e || "";
    }

    const initialMentorName = subject.assignedMentor || subject.mentor || "";
    const initialMentorId = subject.mentorId || subject.mentor || "";
    const initialMentorObj =
      (mentorList || []).find(
        (m) => m.name === initialMentorName || m._id === initialMentorId
      ) || null;
    setSelectedMentor(initialMentorObj);

    setFormData({
      courseCode,
      courseName,
      program: subject.program || detectProgramFromString(courseCode),
      section: subject.section || "",
      sectionTimeSlot: initialSlot,
      sectionNumber: sectionData.number,
      courseYear: sectionData.year || "1",
      mentor: initialMentorName,
      meetingDays: normalizedDays,
      meetingTime: nextMeetingTime,
      customStartTime: nextCustomStart,
      customEndTime: nextCustomEnd,
    });
    setMentorQuery("");
    setSelectedProgram("");
    setProgramManuallySelected(false);
    setUseCustomTime(nextUseCustom);
  }, [subject, mentorList]);

  // badges (match Add modal CSS classes)
  const getProgramBadgeStyle = (program) => {
    const map = { IT: "pg-it", BA: "pg-ba", GE: "pg-ge" };
    return map[program] || "pg-default";
  };

  /* -------------------- VALIDATION & PREVIEW -------------------- */
  const normalizedCourseCode = React.useMemo(
    () => normalizeCourseCode(formData.courseCode),
    [formData.courseCode]
  );

  const isCourseCodeValid = React.useMemo(
    () => !!normalizedCourseCode && COURSE_CODE_REGEX.test(normalizedCourseCode),
    [normalizedCourseCode]
  );

  const codeProgramFromCode = React.useMemo(
    () => detectProgramFromString(normalizedCourseCode),
    [normalizedCourseCode]
  );

  const programMismatch =
    !!formData.program &&
    !!codeProgramFromCode &&
    formData.program !== codeProgramFromCode;

  const isValidSection = /^[AHS][1-4][0-9]{3}$/.test(formData.section);

  const usingPreset = !useCustomTime && !!formData.meetingTime;
  const usingCustom =
    useCustomTime &&
    !!formData.customStartTime &&
    !!formData.customEndTime &&
    isCustomTimeValidForSlot(
      formData.sectionTimeSlot,
      formData.customStartTime,
      formData.customEndTime
    );
  const hasSchedule =
    Boolean(formData.meetingDays) && (usingPreset || usingCustom);

  const canSave =
    formData.courseCode.trim() &&
    formData.courseName.trim() &&
    formData.program?.trim() &&
    formData.mentor?.trim() &&
    isValidSection &&
    hasSchedule &&
    isCourseCodeValid &&
    !programMismatch;

  const splitRange = (range) => {
    const [start, end] = (range || "").split("-").map((s) => (s || "").trim());
    return [start, end];
  };
  const to12hParts = (hhmm) => {
    if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return ["", ""];
    let [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
    const period = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return [`${h}:${String(m).padStart(2, "0")}`, period];
  };
  const formatPresetRange12h = (range, slot) => {
    const [s, e] = splitRange(range);
    if (!s || !e) return range || "";
    const period = slot === "A" ? "AM" : "PM";
    return `${s}–${e} ${period}`;
  };
  const formatCustomRange12h = (start, end) => {
    if (!start || !end) return "";
    const [s12, sp] = to12hParts(start);
    const [e12, ep] = to12hParts(end);
    if (!s12 || !e12) return "";
    return sp === ep ? `${s12}–${e12} ${sp}` : `${s12} ${sp}–${e12} ${ep}`;
  };

  const previewTimeStr = React.useMemo(() => {
    if (useCustomTime) {
      return formatCustomRange12h(
        formData.customStartTime,
        formData.customEndTime
      );
    }
    if (formData.meetingTime) {
      return formatPresetRange12h(
        formData.meetingTime,
        formData.sectionTimeSlot
      );
    }
    return "";
  }, [
    useCustomTime,
    formData.customStartTime,
    formData.customEndTime,
    formData.meetingTime,
    formData.sectionTimeSlot,
  ]);

  /* -------------------- SUBMIT / CANCEL -------------------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSave) return;

    let scheduleTimeStr = "";
    if (!useCustomTime) {
      // ✅ Store presets in unambiguous 24h format based on Time Slot
      scheduleTimeStr = to24FromPreset(
        formData.meetingTime,
        formData.sectionTimeSlot
      );
    } else {
      if (
        !isCustomTimeValidForSlot(
          formData.sectionTimeSlot,
          formData.customStartTime,
          formData.customEndTime
        )
      )
        return;
      // ✅ Normalize custom times to HH:mm-HH:mm
      scheduleTimeStr = `${normalizeHHMM(
        formData.customStartTime
      )}-${normalizeHHMM(formData.customEndTime)}`;
    }

    const newProgram =
      formData.program?.trim() ||
      codeProgramFromCode ||
      subject.program ||
      "";

    onSave({
      ...subject,
      courseCode: normalizeCourseCode(formData.courseCode),
      courseName: formData.courseName.trim(),
      section: formData.section.trim(),
      program: newProgram,
      schoolYear: subjectYear,
      term: subjectTerm,
      assignedMentor: formData.mentor || subject.assignedMentor || "",
      schedule: {
        days: formData.meetingDays,
        time: scheduleTimeStr,         // <-- always 24h now
        timeSlot: formData.sectionTimeSlot,
      },
    });

    onClose();
  };

  const handleCancel = () => {
    // Reset to initial subject-derived values
    const fullSubjectName = subject.subject
      ? subject.subject
      : subject.courseCode && subject.courseName
      ? `${subject.courseCode} ${subject.courseName}`
      : "";
    const [maybeCode, ...nameParts] = fullSubjectName.split(" ");
    const courseCode = maybeCode || subject.courseCode || "";
    const courseName = nameParts.join(" ").trim() || subject.courseName || "";
    const sectionData = parseSection(subject.section);

    const initialDaysRaw = subject?.schedule?.days || subject?.meetingDays || "";
    const initialTimeRaw = subject?.schedule?.time || subject?.meetingTime || "";
    const initialSlot = sectionData.timeSlot;

    let nextMeetingTime = "";
    let nextCustomStart = "";
    let nextCustomEnd = "";
    let nextUseCustom = false;

    const matchedPreset = findPresetIf75(initialSlot, initialTimeRaw, TIME_PRESETS);
    if (matchedPreset) {
      nextMeetingTime = matchedPreset;
    } else if (initialTimeRaw && initialTimeRaw.includes("-")) {
      const [s, e] = splitRangeStrict(initialTimeRaw);
      nextUseCustom = Boolean(s && e);
      nextCustomStart = s || "";
      nextCustomEnd = e || "";
    }

    setFormData({
      courseCode,
      courseName,
      program: subject.program || detectProgramFromString(courseCode),
      section: subject.section || "",
      sectionTimeSlot: initialSlot,
      sectionNumber: sectionData.number,
      courseYear: sectionData.year || "1",
      mentor: subject.assignedMentor || subject.mentor || "",
      meetingDays: normalizeDaysForSelect(initialDaysRaw),
      meetingTime: nextMeetingTime,
      customStartTime: nextCustomStart,
      customEndTime: nextCustomEnd,
    });
    const initialMentorName = subject.assignedMentor || subject.mentor || "";
    const initialMentorId = subject.mentorId || subject.mentor || "";
    setSelectedMentor(
      (mentorList || []).find(
        (m) => m.name === initialMentorName || m._id === initialMentorId
      ) || null
    );
    setMentorQuery("");
    setSelectedProgram("");
    setProgramManuallySelected(false);
    setUseCustomTime(nextUseCustom);
    onClose();
  };

  // Keep Hooks order stable; short-circuit AFTER all hooks run
  if (!isOpen || !subject) return null;

  // --- UI (matches Add modal structure/styles) ---
  return (
    // Put modal ABOVE header and disable outside click-to-close
    <div
      className="aaci overlay"
      style={{ zIndex: 9999 }}         // ensures it's above sticky headers/sidebars
      aria-modal="true"
      role="dialog"
    >
      <div className="aaci modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="aaci header">
          <div className="aaci icon">
            {/* pencil/edit icon */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </div>
          <div>
            <h3 className="aaci title">Edit Subject</h3>
            <p className="aaci subtitle">Update course information</p>
          </div>
        </div>

        {/* Scroll area */}
        <div className="aaci scroll">
          <form id="edit-subject-form" onSubmit={handleSubmit}>
            {/* Validation banner */}
            {!canSave && (
              <div className="aaci banner-warning">
                <div className="bw-title">Please complete the following:</div>
                <ul className="bw-list">
                  {!formData.courseCode.trim() && <li>Course Code cannot be empty</li>}
                  {formData.courseCode.trim() && !isCourseCodeValid && (
                    <li>
                      Course Code must look like <strong>MO-IT103</strong> or{" "}
                      <strong>MO-ENG040</strong> (allowed prefixes: {ALLOWED_PROGRAM_TOKENS.join(", ")})
                    </li>
                  )}
                  {programMismatch && (
                    <li>
                      Program mismatch: selected <strong>{formData.program}</strong> but code indicates{" "}
                      <strong>{codeProgramFromCode}</strong>
                    </li>
                  )}
                  {!formData.courseName.trim() && <li>Course Name cannot be empty</li>}
                  {!formData.program?.trim() && <li>Select a program</li>}
                  {!isValidSection && <li>A valid section is required (e.g., H3102)</li>}
                  {!formData.mentor.trim() && <li>A mentor must be assigned</li>}
                  {!formData.meetingDays && <li>Choose meeting days (MWF or TTHS)</li>}
                  {!usingPreset && !usingCustom && (
                    <li>
                      Choose a meeting time (presets depend on Time Slot) or enter a custom time within the slot window
                    </li>
                  )}
                  {useCustomTime &&
                    formData.customStartTime &&
                    formData.customEndTime &&
                    !isCustomTimeValidForSlot(
                      formData.sectionTimeSlot,
                      formData.customStartTime,
                      formData.customEndTime
                    ) && <li>Custom time must fit the selected Time Slot window</li>}
                </ul>
              </div>
            )}

            {/* Program */}
            <div className="section">
              <label className="label">Program</label>
              <select
                value={formData.program}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData((prev) => ({ ...prev, program: value }));
                }}
                className="select"
              >
                <option value="">Select Program</option>
                <option value="IT">Information Technology</option>
                <option value="BA">Business Administration</option>
                <option value="GE">General Education</option>
              </select>
            </div>

            {/* Course Code & Name */}
            <div className="section">
              <div className="row gap-2">
                <div className="field" style={{ flex: "0 0 40%" }}>
                  <label className="sublabel">Course Code</label>
                  <input
                    type="text"
                    value={formData.courseCode}
                    onChange={(e) => {
                      const nextCodeRaw = e.target.value;
                      const nextCodeNorm = normalizeCourseCode(nextCodeRaw);
                      const inferred = detectProgramFromString(nextCodeNorm);
                      setFormData((prev) => ({
                        ...prev,
                        courseCode: nextCodeRaw,
                        program: prev.program || inferred || prev.program,
                      }));
                    }}
                    onBlur={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        courseCode: normalizeCourseCode(e.target.value),
                      }))
                    }
                    placeholder="e.g., MO-IT124"
                    className="input"
                    required
                    style={
                      formData.courseCode && (!isCourseCodeValid || programMismatch)
                        ? { borderColor: "#ef4444", boxShadow: "0 0 0 3px rgba(239,68,68,.15)" }
                        : undefined
                    }
                  />
                </div>

                <div className="field" style={{ flex: 1 }}>
                  <label className="sublabel">Course Name</label>
                  <input
                    type="text"
                    value={formData.courseName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        courseName: e.target.value,
                      }))
                    }
                    placeholder="e.g., System Integration and Architecture"
                    className="input"
                    required
                  />
                </div>
              </div>

              {/* FULL-WIDTH HELP UNDER BOTH FIELDS */}
              <div className="course-duo-help">
                <small className="help">
                  Must match <strong>MO-XXX999</strong> (+optional suffix). Allowed XXX:{" "}
                  {ALLOWED_PROGRAM_TOKENS.join(", ")}
                </small>

                {formData.courseCode && !isCourseCodeValid && (
                  <small className="help help-error">
                    Invalid code. Examples: <strong>MO-IT103</strong>,{" "}
                    <strong>MO-ENG040</strong>, <strong>MO-SS033A</strong>
                  </small>
                )}

                {programMismatch && (
                  <small className="help help-error">
                    Program mismatch: selected <strong>{formData.program}</strong> but code indicates{" "}
                    <strong>{codeProgramFromCode}</strong>.
                  </small>
                )}
              </div>
            </div>

            {/* Section Builder */}
            <div className="section">
              <label className="label">Section</label>

              <div className="section-preview-wrap">
                <div
                  className={`section-preview ${
                    isValidSection
                      ? "section-valid"
                      : formData.section
                      ? "section-invalid"
                      : ""
                  }`}
                >
                  {formData.section || "___"}
                </div>
                {isValidSection && formData.section ? (
                  <div className="section-valid-badge" title="Valid section format">
                    ✓
                  </div>
                ) : null}
              </div>

              <div className="row gap-2 align-end">
                <div className="field">
                  <label className="sublabel">Time Slot</label>
                  <select
                    value={formData.sectionTimeSlot}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        sectionTimeSlot: e.target.value,
                      }))
                    }
                    className="select"
                  >
                    <option value="A">A - Morning</option>
                    <option value="H">H - Afternoon</option>
                    <option value="S">S - Evening</option>
                  </select>
                </div>

                <div className="field">
                  <label className="sublabel">Course Year</label>
                  <select
                    value={formData.courseYear}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        courseYear: e.target.value.replace(/[^1-4]/g, "") || "1",
                      }))
                    }
                    className="select"
                  >
                    {["1", "2", "3", "4"].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="sublabel">Number</label>
                  <input
                    type="text"
                    value={formData.sectionNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 3);
                      setFormData((prev) => ({ ...prev, sectionNumber: value }));
                    }}
                    placeholder="000"
                    maxLength="3"
                    className="input text-center"
                  />
                </div>
              </div>

              <div className="helper">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                Format: [Time Slot][Course Year][3 digits] • Example: H3102
              </div>
            </div>

            {/* Meeting Schedule */}
            <div className="section section-meeting-sched">
              <label className="label">Meeting Schedule</label>

              <div className="field">
                <label className="sublabel">Days</label>
                <select
                  value={formData.meetingDays}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, meetingDays: e.target.value }))
                  }
                  className="select"
                >
                  <option value="">Select days</option>
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="sublabel">Time</label>
                <div className="row gap-2">
                  <select
                    value={useCustomTime ? "CUSTOM" : formData.meetingTime || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "CUSTOM") {
                        setUseCustomTime(true);
                        setFormData((prev) => ({
                          ...prev,
                          meetingTime: "",
                          customStartTime: prev.customStartTime || "",
                          customEndTime: prev.customEndTime || "",
                        }));
                      } else {
                        setUseCustomTime(false);
                        setFormData((prev) => ({
                          ...prev,
                          meetingTime: v,
                          customStartTime: "",
                          customEndTime: "",
                        }));
                      }
                    }}
                    className="select flex-1"
                  >
                    <option value="">Select time</option>
                    {(TIME_PRESETS[formData.sectionTimeSlot] || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {formatPresetRange12h(opt, formData.sectionTimeSlot)}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom…</option>
                  </select>
                </div>

                {useCustomTime && (
                  <div className="row gap-2 mt-2">
                    <div className="field flex-1">
                      <label className="sublabel">Start</label>
                      <input
                        type="time"
                        value={formData.customStartTime}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customStartTime: e.target.value,
                          }))
                        }
                        className="input"
                      />
                    </div>
                    <div className="field flex-1">
                      <label className="sublabel">End</label>
                      <input
                        type="time"
                        value={formData.customEndTime}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customEndTime: e.target.value,
                          }))
                        }
                        className="input"
                      />
                    </div>
                  </div>
                )}

                <div className="tiny-helper">
                  Presets match the Time Slot:
                  <br />
                  Morning (A): <strong>7:00–10:45 AM</strong> • Afternoon (H): <strong>1:15–5:00 PM</strong> • Evening (S): <strong>6:15–10:00 PM</strong>
                  <br />
                  Example: <strong>{formatPresetRange12h("7:00-8:15", formData.sectionTimeSlot)}</strong> / MWF
                </div>
              </div>
            </div>

            {/* Mentor Assignment */}
            <div className="section">
              <label className="label">Assign Mentor</label>

              <div className="field">
                <select
                  value={selectedProgram}
                  onChange={(e) => setSelectedProgram(e.target.value)}
                  className={`select ${selectedProgram ? "" : "muted"}`}
                >
                  <option value="">All Programs</option>
                  <option value="IT">Information Technology</option>
                  <option value="BA">Business Administration</option>
                  <option value="GE">General Education</option>
                </select>
              </div>

              <div className="subject-box mb-2">
                <input
                  type="text"
                  value={mentorQuery}
                  onChange={(e) => setMentorQuery(e.target.value)}
                  placeholder="Search mentors by name, email, or program..."
                  className="input with-icon"
                />
                <svg
                  className="input-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>

              {selectedMentor && (
                <div className="selected-pill">
                  <span className="selected-pill-text">
                    Selected: {selectedMentor.name}{" "}
                    {selectedMentor.program ? (
                      <span className={`pg ${getProgramBadgeStyle(selectedMentor.program)}`}>
                        {selectedMentor.program}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      setSelectedMentor(null);
                      setFormData((prev) => ({ ...prev, mentor: "" }));
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {(mentorQuery || !selectedMentor) && filteredMentors.length > 0 && (
                <div className="mentor-list-container">
                  {filteredMentors.map((m, index) => (
                    <div
                      key={`${m.name}-${index}`}
                      className="mentor-item"
                      onClick={() => {
                        setSelectedMentor(m);
                        setFormData((prev) => ({ ...prev, mentor: m.name }));
                      }}
                    >
                      <div className="mentor-meta">
                        <div className="mentor-name">{m.name}</div>
                        <div className="mentor-email">{m.email}</div>
                      </div>
                      {m.program ? (
                        <span className={`pg ${getProgramBadgeStyle(m.program)}`}>
                          {(m.program || "").toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="section">
              <label className="label">Preview of Changes</label>
              <div className="preview-card">
                <div className="preview-row">
                  <h3 className="preview-title">
                    {normalizeCourseCode(formData.courseCode)} - {formData.courseName}
                  </h3>
                  {formData.program && (
                    <span className={`pg ${getProgramBadgeStyle(formData.program)}`}>
                      {formData.program}
                    </span>
                  )}
                </div>

                <div className="preview-sub">
                  Section {formData.section || "---"} • {formData.mentor || "---"}
                </div>

                {/* Use the subject’s actual period, not systemSettings */}
                <div className="preview-term">
                  {getSchoolYearLabel(subjectYear)}, Term {subjectTerm}
                </div>

                <div className="preview-sub">
                  {formData.meetingDays || previewTimeStr ? (
                    <>
                      {formData.meetingDays || "---"} • {previewTimeStr || "---"}
                    </>
                  ) : (
                    "Schedule ---"
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="aaci footer">
          <button
            type="button"
            onClick={handleCancel}
            className="subject-add-btn subject-add-btn--white"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-subject-form"
            className="subject-add-btn"
            disabled={!canSave}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminEditSubjectModal;