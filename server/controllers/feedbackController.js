// controllers/feedbackController.js
const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const Session = require("../models/Session");

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
const validId = (v) => mongoose.isValidObjectId(v);

async function loadSessionLean(sessionId) {
  const sess = await Session.findById(sessionId)
    .select(
      "mentorId mentor students offeringID subjectCode subjectName section scheduleStart scheduleEnd topic status"
    )
    .lean();
  if (!sess) {
    const err = new Error("Session not found");
    err.status = 404;
    throw err;
  }
  return sess;
}

function getMentorIdFromSession(sess) {
  // support mentorId as ObjectId, string, or populated object
  return (
    sess.mentorId ||
    (sess.mentor && (sess.mentor._id || sess.mentor)) ||
    null
  );
}

function toIdString(v) {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
  }
  return String(v);
}

// ───────────────────────────────────────────────────────────────────────────────
// Controller actions
// ───────────────────────────────────────────────────────────────────────────────

// ===== Student → Mentor =====
exports.studentDraft = async (req, res) => {
  try {
    const { sessionId, notes, anonymous = false } = req.body || {};
    if (!sessionId || !notes)
      return res.status(400).json({ message: "sessionId and notes are required" });
    if (!validId(sessionId))
      return res.status(400).json({ message: "Invalid sessionId" });

    const sess = await loadSessionLean(sessionId);
    const mentorId = getMentorIdFromSession(sess);
    if (!mentorId) return res.status(400).json({ message: "Session has no mentor assigned" });

    const filter = { session: sessionId, from: req.user._id, to: mentorId, role: "student" };
    const update = {
      $set: {
        session: sessionId,
        from: req.user._id,
        to: mentorId,
        role: "student",
        notes,
        anonymous: !!anonymous,
        finalized: false,
        visibleToRecipientAt: null,
        subjectCode: sess.subjectCode || undefined,
        subjectName: sess.subjectName || undefined,
        section: sess.section || undefined,
        topic: sess.topic || "",
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, { upsert: true, new: true });
    return res.status(200).json({ ok: true, feedback: doc });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to save draft" });
  }
};

exports.studentSubmit = async (req, res) => {
  try {
    const { sessionId, notes, anonymous = false } = req.body || {};
    if (!sessionId || !notes)
      return res.status(400).json({ message: "sessionId and notes are required" });
    if (!validId(sessionId))
      return res.status(400).json({ message: "Invalid sessionId" });

    const sess = await loadSessionLean(sessionId);
    const mentorId = getMentorIdFromSession(sess);
    if (!mentorId) return res.status(400).json({ message: "Session has no mentor assigned" });

    const filter = { session: sessionId, from: req.user._id, to: mentorId, role: "student" };
    const update = {
      $set: {
        session: sessionId,
        from: req.user._id,
        to: mentorId,
        role: "student",
        notes,
        anonymous: !!anonymous,
        finalized: true,
        visibleToRecipientAt: new Date(),
        subjectCode: sess.subjectCode || undefined,
        subjectName: sess.subjectName || undefined,
        section: sess.section || undefined,
        topic: sess.topic || "",
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, { upsert: true, new: true });
    return res.status(201).json({ ok: true, feedback: doc });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to submit feedback" });
  }
};

// ===== Mentor → Student =====
exports.mentorDraft = async (req, res) => {
  try {
    const from = req.user && req.user._id;
    const { sessionId, studentId, notes = "" } = req.body || {};
    if (!from) return res.status(401).json({ message: "Not authorized" });
    if (!validId(sessionId) || !validId(studentId))
      return res.status(400).json({ message: "Invalid sessionId or studentId" });

    const sess = await loadSessionLean(sessionId);

    const filter = { session: sess._id, from, to: studentId, role: "mentor" };
    const update = {
      $set: {
        session: sess._id,
        from,
        to: studentId,
        role: "mentor",
        notes,
        anonymous: false,
        finalized: false,
        visibleToRecipientAt: null,
        subjectCode: sess.subjectCode || undefined,
        subjectName: sess.subjectName || undefined,
        section: sess.section || undefined,
        topic: sess.topic || "",
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.status(200).json({ ok: true, feedback: doc });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to save draft" });
  }
};

exports.mentorSubmit = async (req, res) => {
  try {
    const from = req.user && req.user._id;
    const { sessionId, studentId, notes = "" } = req.body || {};
    if (!from) return res.status(401).json({ message: "Not authorized" });
    if (!validId(sessionId) || !validId(studentId))
      return res.status(400).json({ message: "Invalid sessionId or studentId" });

    const sess = await loadSessionLean(sessionId);

    const filter = { session: sess._id, from, to: studentId, role: "mentor" };
    const update = {
      $set: {
        session: sess._id,
        from,
        to: studentId,
        role: "mentor",
        notes,
        anonymous: false,
        finalized: true,
        visibleToRecipientAt: new Date(),
        subjectCode: sess.subjectCode || undefined,
        subjectName: sess.subjectName || undefined,
        section: sess.section || undefined,
        topic: sess.topic || "",
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.status(201).json({ ok: true, feedback: doc });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to submit mentor feedback" });
  }
};

// ===== Mine (tabs) =====
// GET /api/feedback/mine?box=submitted|received|all&as=mentor|student (as is optional; kept for frontend parity)
exports.mine = async (req, res) => {
  try {
    const uid = req.user && req.user._id;
    if (!uid) return res.status(401).json({ message: "Not authorized" });

    // keep API stable for your frontend; we return both, always
    const [submitted, received] = await Promise.all([
      Feedback.find({ from: uid })
        .populate("session", "offeringID mentorId scheduleStart scheduleEnd topic status")
        .populate("to", "name email")
        .lean(),
      Feedback.find({
        to: uid,
        finalized: true,
        visibleToRecipientAt: { $ne: null },
      })
        .populate("session", "offeringID mentorId scheduleStart scheduleEnd topic status")
        .populate("from", "name email")
        .sort("-visibleToRecipientAt -createdAt")
        .lean(),
    ]);

    return res.json({ submitted, received });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to fetch feedback" });
  }
};

// GET /api/feedback/session/:id
exports.forSession = async (req, res) => {
  try {
    const sid = req.params.id;
    if (!validId(sid)) return res.status(400).json({ message: "Invalid session id" });

    const sess = await Session.findById(sid).lean();
    if (!sess) return res.status(404).json({ message: "Session not found" });

    // Simple visibility: mentors see all; students see feedback where (from==me or to==me)
    const roleLower = String(req.user?._roleNameLower || req.user?.roleName || "")
      .toLowerCase();
    let filter = { session: sid };
    if (!roleLower.includes("mentor") && !roleLower.includes("teacher") && !roleLower.includes("instructor")) {
      filter = { session: sid, $or: [{ from: req.user._id }, { to: req.user._id }] };
    }

    const list = await Feedback.find(filter)
      .populate("from", "name email")
      .populate("to", "name email")
      .lean();

    return res.json({ items: list });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to fetch session feedback" });
  }
};

// PATCH /api/feedback/:id/read
exports.markRead = async (req, res) => {
  try {
    const id = req.params.id;
    if (!validId(id)) return res.status(400).json({ message: "Invalid id" });

    const doc = await Feedback.findOneAndUpdate(
      { _id: id, to: req.user._id, finalized: true },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true, feedback: doc });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to mark as read" });
  }
};