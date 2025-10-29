const express = require("express");
const router = express.Router();
const {
  getAllTerms,
  getActiveTerm,
  createTerm,
  updateTerm,
  deleteTerm,
  setActiveTerm,
  deactivateTerm,
  getTermsForMentor,
} = require("../controllers/academicTermController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Public route to get the active term for display in the app
router.get("/active", protect, getActiveTerm);
// Minimal list for mentors to browse past terms
router.get("/min", protect, authorize("mentor", "admin"), getTermsForMentor);

// Admin-only routes
router
  .route("/")
  .get(protect, authorize("admin"), getAllTerms)
  .post(protect, authorize("admin"), createTerm);

router
  .route("/:id")
  .put(protect, authorize("admin"), updateTerm)
  .delete(protect, authorize("admin"), deleteTerm);

router.patch("/:id/set-active", protect, authorize("admin"), setActiveTerm);
router.patch("/:id/deactivate", protect, authorize("admin"), deactivateTerm);

module.exports = router;
