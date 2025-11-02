const router = require("express").Router();
const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const Course = require("../models/Course");
const Session = require("../models/Session");
const { protect, authorize } = require("../middleware/authMiddleware");
const authMiddleware = protect;

// ========== helpers ==========
async function resolveParties(sessionId) {
  const sess = await Session.findById(sessionId)
    .select(
      "mentorId mentor students participants attendees offeringID subjectCode subjectName section scheduleStart scheduleEnd topic status"
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
  return (
    sess.mentorId || (sess.mentor && (sess.mentor._id || sess.mentor)) || null
  );
}

// NEW: normalize to string for safe comparisons
const toId = (v) =>
  v && typeof v === "object" && v._id ? String(v._id) : v ? String(v) : "";

const sameId = (a, b) => toId(a) && toId(a) === toId(b);

// NEW: gather all student ids the server knows about for the session
async function getStudentIdsFromSession(sess) {
  const pick = (x) =>
    x?.user?._id ||
    x?.userId ||
    x?._id ||
    x?.id ||
    x?.studentId ||
    x?.studentID;
  const pools = [
    ...(Array.isArray(sess.students) ? sess.students : []),
    ...(Array.isArray(sess.participants)
      ? sess.participants.map((p) => p.user || p)
      : []),
    ...(Array.isArray(sess.attendees)
      ? sess.attendees
          .filter(
            (a) =>
              String(a?.role || a?.userRole || "").toLowerCase() === "student"
          )
          .map((a) => a.user || a)
      : []),
  ];
  const base = new Set(
    pools
      .map(pick)
      .filter(Boolean)
      .map((x) => String(x))
  );

  // Fallback: also include course roster (enrolled students) by offeringID
  const offeringId = sess.offeringID || sess.offeringId || null;
  if (offeringId && mongoose.isValidObjectId(offeringId)) {
    try {
      const course = await Course.findById(offeringId)
        .select("students")
        .lean();
      if (course && Array.isArray(course.students)) {
        for (const sid of course.students) base.add(String(sid));
      }
    } catch {}
  }

  return Array.from(base);
}

// NEW: simple gate checks
function assertMentorOfSession(sess, userId) {
  const mid = getMentorIdFromSession(sess);
  if (!mid || !sameId(mid, userId)) {
    const err = new Error("Only the assigned mentor may perform this action.");
    err.status = 403;
    throw err;
  }
}

async function assertStudentInSession(sess, userId) {
  const ids = await getStudentIdsFromSession(sess);
  if (!ids.includes(String(userId))) {
    const err = new Error("You are not part of this session.");
    err.status = 403;
    throw err;
  }
}

// NEW: optionally enforce “only after session end”
function assertSessionEndedIfRequired(sess) {
  const end = sess.scheduleEnd ? new Date(sess.scheduleEnd) : null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() > Date.now()) {
    const err = new Error("Feedback can be submitted after the session ends.");
    err.status = 400;
    throw err;
  }
}

/* ============ DRAFT: Student -> Mentor ============ */
router.post(
  "/student/draft",
  protect,
  authorize("student"),
  async (req, res) => {
    try {
      const { sessionId, notes, anonymous = false } = req.body || {};
      if (!sessionId || !notes)
        return res
          .status(400)
          .json({ message: "sessionId and notes are required" });
      if (!mongoose.isValidObjectId(sessionId))
        return res.status(400).json({ message: "Invalid sessionId" });

      const sess = await resolveParties(sessionId);
      await assertStudentInSession(sess, req.user._id); // NEW

      const mentorId = getMentorIdFromSession(sess);
      if (!mentorId)
        return res
          .status(400)
          .json({ message: "Session has no mentor assigned" });

      const filter = {
        session: sessionId,
        from: req.user._id,
        to: mentorId,
        role: "student",
      };
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
          subjectCode: sess.subjectCode,
          subjectName: sess.subjectName,
          section: sess.section,
          topic: sess.topic,
          sessionStart: sess.scheduleStart || null,
          sessionEnd: sess.scheduleEnd || null,
        },
      };

      const doc = await Feedback.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      });
      return res.status(200).json({ ok: true, feedback: doc });
    } catch (e) {
      return res
        .status(e.status || 500)
        .json({ message: e.message || "Failed to save draft" });
    }
  }
);

/* ============ FINALIZE: Student -> Mentor ============ */
router.post("/student", protect, authorize("student"), async (req, res) => {
  try {
    const { sessionId, notes, anonymous = false } = req.body || {};
    if (!sessionId || !notes)
      return res
        .status(400)
        .json({ message: "sessionId and notes are required" });
    if (!mongoose.isValidObjectId(sessionId))
      return res.status(400).json({ message: "Invalid sessionId" });

    const sess = await resolveParties(sessionId);
    await assertStudentInSession(sess, req.user._id); // NEW
    // assertSessionEndedIfRequired(sess); // OPTIONAL: uncomment to enforce

    const mentorId = getMentorIdFromSession(sess);
    if (!mentorId)
      return res
        .status(400)
        .json({ message: "Session has no mentor assigned" });

    const filter = {
      session: sessionId,
      from: req.user._id,
      to: mentorId,
      role: "student",
    };
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
        subjectCode: sess.subjectCode,
        subjectName: sess.subjectName,
        section: sess.section,
        topic: sess.topic,
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
    });
    return res.status(201).json({ ok: true, feedback: doc });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ message: e.message || "Failed to submit feedback" });
  }
});

/* ============ DRAFT: Mentor -> Student ============ */
router.post("/mentor/draft", protect, authorize("mentor"), async (req, res) => {
  try {
    const { sessionId, studentId, notes } = req.body || {};
    if (!sessionId || !studentId || !notes)
      return res
        .status(400)
        .json({ message: "sessionId, studentId, notes required" });
    if (
      !mongoose.isValidObjectId(sessionId) ||
      !mongoose.isValidObjectId(studentId)
    ) {
      return res.status(400).json({ message: "Invalid ids" });
    }
    const sess = await resolveParties(sessionId);
    assertMentorOfSession(sess, req.user._id); // NEW

    const rosterIds = await getStudentIdsFromSession(sess); // NEW
    if (!rosterIds.includes(String(studentId))) {
      return res.status(400).json({ message: "Student not in session roster" });
    }

    const filter = {
      session: sessionId,
      from: req.user._id,
      to: studentId,
      role: "mentor",
    };
    const update = {
      $set: {
        session: sessionId,
        from: req.user._id,
        to: studentId,
        role: "mentor",
        notes,
        anonymous: false,
        finalized: false,
        visibleToRecipientAt: null,
        subjectCode: sess.subjectCode,
        subjectName: sess.subjectName,
        section: sess.section,
        topic: sess.topic,
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
    });
    return res.status(200).json({ ok: true, feedback: doc });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ message: e.message || "Failed to save draft" });
  }
});

/* ============ FINALIZE: Mentor -> Student ============ */
router.post("/mentor", protect, authorize("mentor"), async (req, res) => {
  try {
    const { sessionId, studentId, notes } = req.body || {};
    if (!sessionId || !studentId || !notes)
      return res
        .status(400)
        .json({ message: "sessionId, studentId, notes required" });
    if (
      !mongoose.isValidObjectId(sessionId) ||
      !mongoose.isValidObjectId(studentId)
    ) {
      return res.status(400).json({ message: "Invalid ids" });
    }
    const sess = await resolveParties(sessionId);
    assertMentorOfSession(sess, req.user._id); // NEW
    // assertSessionEndedIfRequired(sess); // OPTIONAL: uncomment to enforce

    const rosterIds = await getStudentIdsFromSession(sess); // NEW
    if (!rosterIds.includes(String(studentId))) {
      return res.status(400).json({ message: "Student not in session roster" });
    }

    const filter = {
      session: sessionId,
      from: req.user._id,
      to: studentId,
      role: "mentor",
    };
    const update = {
      $set: {
        session: sessionId,
        from: req.user._id,
        to: studentId,
        role: "mentor",
        notes,
        anonymous: false,
        finalized: true,
        visibleToRecipientAt: new Date(),
        subjectCode: sess.subjectCode,
        subjectName: sess.subjectName,
        section: sess.section,
        topic: sess.topic,
        sessionStart: sess.scheduleStart || null,
        sessionEnd: sess.scheduleEnd || null,
      },
    };

    const doc = await Feedback.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
    });
    return res.status(201).json({ ok: true, feedback: doc });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ message: e.message || "Failed to submit feedback" });
  }
});

/* ============ Mine (tabs) ============ */
router.get("/mine", protect, async (req, res) => {
  try {
    // NOTE: we accept ?as=mentor|student but return the same shape either way.
    // The UI filters on the client side.
    const submitted = await Feedback.find({ from: req.user._id })
      .sort("-createdAt")
      .populate("to", "name fullName firstName lastName email") // NEW: light populate
      .lean();

    // Include all finalized-to-me feedback, even older ones that may not have
    // set visibleToRecipientAt (legacy records)
    const received = await Feedback.find({
      to: req.user._id,
      finalized: true,
      visibleToRecipientAt: { $ne: null },
    })
      .sort("-visibleToRecipientAt -createdAt")
      .populate("from", "name fullName firstName lastName email") // NEW: light populate
      .lean();

    return res.json({ submitted, received });
  } catch (e) {
    return res
      .status(500)
      .json({ message: e.message || "Failed to fetch feedback" });
  }
});

/* ============ Mark read (optional) ============ */
router.patch("/:id/read", protect, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const doc = await Feedback.findOneAndUpdate(
      { _id: id, to: req.user._id, finalized: true },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true, feedback: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: e.message || "Failed to mark as read" });
  }
});

module.exports = router;