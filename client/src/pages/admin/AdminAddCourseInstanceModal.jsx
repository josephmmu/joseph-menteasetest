import React from "react";
import { useSystemSettings } from "../../context/SystemSettingsContext";
import "./AdminAddCourseInstanceModal.css";

function AdminAddCourseInstanceModal({
  isOpen,
  onClose,
  onSave,
  subjectCatalog = [],
  mentorList = [],
  academicTerm,
  getSchoolYearLabel,
}) {
  const { systemSettings } = useSystemSettings();

  /* -------------------- BASE PROGRAM IDS -------------------- */
  const BASE_PROGRAM_IDS = {
    IT: "68ef6f651ebcddc9be17ae70",
    BA: "68ef6f531ebcddc9be17ae6f",
    GE: "68ef6f741ebcddc9be17ae71",
  };

  const ALLOWED_PROGRAM_TOKENS = [
    "IT", "BA", "MKT", "OM", "HRM", "MGT", "GE", "SS", "ENG", "HUM", "MATH", "PE", "NSTP", "ENV",
  ];
  const COURSE_CODE_REGEX = new RegExp(
    `^MO-(?:${ALLOWED_PROGRAM_TOKENS.join("|")})\\d{3}[A-Z0-9]*$`
  );

  const DAY_OPTIONS = ["MWF", "TTHS"];
  const TIME_PRESETS = {
    A: ["7:00-8:15", "8:15-9:30", "9:30-10:45"],       // AM
    H: ["1:15-2:30", "2:30-3:45", "3:45-5:00"],        // PM
    S: ["6:15-7:30", "7:30-8:45", "8:45-10:00"],       // PM
  };

  const [formData, setFormData] = React.useState({
    subject: "",
    customSubject: "",
    customSubjectProgram: "",
    customCourseCode: "",
    customCourseName: "",
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
  const pad2 = (n) => String(n).padStart(2, "0");

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

  // Convert a preset like "7:00-8:15" to 24h "07:00","08:15" based on slot
  const presetTo24h = (range, slot) => {
    const [s, e] = (range || "").split("-").map((x) => x.trim());
    if (!s || !e) return ["", ""];
    const to24 = (hhmm) => {
      const [hStr, mStr] = hhmm.split(":");
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (slot === "A") return `${pad2(h)}:${pad2(m)}`; // morning stays AM
      if (h < 12) h += 12; // afternoon/evening -> PM
      return `${pad2(h)}:${pad2(m)}`;
    };
    return [to24(s), to24(e)];
  };

  /* -------------------- SECTION BUILDER -------------------- */
  const generateSection = (timeSlot, courseYear, number) => {
    if (!timeSlot || !courseYear || !number) return "";
    const yearDigit = String(courseYear).slice(0, 1);
    const paddedNumber = number.padStart(3, "0").slice(-3);
    return `${timeSlot}${yearDigit}${paddedNumber}`;
  };

  const extractYearFromSection = (sec) => {
    const m = String(sec || "").match(/^[AHS]([1-4])\d{3}$/i);
    return m ? parseInt(m[1], 10) : null;
  };

  React.useEffect(() => {
    const section = generateSection(
      formData.sectionTimeSlot,
      formData.courseYear,
      formData.sectionNumber
    );
    if (section !== formData.section) {
      setFormData((prev) => ({ ...prev, section }));
    }
  }, [formData.sectionTimeSlot, formData.courseYear, formData.sectionNumber]); // eslint-disable-line

  const displayedTimeOptions = TIME_PRESETS[formData.sectionTimeSlot] || [];
  const [useCustomTime, setUseCustomTime] = React.useState(false);
  React.useEffect(() => {
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

  /* -------------------- PROGRAM DETECTION -------------------- */
  const extractCode = (raw = "") => {
    const s = String(raw).toUpperCase();
    const m = s.match(
      /\bMO-\s?(IT|BA|MKT|OM|HRM|MGT|GE|SS|ENG|HUM|MATH|PE|NSTP|ENV)\s?\d{3}[A-Z0-9]*\b/
    );
    return m ? m[0].replace(/\s+/g, "") : "";
  };

  const detectProgramFromString = (raw = "") => {
    const code = extractCode(raw);
    const lc = code.toLowerCase();

    if (/\bmo-it\d{3}[a-z0-9]*\b/.test(lc)) return "IT";
    if (/\bmo-(ba|mkt|om|hrm|mgt)\d{3}[a-z0-9]*\b/.test(lc)) return "BA";
    if (/\bmo-(ge|ss|eng|hum|math|pe|nstp|env)\d{3}[a-z0-9]*\b/.test(lc))
      return "GE";

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

  const resolveProgram = ({
    showAddNewSubject,
    customSubjectProgram,
    customCourseCode,
    selectedSubject,
    subjectProgramFilter,
    selectedProgram, // mentors filter dropdown
    selectedMentor,
  } = {}) => {
    if (showAddNewSubject && customSubjectProgram?.trim()) {
      return customSubjectProgram.trim().toUpperCase();
    }
    const fromSubject = detectProgramFromString(selectedSubject || "");
    if (fromSubject) return fromSubject;
    if (subjectProgramFilter) return subjectProgramFilter.toUpperCase();
    if (selectedProgram) return selectedProgram.toUpperCase();
    if (selectedMentor?.program) return String(selectedMentor.program).toUpperCase();
    const fromNewCode = detectProgramFromString(customCourseCode || "");
    if (fromNewCode) return fromNewCode;
    return "";
  };

  const parseSubject = (subject) => {
    const s = (subject || "").trim();
    if (!s) return { code: "", name: "" };
    const m = s.match(/^(\S+)\s+(.+)$/);
    if (m) return { code: m[1], name: m[2] };
    return { code: s, name: "" };
  };

  // Subject search
  const [subjectQuery, setSubjectQuery] = React.useState("");
  const [filteredSubjects, setFilteredSubjects] = React.useState(
    subjectCatalog || []
  );
  const [selectedSubject, setSelectedSubject] = React.useState(null);
  const [showAddNewSubject, setShowAddNewSubject] = React.useState(false);
  const [isSubjectInputFocused, setIsSubjectInputFocused] =
    React.useState(false);
  const subjectInputRef = React.useRef(null);
  const [subjectProgramFilter, setSubjectProgramFilter] = React.useState("");

  // Mentor search
  const [mentorQuery, setMentorQuery] = React.useState("");
  const [filteredMentors, setFilteredMentors] = React.useState(
    mentorList || []
  );
  const [selectedProgram, setSelectedProgram] = React.useState("");
  const [selectedMentor, setSelectedMentor] = React.useState(null);

  const getProgramBadgeStyle = (program) => {
    const map = { IT: "pg-it", BA: "pg-ba", GE: "pg-ge" };
    return map[program] || "pg-default";
  };

  /* ---------- Subject search + program chips filter ---------- */
  React.useEffect(() => {
    const q = (subjectQuery || "").trim().toLowerCase();
    const base = Array.isArray(subjectCatalog) ? subjectCatalog : [];
    const scoped = subjectProgramFilter
      ? base.filter((s) => detectProgramFromString(s) === subjectProgramFilter)
      : base;

    if (!q) {
      setFilteredSubjects(scoped);
      return;
    }

    let programToken = null;
    if (/^(it|mo-?it)/.test(q)) programToken = "IT";
    else if (/^(ba|bs|mkt|om|hrm|mgt|mo-?(ba|bs|mkt|om|hrm|mgt))/.test(q))
      programToken = "BA";
    else if (
      /^(ge|ss|eng|hum|math|pe|nstp|env|mo-?(ge|ss|eng|hum|math|pe|nstp|env))/.test(
        q
      )
    )
      programToken = "GE";

    const filtered = scoped.filter((s) => {
      const str = (s || "").toString().toLowerCase();
      if (str.includes(q)) return true;
      if (!subjectProgramFilter && programToken)
        return detectProgramFromString(s) === programToken;
      return false;
    });

    setFilteredSubjects(filtered);
  }, [subjectQuery, subjectCatalog, subjectProgramFilter]); // eslint-disable-line

  /* -------------------- Mentor search -------------------- */
  React.useEffect(() => {
    const q = (mentorQuery || "").trim().toLowerCase();
    const base = Array.isArray(mentorList) ? mentorList : [];
    let result = base;
    if (selectedProgram) {
      result = result.filter(
        (m) =>
          (m?.program || "").toUpperCase() === selectedProgram.toUpperCase()
      );
    }
    if (q) {
      result = result.filter((m) =>
        [m?.name, m?.email, m?.program]
          .map((v) => (v || "").toString().toLowerCase())
          .some((v) => v.includes(q))
      );
    }
    setFilteredMentors(result);
  }, [mentorQuery, mentorList, selectedProgram]); // eslint-disable-line

  /* -------------------- Open/Reset modal -------------------- */
  React.useEffect(() => {
    if (isOpen && subjectCatalog.length > 0) {
      setFormData((prev) => ({
        ...prev,
        subject: "",
        courseYear: "1",
        year: systemSettings?.currentAcademicYear ?? 3,
        term: systemSettings?.currentTerm ?? 1,
        meetingDays: "",
        meetingTime: "",
        customStartTime: "",
        customEndTime: "",
      }));
      setSubjectQuery("");
      setSelectedSubject(null);
      setShowAddNewSubject(false);
      setIsSubjectInputFocused(false);
      setSubjectProgramFilter("");
      setUseCustomTime(false);
    }
  }, [isOpen, subjectCatalog, systemSettings]); // eslint-disable-line

  /* -------------------- VALIDATORS -------------------- */
  const normalizeCourseCode = (v = "") =>
    String(v)
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^MO-?/, "MO-");

  const customCodeNormalized = React.useMemo(
    () => normalizeCourseCode(formData.customCourseCode || ""),
    [formData.customCourseCode]
  );

  const isCourseCodeValid =
    !showAddNewSubject ||
    (customCodeNormalized.length > 0 && COURSE_CODE_REGEX.test(customCodeNormalized));

  const codeProgramFromCode = React.useMemo(
    () => detectProgramFromString(customCodeNormalized),
    [customCodeNormalized]
  );

  const programMismatch =
    showAddNewSubject &&
    !!formData.customSubjectProgram &&
    !!codeProgramFromCode &&
    formData.customSubjectProgram !== codeProgramFromCode;

  const isValidSection = /^[AHS][1-4][0-9]{3}$/.test(formData.section);

  const hasNewSubjectFields = Boolean(
    formData.customSubjectProgram?.trim() &&
      formData.customCourseCode?.trim() &&
      formData.customCourseName?.trim()
  );
  const hasSubjectSelected = Boolean(selectedSubject);
  const hasSubject = showAddNewSubject
    ? hasNewSubjectFields && isCourseCodeValid && !programMismatch
    : hasSubjectSelected;

  const hasMentor = Boolean(selectedMentor);

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

  const canSubmit = Boolean(
    isValidSection && hasMentor && hasSubject && hasSchedule
  );

  /* -------------------- Subject handlers -------------------- */
  const handleSubjectSelect = (subject) => {
    setSelectedSubject(subject);
    setFormData((prev) => ({ ...prev, subject: subject }));
    setSubjectQuery(subject);
    setIsSubjectInputFocused(false);
    try {
      subjectInputRef.current?.blur?.();
    } catch {}
  };

  const handleSubjectInputChange = (e) => {
    const value = e.target.value;
    setSubjectQuery(value);
    if (selectedSubject && value !== selectedSubject) {
      if (
        !selectedSubject.toLowerCase().includes(value.toLowerCase()) &&
        value.length > 2
      ) {
        setSelectedSubject(null);
        setFormData((prev) => ({ ...prev, subject: "" }));
      }
    }
  };

  /* -------------------- Mentor handlers -------------------- */
  const handleMentorSelect = (mentor) => {
    setSelectedMentor(mentor);
    setFormData((prev) => ({ ...prev, mentor: mentor._id || mentor.name }));
  };

  const handleMentorInputChange = (e) => {
    const value = e.target.value;
    setMentorQuery(value);
    if (
      selectedMentor &&
      !selectedMentor.name.toLowerCase().includes(value.toLowerCase())
    ) {
      setSelectedMentor(null);
      setFormData((prev) => ({ ...prev, mentor: "" }));
    }
  };

  /* -------------------- Auto-set Program in New Subject -------------------- */
  React.useEffect(() => {
    if (!showAddNewSubject) return;
    const auto = detectProgramFromString(customCodeNormalized || "");
    if (auto && formData.customSubjectProgram !== auto) {
      setFormData((prev) => ({ ...prev, customSubjectProgram: auto }));
    }
  }, [showAddNewSubject, customCodeNormalized]); // eslint-disable-line

  /* --------------- (Optional) Auto-filter mentors by Program --------------- */
  React.useEffect(() => {
    const p = resolveProgram({
      showAddNewSubject,
      customSubjectProgram: formData.customSubjectProgram,
      customCourseCode: customCodeNormalized,
      selectedSubject,
      subjectProgramFilter,
      selectedProgram,
      selectedMentor,
    });
    if (p && !selectedProgram) {
      setSelectedProgram(p);
    }
  }, [
    showAddNewSubject,
    formData.customSubjectProgram,
    customCodeNormalized,
    selectedSubject,
    subjectProgramFilter,
    selectedMentor,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------- Submit -------------------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    let actualSubject;
    let newSubjectData = null;

    if (showAddNewSubject) {
      if (!formData.customSubjectProgram?.trim()) return;
      if (!formData.customCourseCode?.trim()) return;
      if (!formData.customCourseName?.trim()) return;
      if (!COURSE_CODE_REGEX.test(customCodeNormalized)) return;
      if (
        formData.customSubjectProgram &&
        codeProgramFromCode &&
        formData.customSubjectProgram !== codeProgramFromCode
      )
        return;

      actualSubject = `${customCodeNormalized} ${formData.customCourseName.trim()}`;
      newSubjectData = {
        program: formData.customSubjectProgram,
        courseCode: customCodeNormalized,
        courseName: formData.customCourseName.trim(),
        fullName: actualSubject,
      };
    } else {
      if (!selectedSubject) return;
      actualSubject = selectedSubject || formData.subject;
    }

    if (!/^[AHS][1-4][0-9]{3}$/.test(formData.section)) return;
    if (!selectedMentor) return;
    if (!formData.meetingDays) return;

    // Ensure exact, unambiguous 24h times are saved
    let start24 = "";
    let end24 = "";

    if (!useCustomTime) {
      if (!formData.meetingTime) return;
      [start24, end24] = presetTo24h(
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
      start24 = formData.customStartTime;  // HH:mm from <input type="time">
      end24 = formData.customEndTime;
    }

    // Resolve program + programId
    const program = resolveProgram({
      showAddNewSubject,
      customSubjectProgram: formData.customSubjectProgram,
      customCourseCode: customCodeNormalized,
      selectedSubject,
      subjectProgramFilter,
      selectedProgram,
      selectedMentor,
    });
    const programId = program ? BASE_PROGRAM_IDS[program] || null : null;

    // Split subject into code/name
    const { code: courseCode, name: courseName } = showAddNewSubject
      ? {
          code: customCodeNormalized,
          name: formData.customCourseName.trim(),
        }
      : parseSubject(actualSubject);

    const yearLevel =
      extractYearFromSection(formData.section) ||
      parseInt(formData.courseYear, 10) ||
      1;

    const mentorId = selectedMentor?._id || "";

    onSave({
      termId: academicTerm?._id || academicTerm?.id || null,
      mentor: mentorId,
      mentorId,
      program,
      programId,

      subject: actualSubject,
      courseCode,
      courseName,
      section: formData.section,
      yearLevel,

      year: academicTerm?.schoolYear,
      term: academicTerm?.term,

      daysOfWeek: formData.meetingDays,
      startTime: start24,
      endTime: end24,

      isNewSubject: showAddNewSubject,
      newSubjectData,

      schedule: {
        days: formData.meetingDays,
        time: `${start24}-${end24}`,
        timeSlot: formData.sectionTimeSlot,
        startTime: start24,
        endTime: end24,
      },
    });

    // reset
    setFormData({
      subject: "",
      customSubject: "",
      customSubjectProgram: "",
      customCourseCode: "",
      customCourseName: "",
      section: "",
      sectionTimeSlot: "A",
      sectionNumber: "",
      courseYear: "1",
      mentor: "",
      year: systemSettings?.currentAcademicYear ?? 3,
      term: systemSettings?.currentTerm ?? 1,
      meetingDays: "",
      meetingTime: "",
      customStartTime: "",
      customEndTime: "",
    });
    setSubjectQuery("");
    setSelectedSubject(null);
    setShowAddNewSubject(false);
    setIsSubjectInputFocused(false);
    setSubjectProgramFilter("");
    setMentorQuery("");
    setSelectedProgram("");
    setSelectedMentor(null);
    setUseCustomTime(false);
  };

  const handleCancel = () => {
    setFormData({
      subject: "",
      customSubject: "",
      customSubjectProgram: "",
      customCourseCode: "",
      customCourseName: "",
      section: "",
      sectionTimeSlot: "A",
      sectionNumber: "",
      courseYear: "1",
      mentor: "",
      year: systemSettings?.currentAcademicYear ?? 3,
      term: systemSettings?.currentTerm ?? 1,
      meetingDays: "",
      meetingTime: "",
      customStartTime: "",
      customEndTime: "",
    });
    setSubjectQuery("");
    setSelectedSubject(null);
    setShowAddNewSubject(false);
    setIsSubjectInputFocused(false);
    setMentorQuery("");
    setSelectedProgram("");
    setSelectedMentor(null);
    setUseCustomTime(false);
    onClose();
  };

  /* -------------------- Preview helpers -------------------- */
  const { code: previewCode, name: previewName } = React.useMemo(() => {
    if (showAddNewSubject) {
      return {
        code: customCodeNormalized,
        name: (formData.customCourseName || "").trim(),
      };
    }
    if (selectedSubject) {
      return parseSubject(selectedSubject);
    }
    return { code: "", name: "" };
  }, [
    showAddNewSubject,
    customCodeNormalized,
    formData.customCourseName,
    selectedSubject,
  ]);

  const previewProgram = React.useMemo(() => {
    return resolveProgram({
      showAddNewSubject,
      customSubjectProgram: formData.customSubjectProgram,
      customCourseCode: customCodeNormalized,
      selectedSubject,
      subjectProgramFilter,
      selectedProgram,
      selectedMentor,
    });
  }, [
    showAddNewSubject,
    formData.customSubjectProgram,
    customCodeNormalized,
    selectedSubject,
    subjectProgramFilter,
    selectedProgram,
    selectedMentor,
  ]);

  const previewTermLabel = React.useMemo(() => {
    if (!academicTerm) return "No active term";
    return `${getSchoolYearLabel(academicTerm.schoolYear)}, Term ${
      academicTerm.term
    }`;
  }, [academicTerm, getSchoolYearLabel]);

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

  // Preset labels with AM/PM (values remain HH:mm-HH:mm in 12h style for A/H/S)
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

  if (!isOpen) return null;

  return (
    // NOTE: clicking the overlay will NOT close the modal anymore
    <div className="aaci overlay" aria-modal="true" role="dialog">
      <div className="aaci modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="aaci header">
          <div className="aaci icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div>
            <h3 className="aaci title">Add Course</h3>
            <p className="aaci subtitle">Create a new course for {previewTermLabel}</p>
          </div>
        </div>

        {/* Scroll area */}
        <div className="aaci scroll">
          <form id="add-course-form" onSubmit={handleSubmit}>
            {/* Academic Term Banner */}
            {academicTerm && (
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <div style={{ fontSize: "0.875rem", color: "#1e40af" }}>
                  <strong>Active Term:</strong> {previewTermLabel}
                </div>
              </div>
            )}

            {!academicTerm && (
              <div className="aaci banner-warning">
                <div className="bw-title">No Active Academic Term</div>
                <ul className="bw-list">
                  <li>Please set an active academic term in System Settings before adding courses.</li>
                </ul>
              </div>
            )}
            {!canSubmit && (
              <div className="aaci banner-warning">
                <div className="bw-title">Complete the following before adding:</div>
                <ul className="bw-list">
                  {!(showAddNewSubject ? hasNewSubjectFields : hasSubjectSelected) && (
                    <li>
                      {showAddNewSubject
                        ? "Enter Program, Course Code, and Course Name for the new subject"
                        : "Select a subject from the list"}
                    </li>
                  )}
                  {showAddNewSubject && formData.customCourseCode && !isCourseCodeValid && (
                    <li>Course Code must be like <strong>MO-IT103</strong> or <strong>MO-ENG040</strong> (only allowed prefixes: {ALLOWED_PROGRAM_TOKENS.join(", ")})</li>
                  )}
                  {showAddNewSubject && programMismatch && (
                    <li>Program mismatch: selected <strong>{formData.customSubjectProgram}</strong> but code indicates <strong>{codeProgramFromCode}</strong></li>
                  )}
                  {!isValidSection && <li>Provide a valid section code (format: [A/H/S][1–4][3 digits], e.g., H1101)</li>}
                  {!hasMentor && <li>Select a mentor</li>}
                  {!formData.meetingDays && <li>Choose meeting days (MWF or TTHS)</li>}
                  {!usingPreset && !usingCustom && (
                    <li>Choose a meeting time (presets depend on Time Slot) or enter a custom time within the slot window</li>
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

            {/* Subject */}
            <div className="aaci section">
              {!showAddNewSubject ? (
                <>
                  <label className="aaci label">Subject</label>
                  <div className="row gap-2 mb-2 subject-row">
                    <div className="subject-box">
                      <input
                        ref={subjectInputRef}
                        type="text"
                        value={subjectQuery}
                        onChange={handleSubjectInputChange}
                        placeholder="Search subjects..."
                        className="input with-icon"
                        onFocus={() => {
                          setIsSubjectInputFocused(true);
                          if (!subjectQuery) {
                            setSelectedSubject(null);
                            setFormData((prev) => ({ ...prev, subject: "" }));
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setIsSubjectInputFocused(false), 300);
                        }}
                      />
                      <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>

                      {isSubjectInputFocused && (
                        <div className="dropdown" onMouseDown={(e) => e.preventDefault()}>
                          <div className="dropdown-filter" onMouseDown={(e) => e.preventDefault()}>
                            {[
                              { label: "All", value: "" },
                              { label: "IT", value: "IT" },
                              { label: "BA", value: "BA" },
                              { label: "GE", value: "GE" },
                            ].map((opt) => {
                              const active = subjectProgramFilter === opt.value;
                              return (
                                <button
                                  key={opt.value || "ALL"}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => setSubjectProgramFilter(opt.value)}
                                  className={`chip ${active ? "chip-active" : ""}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          {filteredSubjects.length === 0 ? (
                            <div className="dropdown-empty">No subjects found. Try a different filter.</div>
                          ) : (
                            filteredSubjects.map((subject, index) => {
                              const pg = detectProgramFromString(subject);
                              return (
                                <div
                                  key={index}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSubjectSelect(subject);
                                  }}
                                  className="dropdown-item"
                                >
                                  <span>{subject}</span>
                                  {pg ? (
                                    <span className={`pg ${getProgramBadgeStyle(pg)}`}>
                                      {pg}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {/* Add New */}
                    <button
                      type="button"
                      onClick={() => setShowAddNewSubject(true)}
                      className="subject-add-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add New
                    </button>
                  </div>

                  {selectedSubject && (
                    <div className="selected-pill">
                      <span className="selected-pill-text">
                        Selected: {selectedSubject}{" "}
                        {(() => {
                          const pg = detectProgramFromString(selectedSubject);
                          return pg ? <span className={`pg ${getProgramBadgeStyle(pg)}`}>{pg}</span> : null;
                        })()}
                      </span>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setSelectedSubject(null);
                          setSubjectQuery("");
                          setFormData((prev) => ({ ...prev, subject: "" }));
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddNewSubject(false);
                        setFormData((prev) => ({
                          ...prev,
                          customSubjectProgram: "",
                          customCourseCode: "",
                          customCourseName: "",
                        }));
                      }}
                      className="btn btn-outline btn-sm"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                      Back to subject list
                    </button>
                  </div>

                  <div className="card">
                    <div className="card-title">Create New Subject</div>

                    <div className="field">
                      <label className="label">Program</label>
                      <select
                        value={formData.customSubjectProgram || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customSubjectProgram: e.target.value,
                          }))
                        }
                        className="select"
                        required
                      >
                        <option value="">Select Program</option>
                        <option value="IT">Information Technology</option>
                        <option value="BA">Business Administration</option>
                        <option value="GE">General Education</option>
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Course Code</label>
                      <input
                        type="text"
                        value={formData.customCourseCode || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customCourseCode: e.target.value,
                          }))
                        }
                        onBlur={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customCourseCode: normalizeCourseCode(e.target.value),
                          }))
                        }
                        placeholder="e.g., MO-IT103, MO-ENG040, MO-SS033"
                        className="input"
                        required
                        style={
                          showAddNewSubject && formData.customCourseCode && !isCourseCodeValid
                            ? { borderColor: "#ef4444", boxShadow: "0 0 0 3px rgba(239,68,68,.15)" }
                            : undefined
                        }
                      />
                      <small className="help">
                        Must match <strong>MO-XXX999</strong> (+optional suffix). Allowed XXX: {ALLOWED_PROGRAM_TOKENS.join(", ")}
                      </small>
                      {showAddNewSubject && formData.customCourseCode && !isCourseCodeValid && (
                        <small className="help" style={{ color: "#b91c1c" }}>
                          Invalid code. Examples: <strong>MO-IT103</strong>, <strong>MO-ENG040</strong>, <strong>MO-SS033A</strong>
                        </small>
                      )}
                      {showAddNewSubject && programMismatch && (
                        <small className="help" style={{ color: "#b91c1c" }}>
                          Program mismatch: selected <strong>{formData.customSubjectProgram}</strong> but code indicates <strong>{codeProgramFromCode}</strong>.
                        </small>
                      )}
                    </div>

                    <div className="field">
                      <label className="label">Course Name</label>
                      <input
                        type="text"
                        value={formData.customCourseName || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            customCourseName: e.target.value,
                          }))
                        }
                        placeholder="e.g., Computer Programming 2"
                        className="input"
                        required
                      />
                    </div>
                  </div>
                </>
              )}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, meetingDays: e.target.value }))}
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
                    {displayedTimeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {/* AM/PM label for presets (value stays "7:00-8:15") */}
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
                        onChange={(e) => setFormData((prev) => ({ ...prev, customStartTime: e.target.value }))}
                        className="input"
                      />
                    </div>
                    <div className="field flex-1">
                      <label className="sublabel">End</label>
                      <input
                        type="time"
                        value={formData.customEndTime}
                        onChange={(e) => setFormData((prev) => ({ ...prev, customEndTime: e.target.value }))}
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
                  Example: <strong>{formatPresetRange12h("7:00-8:15", formData.sectionTimeSlot)}</strong> / {formData.meetingDays || "MWF"}
                </div>
              </div>
            </div>

            {/* Mentor */}
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
                  onChange={handleMentorInputChange}
                  placeholder="Search mentors by name, email, or program..."
                  className="input with-icon"
                />
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>

              {selectedMentor && (
                <div className="selected-pill">
                  <span className="selected-pill-text">
                    Selected: {selectedMentor.name}{" "}
                    {selectedMentor.program ? (
                      <span className={`pg ${getProgramBadgeStyle(selectedMentor.program)}`}>{selectedMentor.program}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      setSelectedMentor(null);
                      setMentorQuery("");
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
                  {filteredMentors.map((mentor, index) => (
                    <div key={index} className="mentor-item" onClick={() => handleMentorSelect(mentor)}>
                      <div className="mentor-meta">
                        <div className="mentor-name">{mentor.name}</div>
                        <div className="mentor-email">{mentor.email}</div>
                      </div>
                      <span className={`pg ${getProgramBadgeStyle(mentor.program)}`}>{mentor.program}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {(previewCode || previewName) && (
              <div className="section">
                <label className="label">Preview of Changes</label>
                <div className="preview-card">
                  <div className="preview-row">
                    <h3 className="preview-title">
                      {previewCode} - {previewName}
                    </h3>
                    {previewProgram && (
                      <span className={`pg ${getProgramBadgeStyle(previewProgram)}`}>{previewProgram}</span>
                    )}
                  </div>

                  <div className="preview-sub">
                    Section {formData.section || "---"} • {selectedMentor?.name || "---"}
                  </div>

                  <div className="preview-term">{previewTermLabel}</div>

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
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="aaci footer">
          <button type="button" onClick={handleCancel} className="subject-add-btn subject-add-btn--white">
            Cancel
          </button>

          <button type="submit" form="add-course-form" className="subject-add-btn" disabled={!canSubmit || !academicTerm}>
            Add Course
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminAddCourseInstanceModal;