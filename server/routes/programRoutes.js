const express = require("express");
const router = express.Router();
const { getAllPrograms } = require("../controllers/programController");
const { protect, authorize } = require("../middleware/authMiddleware");

// GET all programs
router.get("/", protect, authorize("admin"), getAllPrograms);

module.exports = router;
