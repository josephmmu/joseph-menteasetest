const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUser,
  deleteUser,
  searchStudents,
  namesByIds,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private (Admin)
router.get("/", protect, authorize("admin"), getAllUsers);

// Mentor+Admin: search student users by name/email (limited fields)
router.get(
  "/students/search",
  protect,
  authorize("mentor", "admin"),
  searchStudents
);

// Mentor/Admin: resolve ids -> minimal names/emails
router.post(
  "/names",
  protect,
  authorize("mentor", "admin"),
  namesByIds
);

// @route   PUT /api/users/:id
// @desc    Update a user's role and program (Admin only)
// @access  Private (Admin)
router.put("/:id", protect, authorize("admin"), updateUser);

// @route   DELETE /api/users/:id
// @desc    Delete a user (Admin only)
// @access  Private (Admin)
router.delete("/:id", protect, authorize("admin"), deleteUser);

module.exports = router;
