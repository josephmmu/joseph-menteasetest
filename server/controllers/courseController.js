// controllers/courseController.js
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

const mapCourseForFrontend = (course) => {
  const schedule = course.schedule || {};
  const legacyTime =
    schedule.time ||
    (course.startTime && course.endTime ? `${course.startTime}-${course.endTime}` : "");
  const legacyDays = schedule.days || course.daysOfWeek || "";
  const legacySlot = schedule.timeSlot || (course.section ? course.section[0] : undefined);

  // Surface mentoring override (from availability.mentoringBlock) so the UI helpers can read it
  const mentoringStart = course.availability?.mentoringBlock?.start || null;
  const mentoringEnd = course.availability?.mentoringBlock?.end || null;

  return {
    id: course._id,
    _id: course._id,
    courseCode: course.courseCode,
    courseName: course.courseName,
    yearLevel: course.yearLevel,
    section: course.section,
    program: course.programId?.programName || "N/A",
    assignedMentor: course.mentorId?.name || null,
    mentorId: (course.mentorId && course.mentorId._id) || course.mentorId || course.userId || null,
    term: course.termId?.term || 1,
    schoolYear:
      course.termId?.schoolStartYear && course.termId?.schoolEndYear
        ? `${course.termId.schoolStartYear}-${course.termId.schoolEndYear}`
        : null,
    isActiveTerm: !!course.termId?.isActive,
    schedule: {
      days: legacyDays,
      time: legacyTime,
      timeSlot: legacySlot,
    },
    defaultMeetLink: course.defaultMeetLink || "",
    // NEW: expose mentoring override so frontend can prefer these
    mentoringOverrideStart: mentoringStart,
    mentoringOverrideEnd: mentoringEnd,
    studentCount: course.studentCount || (Array.isArray(course.students) ? course.students.length : 0),
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
// Student: roster-only (no program/section/year fallback)
// Mentor: courses where mentorId is me
// Admin: allow ?mentorId= or ?studentId= or return empty unless an explicit filter is given
const getMyCourses = async (req, res) => {
  try {
    const meId = toId(req.user?._id || req.user?.id);
    const meObj = toObjectId(meId);
    if (!meId) return res.status(401).json({ message: "Not authorized" });

    const roleLower =
      (req.user?._roleNameLower ||
        String(req.user?.roleId?.roleName || req.user?.roleName || req.user?.role || "").toLowerCase()) || "";

    // optional filters
    const { termId, mentorId, studentId } = req.query || {};
    const filters = [];

    // constrain term if provided
    if (termId && toObjectId(termId)) {
      filters.push({ termId: toObjectId(termId) });
    }

    if (roleLower === "student") {
      // strict roster shapes only
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
      // admin: allow explicit scoping, otherwise return nothing to avoid noisy data
      if (mentorId && toObjectId(mentorId)) {
        filters.push({ mentorId: toObjectId(mentorId) });
      }
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
      if (!filters.length) {
        // to prevent dumping all courses to admins by default on /mine
        return res.json([]);
      }
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
  } = req.body;

  try {
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
 * NEW: Availability & Mentoring endpoints (mentor/admin)
 * =======================================================================
 */

/** GET /api/courses/:id/availability */
const getCourseAvailability = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).select("availability mentorId");
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course)) return res.status(403).json({ message: "Forbidden" });
    res.json(course.availability || {});
  } catch (error) {
    console.error("Error getCourseAvailability:", error);
    res.status(500).json({ message: "Server error while reading availability." });
  }
};

/** PATCH /api/courses/:id/mentoring  { start: "HH:mm", end: "HH:mm" } */
const patchCourseMentoring = async (req, res) => {
  try {
    let { start, end } = req.body || {};
    start = normalizeHHMM(start);
    end = normalizeHHMM(end);
    if (!start || !end) {
      return res.status(400).json({ message: "start/end must be in HH:mm (24h) format" });
    }
    if (hhmmToMinutes(end) <= hhmmToMinutes(start)) {
      return res.status(400).json({ message: "end must be later than start" });
    }

    const course = await Course.findById(req.params.id).select("availability mentorId");
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course)) return res.status(403).json({ message: "Forbidden" });

    course.availability = course.availability || {};
    course.availability.mentoringBlock = { start, end };

    await course.save();
    res.json({ mentoringBlock: course.availability.mentoringBlock });
  } catch (error) {
    console.error("Error patchCourseMentoring:", error);
    res.status(500).json({ message: "Server error while saving mentoring time." });
  }
};

/** PATCH /api/courses/:id/availability  (partial)
 *  { allowedDays?: string[], openDates?: string[], closedDates?: string[], closedMeta?: Record<string, number> }
 */
const patchCourseAvailability = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).select("availability mentorId");
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course)) return res.status(403).json({ message: "Forbidden" });

    const { allowedDays, openDates, closedDates, closedMeta } = req.body || {};
    const next = course.availability ? course.availability.toObject() : {};

    if (Array.isArray(allowedDays)) {
      const allow = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
      next.allowedDays = allowedDays.filter((d) => typeof d === "string" && allow.has(d));
    }
    if (Array.isArray(openDates)) {
      next.openDates = Array.from(new Set(openDates.filter(Boolean)));
    }
    if (Array.isArray(closedDates)) {
      next.closedDates = Array.from(new Set(closedDates.filter(Boolean)));
    }
    if (closedMeta && typeof closedMeta === "object") {
      next.closedMeta = closedMeta; // expect { [iso]: ms }
    }

    course.availability = next;
    await course.save();
    res.json(course.availability);
  } catch (error) {
    console.error("Error patchCourseAvailability:", error);
    res.status(500).json({ message: "Server error while saving availability." });
  }
};

/** PATCH /api/courses/:id/link   { defaultMeetLink: string } */
const patchCourseMeetingLink = async (req, res) => {
  try {
    const { defaultMeetLink } = req.body || {};
    const course = await Course.findById(req.params.id).select("defaultMeetLink mentorId");
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!canTouchCourse(req.user, course)) return res.status(403).json({ message: "Forbidden" });

    course.defaultMeetLink = typeof defaultMeetLink === "string" ? defaultMeetLink.trim() : "";
    await course.save();
    res.json({ defaultMeetLink: course.defaultMeetLink });
  } catch (error) {
    console.error("Error patchCourseMeetingLink:", error);
    res.status(500).json({ message: "Server error while saving meeting link." });
  }
};

module.exports = {
  getAllCourses,
  getMyCourses,
  createCourse,
  updateCourse,
  deleteCourse,

  // NEW exports
  getCourseAvailability,
  patchCourseMentoring,
  patchCourseAvailability,
  patchCourseMeetingLink,
};