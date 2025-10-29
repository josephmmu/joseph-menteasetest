// routes/courseAvailabilityRoutes.js
const express = require("express");
const router = express.Router();
const Course = require("../models/Course");

// in case you want to hard-defaults (same as your FE defaults)
const DEFAULTS = {
  mentoringBlock: { start: "07:00", end: "08:15" },
  allowedDays: [], // FE still handles presets, but you can persist here too
  openDates: [],
  closedDates: [],
  closedMeta: {},
};

// GET /api/courses/:id/availability
router.get("/:id/availability", async (req, res) => {
  try {
    const c = await Course.findById(req.params.id)
      .select("_id availability section courseCode courseName")
      .lean();
    if (!c) return res.status(404).json({ message: "Course not found" });

    const avail = { ...DEFAULTS, ...(c.availability || {}) };
    res.json({ courseId: c._id, availability: avail });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to fetch availability" });
  }
});

// PATCH /api/courses/:id/availability
// Accepts partial: { mentoringBlock?, allowedDays?, openDates?, closedDates?, closedMeta? }
router.patch("/:id/availability", async (req, res) => {
  try {
    const c = await Course.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Course not found" });

    const incoming = req.body || {};
    c.availability = {
      ...(c.availability?.toObject ? c.availability.toObject() : c.availability || {}),
      ...incoming,
      mentoringBlock: {
        ...(c.availability?.mentoringBlock || DEFAULTS.mentoringBlock),
        ...(incoming.mentoringBlock || {}),
      },
      // If arrays provided, replace
      ...(incoming.allowedDays ? { allowedDays: incoming.allowedDays } : {}),
      ...(incoming.openDates   ? { openDates: incoming.openDates }   : {}),
      ...(incoming.closedDates ? { closedDates: incoming.closedDates } : {}),
      ...(incoming.closedMeta  ? { closedMeta: incoming.closedMeta } : {}),
    };

    await c.save();
    res.json({ ok: true, courseId: c._id, availability: c.availability });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update availability" });
  }
});

module.exports = router;