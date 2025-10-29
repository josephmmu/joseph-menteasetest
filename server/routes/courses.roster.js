// routes/courses.roster.js
const express = require("express");
const { isValidObjectId } = require("mongoose");
const router = express.Router();

const Course = require("../models/Course");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/authMiddleware");

// Require auth for everything here
router.use(protect);

// --- helpers ---
const ensureObjectId = (id) => (isValidObjectId(id) ? id : null);
const pickStudentFields = (u) => ({
  _id: u._id,
  email: u.email || "",
  name: u.name || u.email || "Student",
});

async function getCourseLean(id) {
  return Course.findById(id).select("mentorId students").lean();
}

function roleName(req) {
  return req?.user?.roleId?.roleName || req?.user?.role || "";
}

// Mentors who own the course OR admins can mutate/see roster.
// Enrolled students may READ roster (GET) but cannot mutate.
async function canReadRoster(req, courseId) {
  const course = await getCourseLean(courseId);
  if (!course) return { ok: false, code: 404, msg: "Course not found" };

  const role = roleName(req);
  const isAdmin = role === "admin";
  const isOwner = String(course.mentorId) === String(req.user._id);
  const isEnrolled = (course.students || []).some(
    (sid) => String(sid) === String(req.user._id)
  );

  if (isAdmin || isOwner || isEnrolled) return { ok: true, course };
  return { ok: false, code: 403, msg: "Not allowed for this course" };
}

async function mustOwnOrAdmin(req, courseId) {
  const course = await getCourseLean(courseId);
  if (!course) return { ok: false, code: 404, msg: "Course not found" };

  const role = roleName(req);
  const isAdmin = role === "admin";
  const isOwner = String(course.mentorId) === String(req.user._id);

  if (!isAdmin && !isOwner) {
    return { ok: false, code: 403, msg: "Not allowed for this course" };
  }
  return { ok: true, course };
}

// ================= READ (students & mentors & enrolled students) =================

// GET /api/courses/:id/students  -> returns [{_id,name,email}]
router.get("/:id/students", async (req, res) => {
  try {
    const id = ensureObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid course id" });

    const gate = await canReadRoster(req, id);
    if (!gate.ok) return res.status(gate.code).json({ message: gate.msg });

    const populated = await Course.findById(id)
      .populate("students", "name email")
      .lean();
    if (!populated) return res.status(404).json({ message: "Course not found" });

    const students = (populated.students || []).map(pickStudentFields);
    return res.json(students);
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to get roster" });
  }
});

// ================= MUTATIONS (mentors/admins only) =================

// POST /api/courses/:id/enroll  { studentIds: [] } OR { emails: [] }
router.post("/:id/enroll", authorize("mentor", "admin"), async (req, res) => {
  try {
    const id = ensureObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid course id" });

    const gate = await mustOwnOrAdmin(req, id);
    if (!gate.ok) return res.status(gate.code).json({ message: gate.msg });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const { studentIds = [], emails = [] } = req.body || {};
    const ids = (studentIds || []).filter(isValidObjectId);

    if (Array.isArray(emails) && emails.length) {
      const users = await User.find(
        { email: { $in: emails.filter(Boolean) } },
        "_id"
      ).lean();
      ids.push(...users.map((u) => String(u._id)));
    }

    if (!ids.length) {
      return res.status(400).json({ message: "No valid students to add" });
    }

    const set = new Set((course.students || []).map(String));
    ids.forEach((sid) => set.add(String(sid)));
    course.students = Array.from(set);
    await course.save();

    const populated = await Course.findById(course._id)
      .populate("students", "name email")
      .lean();

    return res.json((populated.students || []).map(pickStudentFields));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to enroll students" });
  }
});

// POST /api/courses/:id/students  { students: [{user,email,name}] }
router.post("/:id/students", authorize("mentor", "admin"), async (req, res) => {
  try {
    const id = ensureObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid course id" });

    const gate = await mustOwnOrAdmin(req, id);
    if (!gate.ok) return res.status(gate.code).json({ message: gate.msg });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const { students = [] } = req.body || {};
    if (!Array.isArray(students) || !students.length) {
      return res.status(400).json({ message: "No students payload provided" });
    }

    const toIds = [];
    for (const s of students) {
      if (s?.user && isValidObjectId(s.user)) {
        toIds.push(String(s.user));
      } else if (s?.email) {
        const u = await User.findOne({ email: s.email }, "_id").lean();
        if (u) toIds.push(String(u._id));
      }
    }

    if (!toIds.length) {
      return res.status(400).json({ message: "No valid students to add" });
    }

    const set = new Set((course.students || []).map(String));
    toIds.forEach((sid) => set.add(sid));
    course.students = Array.from(set);
    await course.save();

    const populated = await Course.findById(course._id)
      .populate("students", "name email")
      .lean();

    return res.json((populated.students || []).map(pickStudentFields));
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to add students" });
  }
});

// DELETE /api/courses/:id/students/:studentId
router.delete("/:id/students/:studentId", authorize("mentor", "admin"), async (req, res) => {
  try {
    const id = ensureObjectId(req.params.id);
    const studentId = ensureObjectId(req.params.studentId);
    if (!id || !studentId)
      return res.status(400).json({ message: "Invalid ids" });

    const gate = await mustOwnOrAdmin(req, id);
    if (!gate.ok) return res.status(gate.code).json({ message: gate.msg });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    course.students = (course.students || []).filter(
      (sid) => String(sid) !== String(studentId)
    );
    await course.save();

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to remove student" });
  }
});

// DELETE /api/courses/:id/students?email=...
router.delete("/:id/students", authorize("mentor", "admin"), async (req, res) => {
  try {
    const id = ensureObjectId(req.params.id);
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!id) return res.status(400).json({ message: "Invalid course id" });
    if (!email) return res.status(400).json({ message: "Email required" });

    const gate = await mustOwnOrAdmin(req, id);
    if (!gate.ok) return res.status(gate.code).json({ message: gate.msg });

    const user = await User.findOne({ email }, "_id").lean();
    if (!user) return res.status(404).json({ message: "Student not found" });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    course.students = (course.students || []).filter(
      (sid) => String(sid) !== String(user._id)
    );
    await course.save();

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to remove student" });
  }
});

module.exports = router;