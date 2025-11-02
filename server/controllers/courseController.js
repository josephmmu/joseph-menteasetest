// controllers/courseController.js — fixed
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Program = require("../models/Program");
const User = require("../models/User");
const AcademicTerm = require("../models/AcademicTerm");

/* ---------------- helpers ---------------- */
const toId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v !== null) {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
  }
  return String(v);
};
const toObjectId = (v) =>
  mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;

const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const escRe = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// HH:mm normalizer (accepts H:mm or HH:mm; returns zero-padded "HH:mm")
const normalizeHHMM = (val) => {
  if (!val || typeof val !== "string") return null;
  const m = val.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const hhmmToMinutes = (s) => {
  const n = normalizeHHMM(s);
  if (!n) return NaN;
  const [hh, mm] = n.split(":");
  return Number(hh) * 60 + Number(mm);
};

// Parse "HH:mm-HH:mm" → {start,end}
const parseRangeHHMM = (s = "") => {
  const m = String(s || "").match(
    /^\s*(\d{1,2}:[0-5]\d)\s*-\s*(\d{1,2}:[0-5]\d)\s*$/
  );
  if (!m) return null;
  const start = normalizeHHMM(m[1]);
  const end = normalizeHHMM(m[2]);
  if (!start || !end) return null;
  if (hhmmToMinutes(end) <= hhmmToMinutes(start)) return null;
  return { start, end };
};

// matches frontend logic: MWF -> ["Wed","Fri"], TThS -> ["Thu","Sat"]
function deriveAllowedDaysFromScheduleDays(daysRaw = "") {
  const s = String(daysRaw || "").toUpperCase().replace(/\s+/g, "");
  const normalized = s.replace(/T{2,}HS/g, "THS").replace(/T{2,}H/g, "TH");
  if (normalized === "MWF") return ["Wed", "Fri"];
  if (normalized === "THS") return ["Thu", "Sat"];
  return [];
}

/* ---------- Availability meta helpers (audit only; no grace) ---------- */

// Useful: readable actor string from the request user
const actorLabel = (req, fallback = "system") =>
  String(
    req?.user?.email ||
      req?.user?.name ||
      req?.user?.username ||
      req?.user?._id ||
      fallback
  );

// Seed/normalize `_meta` without any policy/grace fields.
function seedAvailabilityMeta(av, _actor = "system") {
  av._meta = av._meta || {};
  // Ensure maps exist (plain objects for serialization)
  av._meta.openDates = av._meta.openDates || {};
  av._meta.closedDates = av._meta.closedDates || {};
  av._meta.lastEditedAt = new Date();
}

// No-op wrapper now (kept for shape consistency): returns a deep clone
function withRollingPolicy(av) {
  return JSON.parse(JSON.stringify(av || {}));
}

/* ---------- view mapping ---------- */
const mapCourseForFrontend = (course) => {
  const schedule = course.schedule || {};
  const legacyTime =
    schedule.time ||
    (course.startTime && course.endTime
      ? `${course.startTime}-${course.endTime}`
      : "");
  const legacyDays = schedule.days || course.daysOfWeek || "";
  const legacySlot =
    schedule.timeSlot || (course.section ? course.section[0] : undefined);

  // Availability-derived mentoring block (preferred)
  const mentoringStart = course.availability?.mentoringBlock?.start || null;
  const mentoringEnd = course.availability?.mentoringBlock?.end || null;

  // If schedule.time exists, parse it as a fallback mentoring block
  let parsedStart = null,
    parsedEnd = null;
  if (typeof schedule.time === "string") {
    const p = parseRangeHHMM(schedule.time);
    if (p) {
      parsedStart = p.start;
      parsedEnd = p.end;
    }
  }

  const scheduleStart = mentoringStart || parsedStart || null;
  const scheduleEnd = mentoringEnd || parsedEnd || null;

  return {
    id: course._id,
    _id: course._id,
    courseCode: course.courseCode,
    courseName: course.courseName,
    yearLevel: course.yearLevel,
    section: course.section,
    program: course.programId?.programName || "N/A",
    assignedMentor: course.mentorId?.name || null,
    mentorId:
      (course.mentorId && course.mentorId._id) ||
      course.mentorId ||
      course.userId ||
      null,
    term: course.termId?.term || 1,
    schoolYear:
      course.termId?.schoolStartYear && course.termId?.schoolEndYear
        ? `${course.termId.schoolStartYear}-${course.termId.schoolEndYear}`
        : null,
    isActiveTerm: !!course.termId?.isActive,

    startTime: scheduleStart,
    endTime: scheduleEnd,

    // Keep legacy schedule shape
    schedule: {
      days: legacyDays,
      time: legacyTime,
      timeSlot: legacySlot,
      startTime: scheduleStart,
      endTime: scheduleEnd,
    },

    defaultMeetLink: course.defaultMeetLink || "",

    mentoringOverrideStart: mentoringStart,
    mentoringOverrideEnd: mentoringEnd,

    // No grace injection; just return availability clone
    availability: withRollingPolicy(course.availability || {}),

    studentCount:
      course.studentCount ||
      (Array.isArray(course.students) ? course.students.length : 0),
    createdAt: course.createdAt,
  };
};

// auth helper for mentor/admin
function canTouchCourse(reqUser, course) {
  if (!course) return false;
  if (reqUser.role === "admin") return true;
  return String(course.mentorId) === String(reqUser._id);
}

/* ---------------- GET ALL (admin) ---------------- */
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({})
      .populate("programId", "programName")
      .populate("mentorId", "name email")
      .populate("termId", "term schoolStartYear schoolEndYear isActive")
      .sort({ createdAt: -1 });

    res.json(courses.map(mapCourseForFrontend));
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ message: "Server error while fetching courses." });
  }
};

/* ---------------- GET MINE (mentor/student/admin) ---------------- */
const getMyCourses = async (req, res) => {
  try {
    const meId = toId(req.user?._id || req.user?.id);
    const meObj = toObjectId(meId);
    if (!meId) return res.status(401).json({ message: "Not authorized" });

    const roleLower =
      (req.user?._roleNameLower ||
        String(
          req.user?.roleId?.roleName ||
            req.user?.roleName ||
            req.user?.role ||
            ""
        ).toLowerCase()) || "";

    const { termId, mentorId, studentId } = req.query || {};
    const filters = [];
    if (termId && toObjectId(termId)) filters.push({ termId: toObjectId(termId) });

    if (roleLower === "student") {
      const rosterOr = [
        { students: meObj || meId },
        { "students._id": meObj || meId },
        { "students.studentId": meObj || meId },
        { studentIds: meObj || meId },
        { studentId: meObj || meId },
      ];
      filters.push({ $or: rosterOr });
    } else if (roleLower === "mentor") {
      filters.push({ mentorId: meObj || meId });
    } else if (roleLower === "admin") {
      if (mentorId && toObjectId(mentorId)) filters.push({ mentorId: toObjectId(mentorId) });
      if (studentId && toObjectId(studentId)) {
        filters.push({
          $or: [
            { students: toObjectId(studentId) },
            { "students._id": toObjectId(studentId) },
            { "students.studentId": toObjectId(studentId) },
            { studentIds: toObjectId(studentId) },
            { studentId: toObjectId(studentId) },
          ],
        });
      }
      if (!filters.length) return res.json([]);
    } else {
      return res.status(403).json({ message: "Role not authorized" });
    }

    const query = filters.length ? { $and: filters } : {};
    const courses = await Course.find(query)
      .populate("programId", "programName")
      .populate("mentorId", "name email")
      .populate("termId", "term schoolStartYear schoolEndYear isActive")
      .sort({ createdAt: -1 });

    res.json(courses.map(mapCourseForFrontend));
  } catch (error) {
    console.error("Error fetching mentor/student courses:", error);
    res.status(500).json({ message: "Server error while fetching courses." });
  }
};

/* ---------------- LOOKUP (by code/name/section) ---------------- */
const lookupCourses = async (req, res) => {
  try {
    const { q, code, name, section, programId, mentorId, termId } = req.query || {};
    const filter = {};

    if (q) {
      filter.$or = [
        { courseCode: { $regex: escRe(q), $options: "i" } },
        { courseName: { $regex: escRe(q), $options: "i" } },
        { section: { $regex: escRe(q), $options: "i" } },
      ];
    }
    if (code) filter.courseCode = { $regex: `^${escRe(code)}`, $options: "i" };
    if (name) filter.courseName = { $regex: escRe(name), $options: "i" };
    if (section) filter.section = { $regex: `^${escRe(section)}$`, $options: "i" };

    if (programId && toObjectId(programId)) filter.programId = toObjectId(programId);
    if (mentorId && toObjectId(mentorId)) filter.mentorId = toObjectId(mentorId);
    if (termId && toObjectId(termId)) filter.termId = toObjectId(termId);

    const courses = await Course.find(filter)
      .limit(25)
      .populate("programId", "programName")
      .populate("mentorId", "name email")
      .populate("termId", "term schoolStartYear schoolEndYear isActive")
      .sort({ createdAt: -1 });

    return res.json(courses.map(mapCourseForFrontend));
  } catch (error) {
    console.error("Error lookupCourses:", error);
    res.status(500).json({ message: "Server error while looking up courses." });
  }
};

/* ---------------- CREATE ---------------- */
const createCourse = async (req, res) => {
  const {
    courseCode,
    courseName,
    yearLevel,
    program,
    mentor,
    section,
    academicTerm,
    schedule,
    defaultMeetLink,
    availability, // optional on create
  } = req.body;

  try {
    if (!courseCode || !courseName || !yearLevel || !section || !academicTerm) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const programDoc = await Program.findOne({ programName: program });
    if (!programDoc) return res.status(404).json({ message: "Program not found." });

    const mentorDoc =
      (await User.findById(mentor).catch(() => null)) ||
      (await User.findOne({ email: mentor }));
    if (!mentorDoc) return res.status(404).json({ message: "Mentor not found." });

    const termDoc = await AcademicTerm.findById(academicTerm);
    if (!termDoc) return res.status(404).json({ message: "Academic term not found." });

    const course = new Course({
      courseCode,
      courseName,
      yearLevel,
      programId: programDoc._id,
      mentorId: mentorDoc._id,
      termId: termDoc._id,
      section,
      schedule: schedule || {},
      defaultMeetLink: defaultMeetLink || "",
    });

    // Seed availability
    if (availability && typeof availability === "object") {
      if (availability.mentoringBlock?.start && availability.mentoringBlock?.end) {
        course.availability.mentoringBlock = {
          start: normalizeHHMM(availability.mentoringBlock.start) || course.availability.mentoringBlock.start,
          end:   normalizeHHMM(availability.mentoringBlock.end)   || course.availability.mentoringBlock.end,
        };
      } else {
        const p = parseRangeHHMM(course.schedule?.time || "");
        if (p) course.availability.mentoringBlock = { start: p.start, end: p.end };
      }

      if (Array.isArray(availability.allowedDays) && availability.allowedDays.length) {
        course.availability.allowedDays = availability.allowedDays;
      } else {
        const derived = deriveAllowedDaysFromScheduleDays(course.schedule?.days);
        if (derived.length) course.availability.allowedDays = derived;
      }

      if (Array.isArray(availability.openDates))
        course.availability.openDates = [...new Set(availability.openDates)];
      if (Array.isArray(availability.closedDates))
        course.availability.closedDates = [...new Set(availability.closedDates)];

      // Accept client _meta; then seed audit (no policy fields are kept/enforced)
      if (availability._meta) {
        course.availability._meta = availability._meta;
      }
      seedAvailabilityMeta(course.availability, actorLabel(req, "course-create"));
    } else {
      // No availability sent → derive from schedule
      const derived = deriveAllowedDaysFromScheduleDays(course.schedule?.days);
      if (derived.length) course.availability.allowedDays = derived;

      const p = parseRangeHHMM(course.schedule?.time || "");
      if (p) course.availability.mentoringBlock = { start: p.start, end: p.end };

      seedAvailabilityMeta(course.availability, actorLabel(req, "course-create"));
    }

    const createdCourse = await course.save();

    await createdCourse.populate("programId", "programName");
    await createdCourse.populate("mentorId", "name email");
    await createdCourse.populate("termId", "term schoolStartYear schoolEndYear isActive");

    res.status(201).json(mapCourseForFrontend(createdCourse));
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(500).json({ message: "Server error while creating course." });
  }
};

/* ---------------- UPDATE ---------------- */
const updateCourse = async (req, res) => {
  const {
    courseCode,
    courseName,
    yearLevel,
    program,
    mentor,
    section,
    academicTerm,
    schedule,
    defaultMeetLink,
    availability, // optional on update
  } = req.body;

  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard invalid ObjectId
    }

    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found." });

    if (courseCode) course.courseCode = courseCode;
    if (courseName) course.courseName = courseName;
    if (yearLevel) course.yearLevel = yearLevel;
    if (section) course.section = section;
    if (schedule) course.schedule = schedule;
    if (defaultMeetLink !== undefined) course.defaultMeetLink = defaultMeetLink;

    if (program) {
      const programDoc = await Program.findOne({ programName: program });
      if (programDoc) course.programId = programDoc._id;
    }

    if (mentor) {
      const mentorDoc =
        (await User.findById(mentor).catch(() => null)) ||
        (await User.findOne({ email: mentor }));
      if (mentorDoc) course.mentorId = mentorDoc._id;
    }

    if (academicTerm) {
      const termDoc = await AcademicTerm.findById(academicTerm);
      if (termDoc) course.termId = termDoc._id;
    }

    // Optional: update availability alongside schedule
    if (availability && typeof availability === "object") {
      course.availability = course.availability || {};
      if (availability.mentoringBlock?.start && availability.mentoringBlock?.end) {
        const s = normalizeHHMM(availability.mentoringBlock.start);
        const e = normalizeHHMM(availability.mentoringBlock.end);
        if (s && e && hhmmToMinutes(e) > hhmmToMinutes(s)) {
          course.availability.mentoringBlock = { start: s, end: e };
        }
      }
      if (Array.isArray(availability.allowedDays))
        course.availability.allowedDays = availability.allowedDays;
      if (Array.isArray(availability.openDates))
        course.availability.openDates = [...new Set(availability.openDates)];
      if (Array.isArray(availability.closedDates))
        course.availability.closedDates = [...new Set(availability.closedDates)];

      // Merge client-provided _meta; then we'll reseed audit timestamp
      course.availability._meta = {
        ...(course.availability._meta || {}),
        ...(availability._meta || {}),
      };
    }

    // If availability is still empty, derive from schedule now
    if (
      !Array.isArray(course.availability?.allowedDays) ||
      course.availability.allowedDays.length === 0
    ) {
      const derived = deriveAllowedDaysFromScheduleDays(course.schedule?.days);
      if (derived.length) course.availability.allowedDays = derived;
    }
    if (
      !course.availability?.mentoringBlock?.start ||
      !course.availability?.mentoringBlock?.end
    ) {
      const p = parseRangeHHMM(course.schedule?.time || "");
      if (p) course.availability.mentoringBlock = { start: p.start, end: p.end };
    }

    // Audit (no grace fields)
    seedAvailabilityMeta(course.availability, actorLabel(req, "course-update"));

    const updatedCourse = await course.save();

    await updatedCourse.populate("programId", "programName");
    await updatedCourse.populate("mentorId", "name email");
    await updatedCourse.populate("termId", "term schoolStartYear schoolEndYear isActive");

    res.json(mapCourseForFrontend(updatedCourse));
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(500).json({ message: "Server error while updating course." });
  }
};

/* ---------------- DELETE ---------------- */
const deleteCourse = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard
    }
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    await course.deleteOne();
    res.json({ message: "Course deleted successfully." });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({ message: "Server error while deleting course." });
  }
};

/* =======================================================================
 * Availability & Mentoring endpoints
 * =======================================================================
 */

/** GET /api/courses/:id/availability */
const getCourseAvailability = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard
    }

    const course = await Course.findById(req.params.id).select(
      "availability mentorId students"
    );
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const isMentorOwner = canTouchCourse(req.user, course);

    let isEnrolled = false;
    if (Array.isArray(course.students)) {
      const meId = String(req.user?._id || req.user?.id || "");
      isEnrolled = course.students.some(
        (u) => String(u?._id || u?.id || u?.studentId || u?.user || u) === meId
      );
    }

    if (!isAdmin && !isMentorOwner && !isEnrolled) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Return availability clone (no grace policy injected)
    const av = withRollingPolicy(course.availability || {});
    res.json(av);
  } catch (error) {
    console.error("Error getCourseAvailability:", error);
    res
      .status(500)
      .json({ message: "Server error while reading availability." });
  }
};

/** PATCH /api/courses/:id/mentoring  { start: "HH:mm", end: "HH:mm" } */
const patchCourseMentoring = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard
    }

    let { start, end } = req.body || {};
    start = normalizeHHMM(start);
    end = normalizeHHMM(end);
    if (!start || !end) {
      return res
        .status(400)
        .json({ message: "start/end must be in HH:mm (24h) format" });
    }
    if (hhmmToMinutes(end) <= hhmmToMinutes(start)) {
      return res.status(400).json({ message: "end must be later than start" });
    }

    const course = await Course.findById(req.params.id).select(
      "availability mentorId"
    );
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course))
      return res.status(403).json({ message: "Forbidden" });

    course.availability = course.availability || {};
    course.availability.mentoringBlock = { start, end };

    // Audit meta (no grace/policy)
    seedAvailabilityMeta(course.availability, actorLabel(req, "patch-mentoring"));

    await course.save();
    res.json({ mentoringBlock: course.availability.mentoringBlock });
  } catch (error) {
    console.error("Error patchCourseMentoring:", error);
    res
      .status(500)
      .json({ message: "Server error while saving mentoring time." });
  }
};

/** PATCH /api/courses/:id/availability
 *  Body may contain: { allowedDays: string[], openDates: string[], closedDates: string[], _meta?: {...} }
 */
const patchCourseAvailability = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard
    }

    const course = await Course.findById(req.params.id).select(
      "availability mentorId"
    );
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course))
      return res.status(403).json({ message: "Forbidden" });

    const { allowedDays, openDates, closedDates, _meta } = req.body || {};
    const av = course.availability || (course.availability = {});

    // capture previous state BEFORE mutating arrays
    const prevOpen = new Set(Array.isArray(av.openDates) ? av.openDates : []);
    const prevClosed = new Set(Array.isArray(av.closedDates) ? av.closedDates : []);

    // Apply arrays from client (unique, truthy)
    if (Array.isArray(allowedDays)) {
      const allow = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
      av.allowedDays = allowedDays.filter((d) => typeof d === "string" && allow.has(d));
      course.markModified("availability.allowedDays");
    }
    if (Array.isArray(openDates)) {
      av.openDates = Array.from(new Set(openDates.filter(Boolean)));
      course.markModified("availability.openDates");
    }
    if (Array.isArray(closedDates)) {
      av.closedDates = Array.from(new Set(closedDates.filter(Boolean)));
      course.markModified("availability.closedDates");
    }

    // Merge client-provided _meta (tolerant), then ensure shapes
    av._meta = { ...(av._meta || {}), ...(_meta || {}) };

    const isoNow = new Date().toISOString();

    const coerceOpen = (obj = {}) => {
      const out = {};
      for (const [iso, v] of Object.entries(obj)) {
        const openedAt =
          typeof v === "number"
            ? new Date(v).toISOString()
            : v && typeof v === "object" && v.openedAt
            ? v.openedAt
            : typeof v === "string"
            ? v
            : isoNow;
        out[iso] = { openedAt };
      }
      return out;
    };

    const coerceClosed = (obj = {}) => {
      const out = {};
      for (const [iso, v] of Object.entries(obj)) {
        const closedAt =
          typeof v === "number"
            ? new Date(v).toISOString()
            : v && typeof v === "object" && v.closedAt
            ? v.closedAt
            : typeof v === "string"
            ? v
            : isoNow;
        out[iso] = { closedAt };
      }
      return out;
    };

    av._meta.openDates = coerceOpen(av._meta.openDates || {});
    av._meta.closedDates = coerceClosed(av._meta.closedDates || {});

    const curOpen = new Set(Array.isArray(av.openDates) ? av.openDates : []);
    const curClosed = new Set(Array.isArray(av.closedDates) ? av.closedDates : []);

    // Stamp meta for newly-added opens/closes
    for (const iso of curOpen) {
      if (!prevOpen.has(iso) && !av._meta.openDates[iso]) {
        av._meta.openDates[iso] = { openedAt: isoNow };
      }
    }
    for (const iso of curClosed) {
      if (!prevClosed.has(iso) && !av._meta.closedDates[iso]) {
        av._meta.closedDates[iso] = { closedAt: isoNow };
      }
    }

    course.markModified("availability._meta");

    // Audit timestamp (no grace fields)
    seedAvailabilityMeta(av, actorLabel(req, "patch-availability"));

    await course.save();
    // Respond with cloned availability (no grace)
    return res.json(withRollingPolicy(course.availability));
  } catch (error) {
    console.error("Error patchCourseAvailability:", error);
    res
      .status(500)
      .json({ message: "Server error while saving availability." });
  }
};

/* ---------------- Minimal read endpoints (mentor/admin/students) ---------------- */
const getCourseById = async (req, res) => {
  try {
    // FIX: allow "/api/courses/lookup" to be handled here if route ordering isn't specific
    if (String(req.params.id).toLowerCase() === "lookup") {
      return lookupCourses(req, res);
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" }); // FIX: guard invalid ObjectId instead of throwing CastError
    }

    const course = await Course.findById(req.params.id)
      .populate("programId", "programName")
      .populate("mentorId", "name email")
      .populate("termId", "term schoolStartYear schoolEndYear isActive")
      .populate("students", "name email firstName lastName username");
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const meId = String(req.user?._id || req.user?.id || "");
    const isEnrolled =
      Array.isArray(course.students) &&
      course.students.some(
        (u) =>
          String(u?._id || u?.id || u?.studentId || u?.user || u) === meId
      );

    if (!isAdmin && !canTouchCourse(req.user, course) && !isEnrolled) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const base = mapCourseForFrontend(course);
    const students = Array.isArray(course.students)
      ? course.students.map((u) => ({
          _id: u._id || u.id,
          name:
            u.name ||
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            u.email ||
            u.username ||
            "Student",
          email: u.email || u.username || "",
        }))
      : [];
    res.json({ ...base, students });
  } catch (error) {
    console.error("Error getCourseById:", error);
    res.status(500).json({ message: "Server error while fetching course." });
  }
};

const getCourseStudents = async (req, res) => {
  try {
    if (String(req.params.id).toLowerCase() === "lookup") {
      return lookupCourses(req, res); // convenience
    }
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" });
    }

    const course = await Course.findById(req.params.id)
      .select("mentorId students")
      .populate("students", "name email firstName lastName username");
    if (!course) return res.status(404).json({ message: "Course not found" });

    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const meId = String(req.user?._id || req.user?.id || "");
    const isEnrolled =
      Array.isArray(course.students) &&
      course.students.some(
        (u) =>
          String(u?._id || u?.id || u?.studentId || u?.user || u) === meId
      );

    if (!isAdmin && !canTouchCourse(req.user, course) && !isEnrolled) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const arr = Array.isArray(course.students)
      ? course.students.map((u) => ({
          _id: u._id || u.id,
          name:
            u.name ||
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            u.email ||
            u.username ||
            "Student",
          email: u.email || u.username || "",
        }))
      : [];
    res.json(arr);
  } catch (error) {
    console.error("Error getCourseStudents:", error);
    res.status(500).json({ message: "Server error while fetching roster." });
  }
};

const addCourseStudents = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid course id format" });
    }

    const course = await Course.findById(req.params.id).select(
      "students mentorId"
    );
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course))
      return res.status(403).json({ message: "Forbidden" });

    const body = req.body || {};
    const ids = Array.isArray(body.studentIds) ? body.studentIds : [];
    const studentsArr = Array.isArray(body.students) ? body.students : [];
    const emails = Array.isArray(body.emails) ? body.emails : [];

    const wantIds = new Set();
    ids.filter(Boolean).forEach((x) => wantIds.add(String(x)));
    studentsArr.forEach((s) => {
      if (s && s.user) wantIds.add(String(s.user));
      if (s && s.id) wantIds.add(String(s.id));
      if (s && s._id) wantIds.add(String(s._id));
      if (s && s.email) emails.push(s.email);
    });

    if (emails.length) {
      const found = await User.find({
        email: { $in: emails.map((e) => String(e).toLowerCase()) },
      })
        .select("_id")
        .lean();
      found.forEach((u) => wantIds.add(String(u._id)));
    }

    const finalIds = [...wantIds].filter(Boolean);
    if (!finalIds.length) return res.json([]);

    const existing = new Set((course.students || []).map((x) => String(x)));
    finalIds.forEach((id) => {
      if (!existing.has(id)) course.students.push(id);
    });
    await course.save();

    const roster = await Course.findById(course._id)
      .populate("students", "name email firstName lastName username")
      .select("students")
      .lean();
    const out = (roster?.students || []).map((u) => ({
      _id: u._id,
      name:
        u.name ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.email ||
        u.username ||
        "Student",
      email: u.email || u.username || "",
    }));
    res.json(out);
  } catch (error) {
    console.error("addCourseStudents error:", error);
    res.status(500).json({ message: "Server error while adding students." });
  }
};

const removeCourseStudent = async (req, res) => {
  try {
    const { id, sid } = req.params;
    const email = String(req.query?.email || "").toLowerCase();
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid course id format" });
    }
    const course = await Course.findById(id).select("students mentorId");
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course))
      return res.status(403).json({ message: "Forbidden" });

    let targetId = sid || "";
    if (!targetId && email) {
      const u = await User.findOne({ email }).select("_id").lean();
      if (u?._id) targetId = String(u._id);
    }
    if (!targetId)
      return res.status(400).json({ message: "Provide student id or email" });

    course.students = (course.students || []).filter(
      (x) => String(x) !== String(targetId)
    );
    await course.save();
    res.json({ ok: true });
  } catch (error) {
    console.error("removeCourseStudent error:", error);
    res.status(500).json({ message: "Server error while removing student." });
  }
};

const enrollCourse = async (req, res) => addCourseStudents(req, res);

module.exports = {
  getAllCourses,
  getMyCourses,
  lookupCourses, // NEW: export lookup handler
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseAvailability,
  patchCourseMentoring,
  patchCourseAvailability,
  patchCourseMeetingLink: async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid course id format" });
      }

      const { defaultMeetLink } = req.body || {};
      const course = await Course.findById(req.params.id).select(
        "defaultMeetLink mentorId availability"
      );
      if (!course) return res.status(404).json({ message: "Course not found" });
      if (!canTouchCourse(req.user, course))
        return res.status(403).json({ message: "Forbidden" });

      course.defaultMeetLink =
        typeof defaultMeetLink === "string" ? defaultMeetLink.trim() : "";

      // Audit meta (still no grace)
      seedAvailabilityMeta(
        (course.availability = course.availability || {}),
        actorLabel(req, "patch-link")
      );

      await course.save();
      res.json({ defaultMeetLink: course.defaultMeetLink });
    } catch (error) {
      console.error("Error patchCourseMeetingLink:", error);
      res
        .status(500)
        .json({ message: "Server error while saving meeting link." });
    }
  },
  getCourseById,
  getCourseStudents,
  addCourseStudents,
  removeCourseStudent,
  enrollCourse,
};
