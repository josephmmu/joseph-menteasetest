// routes/sessionRoutes.js
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const { isValidObjectId, Types } = require("mongoose");
const sessionController = require("../controllers/sessionController");

const Session = require("../models/Session");
const Course = require("../models/Course");
const User = require("../models/User");

// all endpoints require auth
router.use(protect);

// helpers
const pickId = (v) => (v && v._id ? v._id : v);
const getRoleLower = (u = {}) =>
  String(u?.roleId?.roleName || u?.roleName || u?.role || "").toLowerCase();
const isAdminUser = (u) => getRoleLower(u) === "admin";
const isSessionMentor = (u, s) => String(s?.mentorId) === String(u?._id);
const isSessionOwner = (u, s) => String(s?.createdBy) === String(u?._id);

const nameFromUser = (u) => {
  if (!u) return "";
  const firstLast = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return (u.name || u.fullName || firstLast || u.displayName || u.username || u.email || "").trim();
};

const pickTopic = (body = {}) => {
  if (typeof body.topic === "string") return body.topic.trim();
  if (typeof body.sessionTopic === "string") return body.sessionTopic.trim();
  if (Array.isArray(body.topics) && body.topics[0]) return String(body.topics[0]).trim();
  return "";
};

async function collectParticipantIds(course, body) {
  const enrolled = new Set((course.students || []).map((x) => String(x)));
  let ids = [];
  if (Array.isArray(body.participants)) {
    ids.push(
      ...body.participants
        .map((x) => String((x && x._id) || x))
        .filter((id) => isValidObjectId(id))
    );
  }
  if (Array.isArray(body.participantEmails) && body.participantEmails.length) {
    const emails = body.participantEmails.map((e) => String(e || "").toLowerCase()).filter(Boolean);
    if (emails.length) {
      const users = await User.find({ email: { $in: emails } }).select("_id").lean();
      ids.push(...users.map((u) => String(u._id)));
    }
  }
  ids = [...new Set(ids)].filter((id) => enrolled.has(id));
  return ids;
}

const extractBookedUserIds = (s) => {
  const out = [];
  (s.participants || []).forEach((p) => {
    if (!p) return;
    if (p.user) {
      if (p.status && p.status !== "booked") return;
      if (isValidObjectId(p.user)) out.push(String(p.user));
      return;
    }
    if (isValidObjectId(p)) {
      out.push(String(p));
      return;
    }
    if (p._id && isValidObjectId(p._id)) {
      out.push(String(p._id));
    }
  });
  if (!out.length && s.createdBy && isValidObjectId(s.createdBy)) {
    out.push(String(s.createdBy));
  }
  return [...new Set(out)];
};

// ---------- NORMALIZER: return FE-friendly participants ----------
const normalizeParticipants = (s, usersById = new Map()) => {
  const raw = Array.isArray(s.participants) ? s.participants : [];
  const mentorIdStr = String(pickId(s.mentorId) || "");

  // Normalize to { user: <id>, status, name, role }
  const objs = raw
    .map((p) => {
      const rawId = p?.user ?? p?._id ?? p;
      const idStr = isValidObjectId(rawId) ? String(rawId) : null;
      if (!idStr) return null;
      const status = (p?.status || "booked").toLowerCase();
      const role = idStr === mentorIdStr ? "mentor" : "student";
      const u = usersById.get(idStr);
      const name = nameFromUser(u) || (role === "mentor" ? "Mentor" : "Student");
      return { user: idStr, status, name, role };
    })
    .filter(Boolean);

  // Booked-only lists
  const booked = objs.filter((o) => o.status === "booked");
  const bookedStudents = booked.filter((o) => o.role !== "mentor");

  return {
    participants: booked, // [{ user, status: 'booked', name, role }]
    studentsDetailed: bookedStudents.map((o) => ({ id: o.user, name: o.name })), // [{id,name}]
    students: bookedStudents.map((o) => o.name), // [name]
    studentIds: bookedStudents.map((o) => o.user), // [id]
  };
};

// 🔧 shape(): keep your existing fields, add mentorName, normalized participants
const shape = (s, usersById = new Map()) => {
  const {
    participants,
    studentsDetailed,
    students,
    studentIds,
  } = normalizeParticipants(s, usersById);

  const mentorUser = usersById.get(String(s.mentorId));
  const mentorName = nameFromUser(mentorUser);

  return {
    sessionId: s.sessionId || String(s._id),
    offeringID: pickId(s.offeringID),
    mentorId: pickId(s.mentorId),
    mentorName, // ✅ NEW

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
    recordingUrl: s.recordingUrl || "",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,

    capacity: s.capacity,
    isGroup: s.isGroup,

    // ✅ FE-friendly participation info
    participants,                // [{ user, status, name, role }]
    studentsDetailed,            // [{ id, name }]
    students,                    // [name] (back-compat)
    studentNames: students,      // (alias/back-compat)
    studentIds,                  // [id]

    courseId: pickId(s.offeringID),
    startISO: s.scheduleStart,
    endISO: s.scheduleEnd,

    notes: s.notes || { topicsDiscussed: "", nextSteps: "" },
  };
};

/* =========================
   NOTES (embedded in Session)
   ========================= */
router.get("/:id/notes", async (req, res) => {
  try {
    const s = await Session.findById(req.params.id).select("notes").lean();
    if (!s) return res.status(404).json({ message: "Session not found" });
    res.json({ notes: s.notes || {} });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to load notes" });
  }
});

router.patch("/:id/notes", async (req, res) => {
  try {
    const { id } = req.params;
    const { topicsDiscussed = "", nextSteps = "" } = req.body || {};
    const now = new Date();

    const s = await Session.findByIdAndUpdate(
      id,
      {
        $set: {
          "notes.topicsDiscussed": String(topicsDiscussed ?? ""),
          "notes.nextSteps": String(nextSteps ?? ""),
          "notes.lastEditedAt": now,
          "notes.lastEditedBy": req.user?._id || null,
          "notes.lastEditedByName": req.user?.name || "",
        },
      },
      { new: true, projection: { notes: 1 } }
    );
    if (!s) return res.status(404).json({ message: "Session not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(String(id)).emit("session:notes", {
        sessionId: String(id),
        notes: s.notes,
      });
    }
    res.json({ notes: s.notes });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update notes" });
  }
});

/* =========================
   LIST & UTILS
   ========================= */
router.get("/", async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({ message: "Admin only" });
    }

    const { year, term } = req.query;
    const sessions = await Session.find({})
      .populate({
        path: "offeringID",
        select: "courseCode courseName section program schoolYear term mentorId defaultMeetLink",
      })
      .lean();

    const filtered = sessions.filter((s) => {
      if (year && String(s.offeringID?.schoolYear) !== String(year)) return false;
      if (term && String(s.offeringID?.term) !== String(term)) return false;
      return true;
    });

    const uidSet = new Set();
    filtered.forEach((s) => {
      if (s.mentorId && isValidObjectId(s.mentorId)) uidSet.add(String(s.mentorId));
      if (s.createdBy && isValidObjectId(s.createdBy)) uidSet.add(String(s.createdBy));
      (s.participants || []).forEach((p) => {
        const id = p?.user ?? p?._id ?? p;
        if (isValidObjectId(id)) uidSet.add(String(id));
      });
    });

    const users = uidSet.size
      ? await User.find({ _id: { $in: [...uidSet] } })
          .select("name fullName firstName lastName displayName username email")
          .lean()
      : [];
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    const shaped = filtered.map((s) => {
      const shapedRow = shape(s, usersById);
      const c = s.offeringID || {};
      const programLabel =
        (c.program && typeof c.program === "object")
          ? (c.program.code || c.program.name || c.program.title || c.program.short || "")
          : (c.program || "");

      return {
        ...shapedRow,
        program: programLabel,
        schoolYear: c.schoolYear || null,
        term: c.term || null,
        subject: (c.courseCode ? `${c.courseCode} ` : "") + (c.courseName || "Course"),
        section: c.section || "",
      };
    });

    res.json(shaped);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to fetch sessions" });
  }
});

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
          { "participants.user": uid },
          { participants: uid },
          { "participants._id": uid },
        ],
      };
    } else {
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

    const sessions = await Session.find(filter).sort({ scheduleStart: 1 }).lean();

    const uidSet = new Set();
    sessions.forEach((s) => {
      if (s.mentorId && isValidObjectId(s.mentorId)) uidSet.add(String(s.mentorId));
      if (s.createdBy && isValidObjectId(s.createdBy)) uidSet.add(String(s.createdBy));
      (s.participants || []).forEach((p) => {
        const id = p?.user ?? p?._id ?? p;
        if (isValidObjectId(id)) uidSet.add(String(id));
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

router.get("/:id/roster", protect, authorize("mentor", "student", "admin"), sessionController.getRoster);
router.get("/:id/attendees", protect, authorize("mentor", "student", "admin"), sessionController.getRoster); // alias
router.get("/roster", protect, authorize("mentor", "student", "admin"), sessionController.getRosterByQuery);

router.patch("/:id/recording", async (req, res) => {
  try {
    const { id } = req.params;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    if (!isSessionMentor(req.user, s) && !isAdminUser(req.user)) {
      return res.status(403).json({ message: "Not allowed to update recording" });
    }

    const raw = (req.body?.recordingUrl ?? "").toString().trim();
    s.recordingUrl = raw;
    await s.save();

    return res.json({ ok: true, recordingUrl: s.recordingUrl });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to set recording" });
  }
});

router.post("/", async (req, res) => {
  try {
    const createdBy = req.user._id;
    const {
      offeringID,
      courseId,
      mentorId,
      scheduleStart,
      scheduleEnd,
      startISO,
      endISO,
      durationMin = 60,
      meetLink,
      capacity: capIncoming,
    } = req.body || {};

    const topic = pickTopic(req.body);
    const offering = offeringID || courseId;
    if (!offering || !mentorId) {
      return res.status(400).json({ message: "offeringID/courseId and mentorId are required" });
    }

    const course = await Course.findById(offering).lean();
    if (!course) return res.status(404).json({ message: "Offering/Course not found" });

    const start = new Date(scheduleStart || startISO);
    if (isNaN(start.getTime())) return res.status(400).json({ message: "Invalid scheduleStart/startISO" });

    const end =
      scheduleEnd || endISO
        ? new Date(scheduleEnd || endISO)
        : new Date(start.getTime() + (parseInt(durationMin, 10) || 60) * 60 * 1000);
    if (isNaN(new Date(end).getTime())) return res.status(400).json({ message: "Invalid scheduleEnd/endISO" });

    let memberIds = await collectParticipantIds(course, req.body);
    const allIdsSet = new Set([String(createdBy), ...memberIds]);
    const allIds = [...allIdsSet];

    const capacity = Math.max(1, parseInt(capIncoming, 10) || (1 + memberIds.length));

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
      participants: allIds.map((id) => ({ user: id, status: "booked" })),
    });

    // collect names (mentor + participants)
    const idsForNames = [...new Set([...allIds, String(mentorId)])].filter((x) => isValidObjectId(x));
    const users = idsForNames.length
      ? await User.find({ _id: { $in: idsForNames } })
          .select("name fullName firstName lastName displayName username email")
          .lean()
      : [];
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    res.status(201).json(shape(doc.toObject(), usersById));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to create session" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    const allowed =
      isSessionOwner(req.user, s) || isSessionMentor(req.user, s) || isAdminUser(req.user);
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to edit this session" });
    }

    if (s.status !== "pending") {
      return res.status(400).json({ message: "Only pending sessions can be edited" });
    }

    const {
      scheduleStart,
      scheduleEnd,
      startISO,
      endISO,
      status,
      rescheduleReason,
      capacity: capIncoming,
    } = req.body || {};

    const topic = pickTopic(req.body);
    if (typeof topic === "string" && topic.length) s.topic = topic;

    if (scheduleStart || startISO) {
      const start = new Date(scheduleStart || startISO);
      if (isNaN(start.getTime())) return res.status(400).json({ message: "Invalid scheduleStart" });
      s.scheduleStart = start;
    }
    if (scheduleEnd || endISO) {
      const end = new Date(scheduleEnd || endISO);
      if (isNaN(end.getTime())) return res.status(400).json({ message: "Invalid scheduleEnd" });
      s.scheduleEnd = end;
    }

    if (status && ["pending", "cancelled", "completed", "rescheduled"].includes(status)) {
      s.status = status;
      if (status === "rescheduled") {
        s.rescheduleRequestedBy = req.user._id;
        if (rescheduleReason) s.rescheduleReason = rescheduleReason;
      }
    }

    if (capIncoming !== undefined) {
      const cap = Math.max(1, parseInt(capIncoming, 10) || 1);
      s.capacity = cap;
    }

    if (
      (Array.isArray(req.body.participants) && req.body.participants.length) ||
      (Array.isArray(req.body.participantEmails) && req.body.participantEmails.length)
    ) {
      const course = await Course.findById(s.offeringID).lean();
      const memberIds = await collectParticipantIds(course, req.body);
      const allIds = [...new Set([String(s.createdBy), ...memberIds])];
      s.participants = allIds.map((id) => ({ user: id, status: "booked" }));
      if (capIncoming === undefined && (s.capacity || 1) < allIds.length) {
        s.capacity = allIds.length;
      }
    }

    await s.save();

    // names for participants + mentor
    const idsForNames = new Set();
    (s.participants || []).forEach((p) => {
      const id = p?.user ?? p?._id ?? p;
      if (id && isValidObjectId(id)) idsForNames.add(String(id));
    });
    if (s.mentorId && isValidObjectId(s.mentorId)) idsForNames.add(String(s.mentorId));

    const users = idsForNames.size
      ? await User.find({ _id: { $in: [...idsForNames] } })
          .select("name fullName firstName lastName displayName username email")
          .lean()
      : [];
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    res.json(shape(s.toObject(), usersById));
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update session" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const s = await Session.findById(id);
    if (!s) return res.status(404).json({ message: "Session not found" });

    const allowed =
      isSessionOwner(req.user, s) || isSessionMentor(req.user, s) || isAdminUser(req.user);
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to cancel this session" });
    }

    if (!["pending", "rescheduled"].includes(s.status)) {
      return res.status(400).json({ message: "Only pending or rescheduled sessions can be cancelled" });
    }

    const start = s.scheduleStart ? new Date(s.scheduleStart) : null;
    if (!start || isNaN(start.getTime())) return res.status(400).json({ message: "Invalid session start time" });

    const hoursUntil = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return res
        .status(400)
        .json({ message: "Cancellations are allowed up to 24 hours before the session start time" });
    }

    const reason = (req.body && req.body.reason) || (req.query && req.query.reason) || "";
    s.status = "cancelled";
    s.cancelledBy = req.user._id;
    s.cancelReason = reason;
    await s.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to cancel session" });
  }
});

router.get("/:id", protect, authorize("mentor", "student", "admin"), sessionController.getOne);

module.exports = router;