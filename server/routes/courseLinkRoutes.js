// backend/routes/courseLinkRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Course = require("../models/Course");

// ---- helpers --------------------------------------------------------------
const escapeRegex = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Parse "MO-IT104 Computer Networks" -> { code: "MO-IT104", name: "Computer Networks" } */
function parseSubject(subject = "") {
  const s = String(subject).trim();
  const i = s.indexOf(" ");
  if (i === -1) return { code: s, name: "" };
  return { code: s.slice(0, i).trim(), name: s.slice(i + 1).trim() };
}

/** Very light Meet URL check (same as your frontend UX) */
function isLikelyMeetLink(url = "") {
  return typeof url === "string" && url.startsWith("https://meet.google.com/");
}

// ---- GET /api/courses/lookup?subject=..&section=.. ------------------------
// Finds a course by subject ("CODE Name") + section and returns id + link.
router.get("/lookup", async (req, res) => {
  try {
    const { subject = "", section = "" } = req.query;
    if (!subject || !section) {
      return res.status(400).json({ message: "subject and section are required" });
    }

    const { code, name } = parseSubject(subject);

    // case-insensitive exact matches for code, name, and section
    const q = {
      section: { $regex: `^${escapeRegex(section)}$`, $options: "i" },
    };
    if (code) q.courseCode = { $regex: `^${escapeRegex(code)}$`, $options: "i" };
    if (name) q.courseName = { $regex: `^${escapeRegex(name)}$`, $options: "i" };

    const course = await Course.findOne(q).select(
      "_id courseCode courseName section defaultMeetLink"
    );

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json({
      courseId: String(course._id),
      defaultMeetLink: course.defaultMeetLink || "",
      subject: `${course.courseCode || ""} ${course.courseName || ""}`.trim(),
      section: course.section || "",
    });
  } catch (e) {
    console.error("lookup failed:", e);
    return res.status(500).json({ message: e.message || "Lookup failed" });
  }
});

// ---- GET /api/courses/:id/link --------------------------------------------
router.get("/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const course = await Course.findById(id).select("defaultMeetLink");
    if (!course) return res.status(404).json({ message: "Course not found" });
    return res.json({ defaultMeetLink: course.defaultMeetLink || "" });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to read link" });
  }
});

// ---- PATCH /api/courses/:id/link  { defaultMeetLink } ----------------------
// NOTE: empty string is allowed and will CLEAR the link.
router.patch("/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    let raw = req.body?.defaultMeetLink;
    raw = typeof raw === "string" ? raw.trim() : "";

    // If provided and non-empty, validate it as a Meet link.
    if (raw && !isLikelyMeetLink(raw)) {
      return res.status(400).json({ message: "Please provide a valid Google Meet link." });
    }

    const result = await Course.updateOne({ _id: id }, { $set: { defaultMeetLink: raw } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json({ defaultMeetLink: raw });
  } catch (e) {
    console.error("PATCH link failed:", e);
    return res.status(500).json({ message: e.message || "Failed to save link" });
  }
});

// ---- DELETE /api/courses/:id/link ------------------------------------------
// Behavior: sets defaultMeetLink = "" (clears it)
router.delete("/:id/link", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const result = await Course.updateOne({ _id: id }, { $set: { defaultMeetLink: "" } });
    if (result.matchedCount === 0) {
      // Return 404 to be explicit; frontend treats 404 as OK for “already gone”
      return res.status(404).json({ message: "Course not found" });
    }

    // Return JSON (200) to make fetch() handling simple
    return res.json({ defaultMeetLink: "" });
  } catch (e) {
    console.error("DELETE link failed:", e);
    return res.status(500).json({ message: e.message || "Failed to remove link" });
  }
});

module.exports = router;