const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { isValidObjectId, Types } = require("mongoose");

const Session = require("../models/Session");
const Course = require("../models/Course");
const User = require("../models/User");

// all endpoints require auth
router.use(protect);

// helpers
const toIdString = (v) => (v ? String(v) : "");
const pickId = (v) => (v && v._id ? v._id : v);

const nameFromUser = (u) => {
  if (!u) return "";
  const firstLast = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return (
    u.name ||
    u.fullName ||
    firstLast ||
    u.displayName ||
    u.username ||
    u.email ||
    ""
  ).trim();
};

// Normalize topic coming from various FE shapes
const pickTopic = (body = {}) => {
  if (typeof body.topic === "string") return body.topic.trim();
  if (typeof body.sessionTopic === "string") return body.sessionTopic.trim();
  if (Array.isArray(body.topics) && body.topics[0])
    return String(body.topics[0]).trim();
  return "";
};

// Collect participant user IDs from either ids or emails; filter to enrolled
async function collectParticipantIds(course, body) {
  const enrolled = new Set((course.students || []).map((x) => String(x)));

  let ids = [];
  if (Array.isArray(body.participants)) {
    ids.push(
      ...body.participants
        .map((x) => String(pickId(x)))
        .filter((id) => isValidObjectId(id))
    );
  }

  if (Array.isArray(body.participantEmails) && body.participantEmails.length) {
    const emails = body.participantEmails
      .map((e) => String(e || "").toLowerCase())
      .filter(Boolean);
    if (emails.length) {
      const users = await User.find({ email: { $in: emails } })
        .select("_id")
        .lean();
      ids.push(...users.map((u) => String(u._id)));
    }
  }

  // unique + filter to students enrolled in the course
  ids = [...new Set(ids)].filter((id) => enrolled.has(id));
  return ids;
}

// Robustly extract "booked" participant IDs from subdocs OR legacy formats
const extractBookedUserIds = (s) => {
  const out = [];
  (s.participants || []).forEach((p) => {
    if (!p) return;

    // Preferred subdoc shape { user, status }
    if (p.user) {
      if (p.status && p.status !== "booked") return;
      if (isValidObjectId(p.user)) out.push(String(p.user));
      return;
    }

    // Legacy shapes: direct ObjectId or {_id}
    if (isValidObjectId(p)) {
      out.push(String(p));
      return;
    }
    if (p._id && isValidObjectId(p._id)) {
      out.push(String(p._id));
    }
  });

  // Fallback: if nothing found, include creator so FE shows at least one name
  if (!out.length && s.createdBy && isValidObjectId(s.createdBy)) {
    out.push(String(s.createdBy));
  }

  return [...new Set(out)];
};

// shape response to match UI
const shape = (s, usersById = new Map()) => {
  const bookedIds = extractBookedUserIds(s);
  const studentNames = bookedIds
    .map((id) => usersById.get(String(id)))
    .filter(Boolean)
    .map((u) => nameFromUser(u));

  return {
    sessionId: s.sessionId || String(s._id),
    offeringID: pickId(s.offeringID),
    mentorId: pickId(s.mentorId),
    createdBy: pickId(s.createdBy),
    scheduleStart: s.scheduleStart,
    scheduleEnd: s.scheduleEnd,
    meetLink: s.meetLink || "",
    status: s.status,
    cancelledBy: pickId(s.cancelledBy) || null,
    cancelReason: s.cancelReason || "",
    rescheduledFrom: s.rescheduledFrom || "",
    rescheduleRequestedBy: pickId(s.rescheduleRequestedBy) || null,
    rescheduleReason: s.rescheduleReason || "",
    topic: s.topic || "",
    recordingUrl: s.recordingUrl || "",     // ✅ include for FE
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,

    // group bits
    capacity: s.capacity,
    isGroup: s.isGroup,
    participants: bookedIds, // return participant IDs used for name lookup
    students: studentNames,
    studentNames,

    // FE alias compatibility
    courseId: pickId(s.offeringID),
    startISO: s.scheduleStart,
    endISO: s.scheduleEnd,
  };
};

/**
 * GET /api/sessions/mine
 *
 * Role-agnostic by default:
 *  - returns sessions where the user is the mentor OR creator OR a participant.
 * Optional: force a perspective with ?as=mentor or ?as=student
 */
router.get("/mine", async (req, res) => {
  try {
    const uid = new Types.ObjectId(String(req.user._id));
    const asParam = String(req.query.as || "").toLowerCase();

    let filter;
    if (asParam === "mentor") {
      filter = { mentorId: uid };
    } else if (asParam === "student") {
      filter = {
        $or: [
          { createdBy: uid },
          { "participants.user": uid }, // subdoc
          { participants: uid }, // legacy array of ObjectIds
          { "participants._id": uid }, // legacy array of {_id}
        ],
      };
    } else {
      // Default: union of both
      filter = {
        $or: [
          { mentorId: uid },
          { createdBy: uid },
          { "participants.user": uid },
          { participants: uid },
          { "participants._id": uid },
        ],
      };
    }

    const sessions = await Session.find(filter)
      .sort({ scheduleStart: 1 })
      .lean();

    // Collect participant & creator ids for name lookup
    const uidSet = new Set();
    sessions.forEach((s) => {
      if (s.createdBy && isValidObjectId(s.createdBy)) {
        uidSet.add(String(s.createdBy));
      }
      (s.participants || []).forEach((p) => {
        if (!p) return;
        // subdoc shape { user, ... }
        if (p.user && isValidObjectId(p.user)) {
          uidSet.add(String(p.user));
          return;
        }
        // legacy: direct ObjectId
        if (isValidObjectId(p)) {
          uidSet.add(String(p));
          return;
        }
        // legacy: {_id}
        if (p._id && isValidObjectId(p._id)) {
          uidSet.add(String(p._id));
        }
      });
    });

    let usersById = new Map();
    if (uidSet.size) {
      try {
        const users = await User.find({ _id: { $in: [...uidSet] } })
          .select("name fullName firstName lastName displayName username email")
          .lean();
        usersById = new Map(users.map((u) => [String(u._id), u]));
      } catch (e) {
        console.warn("User lookup failed in /sessions/mine:", e?.message || e);
      }
    }

    res.json(sessions.map((s) => shape(s, usersById)));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to fetch sessions" });
  }
});

// PATCH /api/sessions/:id/recording  (mentor/admin can set/clear recording URL any time)
router.patch("/:id/recording", async (req, res) => {
  try {
    const { id } = req.params;
    const me = req.user._id;
    const role = req?.user?.roleId?.roleName;

    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    // only mentor of this session or admin
    const isMentorOfSession = String(s.mentorId) === String(me);
    const isAdmin = role === "admin";
    if (!isMentorOfSession && !isAdmin) {
      return res.status(403).json({ message: "Not allowed to update recording" });
    }

    const raw = (req.body?.recordingUrl ?? "").toString().trim();
    s.recordingUrl = raw; // empty string clears it
    await s.save();

    return res.json({ ok: true, recordingUrl: s.recordingUrl });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to set recording" });
  }
});

// POST /api/sessions  (student creates)
router.post("/", async (req, res) => {
  try {
    const createdBy = req.user._id;
    const {
      offeringID,
      courseId, // FE alias
      mentorId,
      scheduleStart,
      scheduleEnd,
      startISO, // FE alias
      endISO, // FE alias
      durationMin = 60, // optional fallback
      meetLink, // optional override
      capacity: capIncoming, // respect capacity from FE if given
    } = req.body || {};

    const topic = pickTopic(req.body);

    const offering = offeringID || courseId;
    if (!offering || !mentorId) {
      return res
        .status(400)
        .json({ message: "offeringID/courseId and mentorId are required" });
    }

    const course = await Course.findById(offering).lean();
    if (!course)
      return res.status(404).json({ message: "Offering/Course not found" });

    const start = new Date(scheduleStart || startISO);
    if (isNaN(start.getTime()))
      return res
        .status(400)
        .json({ message: "Invalid scheduleStart/startISO" });

    const end =
      scheduleEnd || endISO
        ? new Date(scheduleEnd || endISO)
        : new Date(
            start.getTime() + (parseInt(durationMin, 10) || 60) * 60 * 1000
          );
    if (isNaN(new Date(end).getTime()))
      return res.status(400).json({ message: "Invalid scheduleEnd/endISO" });

    // Collect and validate participants against course roster
    let memberIds = await collectParticipantIds(course, req.body);

    // Always include the creator in the participants list
    const allIdsSet = new Set([String(createdBy), ...memberIds]);
    const allIds = [...allIdsSet];

    // Decide capacity: explicit from FE, or default to group size
    const capacity =
      Math.max(1, parseInt(capIncoming, 10) || (1 + memberIds.length));

    const doc = await Session.create({
      offeringID: offering,
      mentorId,
      createdBy,
      scheduleStart: start,
      scheduleEnd: end,
      meetLink: meetLink || course.defaultMeetLink || "",
      status: "pending",
      topic,
      capacity,
      // store participants as subdocs
      participants: allIds.map((id) => ({ user: id, status: "booked" })),
    });

    // Return shaped object incl. names
    const users = await User.find({ _id: { $in: allIds } })
      .select("name fullName firstName lastName displayName username email")
      .lean();
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    res.status(201).json(shape(doc.toObject(), usersById));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to create session" });
  }
});

// PATCH /api/sessions/:id
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const me = req.user._id;

    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    const isOwner = String(s.createdBy) === String(me);
    const role = req?.user?.roleId?.roleName;
    const isMentor = role === "mentor" || role === "admin";
    if (!isOwner && !isMentor) {
      return res
        .status(403)
        .json({ message: "Not allowed to edit this session" });
    }
    if (s.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending sessions can be edited" });
    }

    const {
      scheduleStart,
      scheduleEnd,
      startISO, // FE alias
      endISO, // FE alias
      status, // optional status advance
      rescheduleReason,
      capacity: capIncoming, // NEW
    } = req.body || {};

    // topic can be updated too
    const topic = pickTopic(req.body);
    if (typeof topic === "string" && topic.length) {
      s.topic = topic;
    }

    if (scheduleStart || startISO) {
      const start = new Date(scheduleStart || startISO);
      if (isNaN(start.getTime()))
        return res.status(400).json({ message: "Invalid scheduleStart" });
      s.scheduleStart = start;
    }
    if (scheduleEnd || endISO) {
      const end = new Date(scheduleEnd || endISO);
      if (isNaN(end.getTime()))
        return res.status(400).json({ message: "Invalid scheduleEnd" });
      s.scheduleEnd = end;
    }

    if (
      status &&
      ["pending", "cancelled", "completed", "rescheduled"].includes(status)
    ) {
      s.status = status;
      if (status === "rescheduled") {
        s.rescheduleRequestedBy = me;
        if (rescheduleReason) s.rescheduleReason = rescheduleReason;
      }
    }

    // Optional: update capacity
    if (capIncoming !== undefined) {
      const cap = Math.max(1, parseInt(capIncoming, 10) || 1);
      s.capacity = cap;
    }

    // Optional: replace participants (ids or emails)
    if (
      (Array.isArray(req.body.participants) && req.body.participants.length) ||
      (Array.isArray(req.body.participantEmails) &&
        req.body.participantEmails.length)
    ) {
      const course = await Course.findById(s.offeringID).lean();
      const memberIds = await collectParticipantIds(course, req.body);

      // Always include creator
      const allIds = [...new Set([String(s.createdBy), ...memberIds])];
      s.participants = allIds.map((id) => ({ user: id, status: "booked" }));

      // If capacity wasn't explicitly provided in this PATCH and current capacity
      // is smaller than participant count, bump it to fit.
      if (capIncoming === undefined && (s.capacity || 1) < allIds.length) {
        s.capacity = allIds.length;
      }
    }

    await s.save();

    const idsForNames = (s.participants || [])
      .map((p) =>
        p?.user
          ? String(p.user)
          : isValidObjectId(p)
          ? String(p)
          : p?._id
          ? String(p._id)
          : null
      )
      .filter(Boolean);

    const users = idsForNames.length
      ? await User.find({ _id: { $in: idsForNames } })
          .select(
            "name fullName firstName lastName displayName username email"
          )
          .lean()
      : [];
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    res.json(shape(s.toObject(), usersById));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update session" });
  }
});

// DELETE /api/sessions/:id  -> soft-cancel (set status=cancelled)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const me = req.user._id;

    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    const isOwner = String(s.createdBy) === String(me);
    const role = req?.user?.roleId?.roleName;
    const isMentor = role === "mentor" || role === "admin";
    if (!isOwner && !isMentor) {
      return res
        .status(403)
        .json({ message: "Not allowed to cancel this session" });
    }
    // Allow cancelling when status is pending or rescheduled (policy)
    if (!["pending", "rescheduled"].includes(s.status)) {
      return res
        .status(400)
        .json({
          message: "Only pending or rescheduled sessions can be cancelled",
        });
    }

    // Enforce 24-hour window
    const start = s.scheduleStart ? new Date(s.scheduleStart) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid session start time" });
    }
    const hoursUntil = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return res.status(400).json({
        message:
          "Cancellations are allowed up to 24 hours before the session start time",
      });
    }

    const reason =
      (req.body && req.body.reason) ||
      (req.query && req.query.reason) ||
      "";
    s.status = "cancelled";
    s.cancelledBy = me;
    s.cancelReason = reason;
    await s.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to cancel session" });
  }
});

module.exports = router;