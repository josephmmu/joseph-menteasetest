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
} = require("../controllers/courseController");
const { protect, authorize } = require("../middleware/authMiddleware");

// GET my courses (mentor/student/admin*)
router.get("/mine", protect, authorize("mentor", "student", "admin"), getMyCourses);

// Availability & mentoring (mentor/admin)
router.get("/:id/availability", protect, authorize("mentor", "admin"), getCourseAvailability);
router.patch("/:id/mentoring",    protect, authorize("mentor", "admin"), patchCourseMentoring);
router.patch("/:id/availability", protect, authorize("mentor", "admin"), patchCourseAvailability);

// Meeting link (mentor/admin)
router.patch("/:id/link", protect, authorize("mentor", "admin"), patchCourseMeetingLink);

// GET all (admin)
router.get("/", protect, authorize("admin"), getAllCourses);

// POST create (admin)
router.post("/", protect, authorize("admin"), createCourse);

// PUT update (admin)
router.put("/:id", protect, authorize("admin"), updateCourse);

// DELETE (admin)
router.delete("/:id", protect, authorize("admin"), deleteCourse);

module.exports = router;