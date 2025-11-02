// routes/courseRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllCourses,
  getMyCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  // NEW
  getCourseAvailability,
  patchCourseMentoring,
  patchCourseAvailability,
  patchCourseMeetingLink,
  getCourseById,
  getCourseStudents,
  addCourseStudents,
  removeCourseStudent,
  enrollCourse,
} = require("../controllers/courseController");
const { protect, authorize } = require("../middleware/authMiddleware");

// GET my courses (mentor/student/admin*)
router.get("/mine", protect, authorize("mentor", "student", "admin"), getMyCourses);

// Availability & mentoring
router.get(
  "/:id/availability",
  protect,
  authorize("mentor", "student", "admin"),
  getCourseAvailability
);
router.patch("/:id/mentoring",    protect, authorize("mentor", "admin"), patchCourseMentoring);
router.patch("/:id/availability", protect, authorize("mentor", "admin"), patchCourseAvailability);

// Meeting link (mentor/admin)
router.patch("/:id/link", protect, authorize("mentor", "admin"), patchCourseMeetingLink);

// Read course + roster (mentor/admin/student can read)
router.get("/:id/students", protect, authorize("mentor", "student", "admin"), getCourseStudents);
router.get("/:id",          protect, authorize("mentor", "student", "admin"), getCourseById);

// Roster changes (mentor/admin)
router.post("/:id/enroll",          protect, authorize("mentor", "admin"), enrollCourse);
router.post("/:id/students",        protect, authorize("mentor", "admin"), addCourseStudents);
router.delete("/:id/students/:sid", protect, authorize("mentor", "admin"), removeCourseStudent);
router.delete("/:id/students",      protect, authorize("mentor", "admin"), removeCourseStudent);

// GET all (admin)
router.get("/", protect, authorize("admin"), getAllCourses);

// POST create (admin)
router.post("/", protect, authorize("admin"), createCourse);

// PUT update (admin)
router.put("/:id", protect, authorize("admin"), updateCourse);

// DELETE (admin)
router.delete("/:id", protect, authorize("admin"), deleteCourse);

module.exports = router;