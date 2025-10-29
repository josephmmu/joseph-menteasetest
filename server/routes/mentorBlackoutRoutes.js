// routes/mentorBlackoutRoutes.js
const express = require("express");
const router = express.Router();
const MentorBlackout = require("../models/MentorBlackout");
const mongoose = require("mongoose");

// Utility
const daysBetweenInclusive = (aISO, bISO) => {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
};

// GET /api/mentor-blackouts?mentorId=<id>
router.get("/", async (req, res) => {
  try {
    const { mentorId } = req.query;
    if (!mentorId || !mongoose.isValidObjectId(mentorId)) {
      return res.status(400).json({ message: "mentorId required" });
    }
    const list = await MentorBlackout.find({ mentorId })
      .sort({ startISO: 1 })
      .lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to fetch blackouts" });
  }
});

// POST /api/mentor-blackouts
// body: { mentorId, startISO, endISO, reason }
router.post("/", async (req, res) => {
  try {
    const { mentorId, startISO, endISO, reason = "" } = req.body || {};
    if (!mentorId || !mongoose.isValidObjectId(mentorId)) {
      return res.status(400).json({ message: "mentorId is required" });
    }
    if (!startISO || !endISO) {
      return res.status(400).json({ message: "startISO and endISO are required" });
    }
    // limit to <= 3 days per blackout
    if (daysBetweenInclusive(startISO, endISO) > 3) {
      return res.status(400).json({ message: "Blackout cannot exceed 3 days." });
    }
    // prevent overlap with existing
    const clash = await MentorBlackout.findOne({
      mentorId,
      $or: [
        { startISO: { $lte: endISO }, endISO: { $gte: startISO } },
      ],
    }).lean();
    if (clash) {
      return res.status(409).json({ message: "Overlaps an existing blackout." });
    }

    const doc = await MentorBlackout.create({
      mentorId,
      startISO,
      endISO,
      reason,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to create blackout" });
  }
});

// DELETE /api/mentor-blackouts/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await MentorBlackout.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to delete blackout" });
  }
});

module.exports = router;