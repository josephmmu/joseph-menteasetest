// backend/routes/sessionNoteRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");
const { isValidObjectId } = mongoose;

const Session = require("../models/Session");
const SessionNote = require("../models/SessionNote");
const User = require("../models/User");
let Course = null;
try { Course = require("../models/Course"); } catch {}

/* =========================
   Utils
   ========================= */
const toId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.id) return String(v.id);
    if (v.user) return toId(v.user);
    if (v.userId) return toId(v.userId);
  }
  return String(v);
};

const toObjectId = (v) => {
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};

const pick = (...cands) => {
  for (const c of cands) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return "";
};

const mkName = (u) =>
  !u ? "" : pick(u.name, [u.firstName, u.lastName].filter(Boolean).join(" ").trim(), u.email);

function roleCodeFromUser(user) {
  const code = user?.roleCode || user?.role?.code || user?.role?.name || user?.roleName || user?.role;
  return String(code || "").toLowerCase().trim();
}

function getRoleIdFromUser(user) {
  const v = user?.roleId;
  if (!v) return null;
  return typeof v === "object" ? (v._id ? String(v._id) : null) : String(v);
}

function roleIdOrNull(user) {
  const rid = getRoleIdFromUser(user);
  return rid && isValidObjectId(rid) ? rid : null;
}

function combineISO(dateStr, timeStr) {
  const d = (dateStr || "").trim();
  const t = (timeStr || "").trim();
  if (!d && !t) return "";
  const isoLike = t ? `${d}T${t}` : d;
  const dt = new Date(isoLike);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
}

function parseDateSafe(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* =========================
   Access helpers
   ========================= */
async function canAccessSession(user, sessionId) {
  if (!user || !user._id) return { ok: false, code: 401, reason: "Unauthorized" };
  if (!isValidObjectId(sessionId)) return { ok: false, code: 400, reason: "Invalid session id" };

  const s = await Session.findById(sessionId).select("mentorId createdBy participants").lean();
  if (!s) return { ok: false, code: 404, reason: "Session not found" };

  const me = String(user._id);
  const isMentor = toId(s.mentorId) === me;
  const isCreator = toId(s.createdBy) === me;
  const inParticipants =
    Array.isArray(s.participants) &&
    s.participants.some((p) => toId(p?.user) === me || toId(p) === me);

  const isAdmin = roleCodeFromUser(user) === "admin";
  if (isMentor || isCreator || inParticipants || isAdmin) return { ok: true, s, isMentor, isAdmin };
  return { ok: false, code: 403, reason: "Forbidden" };
}

/* =========================
   Ensure/create my note (with snapshots)
   ========================= */
async function ensureMyNote(sessionId, user) {
  const filter = { session: sessionId, author: user._id };
  let note = await SessionNote.find(filter).sort({ updatedAt: -1, createdAt: -1 }).limit(1);
  if (note && note.length) return note[0].toObject();

  const created = await SessionNote.create({
    session: sessionId,
    author: user._id,
    roleId: roleIdOrNull(user),
    roleName: roleCodeFromUser(user) || "",
    lastEditedBy: user._id,
    lastEditedByName: user?.name || "",
  });

  // snapshot best-effort fields
  try {
    const s = await Session.findById(sessionId)
      .setOptions({ strictPopulate: false })
      .select([
        "mentorId",
        "mentorName",
        "courseCode", "courseName",
        "section", "sectionName", "sectionCode", "block",
        "topic",
        "startISO", "startDateTime", "dateTime",
        "startDate", "startTime", "date", "time",
        "scheduleStart", "scheduleEnd",
      ].join(" "))
      .populate({ path: "mentorId", select: "name firstName lastName email" })
      .lean();

    if (s) {
      let dateTimeISO = pick(
        s.scheduleStart,
        s.startISO, s.startDateTime, s.dateTime,
        combineISO(s.startDate, s.startTime),
        combineISO(s.date, s.time)
      );
      if (dateTimeISO) {
        const dt = new Date(dateTimeISO);
        dateTimeISO = Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
      }

      const mentorName = mkName(typeof s.mentorId === "object" ? s.mentorId : null) || s.mentorName || "";
      const patch = {};
      if (dateTimeISO) patch.startsAt = new Date(dateTimeISO);
      if (mentorName) patch.mentorNameText = mentorName;

      const subject = pick(
        s.courseCode && s.courseName ? `${s.courseCode} ${s.courseName}` : "",
        s.courseCode,
        s.courseName
      );
      const section = pick(s.sectionName, s.sectionCode, s.block, s.section);
      if (subject) patch.subjectText = subject;
      if (section) patch.sectionText = section;

      if (Object.keys(patch).length) await SessionNote.findByIdAndUpdate(created._id, { $set: patch });
    }
  } catch (_) {}

  return await SessionNote.findById(created._id).lean();
}

/* =========================
   Routes
   ========================= */
router.use(protect);

/* =========================
   GET /mine — SessionNote -> Session -> Course -> Mentor (+ students)
   ========================= */
router.get("/mine", async (req, res) => {
  try {
    const meOid = toObjectId(req.user?._id);
    if (!meOid) return res.status(401).json({ message: "Unauthorized" });

    const start = parseDateSafe(req.query.startISO || req.query.start || req.query.from);
    const end   = parseDateSafe(req.query.endISO   || req.query.end   || req.query.to);
    const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);

    const sessionsColl = Session.collection.name;
    const coursesColl  = Course && Course.collection ? Course.collection.name : null;
    const usersColl    = User.collection.name;

    const pipeline = [
      { $match: { author: meOid } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },

      { $addFields: { _sessionIdForLookup: "$session" } },

      // Join session
      {
        $lookup: {
          from: sessionsColl,
          localField: "_sessionIdForLookup",
          foreignField: "_id",
          as: "sessionDoc"
        }
      },
      { $unwind: { path: "$sessionDoc", preserveNullAndEmptyArrays: true } },

      // Course id (offering)
      {
        $addFields: {
          _courseIdForLookup: { $ifNull: ["$sessionDoc.offeringID", "$sessionDoc.offeringId"] }
        }
      },
    ];

    // Join course (optional)
    if (coursesColl) {
      pipeline.push(
        {
          $lookup: {
            from: coursesColl,
            localField: "_courseIdForLookup",
            foreignField: "_id",
            as: "course"
          }
        },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } }
      );
    }

    // Join mentor user
    pipeline.push(
      {
        $lookup: {
          from: usersColl,
          localField: "sessionDoc.mentorId",
          foreignField: "_id",
          as: "mentor"
        }
      },
      { $unwind: { path: "$mentor", preserveNullAndEmptyArrays: true } }
    );

    // ===== Participants/Attendance → students (exclude mentor) =====
    pipeline.push(
      {
        $addFields: {
          _bookedParticipants: {
            $filter: {
              input: { $ifNull: ["$sessionDoc.participants", []] },
              as: "p",
              cond: { $eq: ["$$p.status", "booked"] }
            }
          },
          _attendanceStudents: { $ifNull: ["$sessionDoc.attendance.students", []] }
        }
      },
      {
        $addFields: {
          _participantIds: {
            $map: { input: "$_bookedParticipants", as: "p", in: "$$p.user" }
          },
          _attendanceIds: {
            $map: { input: "$_attendanceStudents", as: "a", in: "$$a.userId" }
          }
        }
      },
      {
        $addFields: {
          _candidateStudentIds: { $setUnion: ["$_participantIds", "$_attendanceIds"] }
        }
      },
      {
        $addFields: {
          _studentIdsNoMentor: {
            $cond: [
              { $ifNull: ["$sessionDoc.mentorId", false] },
              { $setDifference: ["$_candidateStudentIds", ["$sessionDoc.mentorId"]] },
              "$_candidateStudentIds"
            ]
          }
        }
      },
      {
        $lookup: {
          from: usersColl,
          let: { ids: "$_studentIdsNoMentor" },
          pipeline: [
            { $match: { $expr: { $in: ["$_id", "$$ids"] } } },
            { $project: { name: 1, firstName: 1, lastName: 1 } }
          ],
          as: "studentUsers"
        }
      },
      {
        $addFields: {
          participantNames: {
            $map: {
              input: "$studentUsers",
              as: "u",
              in: {
                $trim: {
                  input: {
                    $cond: [
                      { $ifNull: ["$$u.name", false] },
                      "$$u.name",
                      {
                        $concat: [
                          { $ifNull: ["$$u.firstName", ""] },
                          { $cond: [{ $ifNull: ["$$u.firstName", false] }, " ", "" ] },
                          { $ifNull: ["$$u.lastName", ""] }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    );
    // ===== end participants mapping =====

    // computed fields (STRICT schedule-based)
    pipeline.push({
      $addFields: {
        computedStart: {
          $ifNull: [
            "$sessionDoc.scheduleStart",
            {
              $ifNull: [
                "$sessionDoc.startISO",
                {
                  $ifNull: [
                    "$sessionDoc.startDateTime",
                    {
                      $dateFromString: {
                        dateString: {
                          $cond: [
                            {
                              $and: [
                                { $ifNull: ["$sessionDoc.startDate", false] },
                                { $ifNull: ["$sessionDoc.startTime", false] }
                              ]
                            },
                            { $concat: ["$sessionDoc.startDate", "T", "$sessionDoc.startTime"] },
                            null
                          ]
                        },
                        onError: null, onNull: null
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },

        computedEnd: { $ifNull: ["$sessionDoc.scheduleEnd", "$sessionDoc.endISO"] },

        computedStartWithFallback: { $ifNull: ["$computedStart", "$startsAt"] },

        computedEndWithFallback: {
          $cond: [
            { $ifNull: ["$computedEnd", false] },
            "$computedEnd",
            {
              $cond: [
                { $ifNull: ["$computedStartWithFallback", false] },
                { $dateAdd: { startDate: "$computedStartWithFallback", unit: "minute", amount: 30 } },
                null
              ]
            }
          ]
        },

        // Subject / section / mentor labels
        subjectText: {
          $ifNull: [
            "$subjectText",
            {
              $cond: [
                { $and: [{ $ifNull: ["$course.courseCode", false] }, { $ifNull: ["$course.courseName", false] }] },
                { $concat: ["$course.courseCode", " ", "$course.courseName"] },
                { $ifNull: ["$course.courseCode", { $ifNull: ["$course.courseName", ""] }] }
              ]
            }
          ]
        },

        sectionText: {
          $ifNull: [
            "$sectionText",
            {
              $ifNull: [
                "$sessionDoc.sectionName",
                { $ifNull: ["$sessionDoc.sectionCode", { $ifNull: ["$sessionDoc.block", { $ifNull: ["$sessionDoc.section", "$course.section"] }] }] }
              ]
            }
          ]
        },

        mentorNameText: {
          $ifNull: [
            "$mentorNameText",
            {
              $ifNull: [
                "$sessionDoc.mentorName",
                {
                  $ifNull: [
                    "$mentor.name",
                    {
                      $trim: {
                        input: {
                          $concat: [
                            { $ifNull: ["$mentor.firstName", ""] },
                            { $cond: [{ $ifNull: ["$mentor.firstName", false] }, " ", "" ] },
                            { $ifNull: ["$mentor.lastName", ""] }
                          ]
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },

        computedYearLevel: { $ifNull: ["$sessionDoc.yearLevel", "$course.yearLevel"] }
      }
    });

    if (start || end) {
      const dateMatch = {};
      if (start) dateMatch.$gte = start;
      if (end)   dateMatch.$lt  = end;
      pipeline.push({ $match: { computedStartWithFallback: dateMatch } });
    }

    pipeline.push({
      $project: {
        _id: 0,
        id: "$_id",
        sessionId: "$_sessionIdForLookup",

        subject: { $ifNull: ["$subjectText", ""] },
        section: { $ifNull: ["$sectionText", ""] },
        topic:   { $ifNull: ["$sessionDoc.topic", ""] },
        mentorName: { $ifNull: ["$mentorNameText", ""] },

        students: {
          $filter: {
            input: { $setUnion: ["$participantNames", []] },
            as: "n",
            cond: { $ne: ["$$n", ""] }
          }
        },

        dateTimeISO: "$computedStartWithFallback",
        endISO: "$computedEndWithFallback",
        yearLevel: { $ifNull: ["$computedYearLevel", null] },

        excerpt: {
          $trim: {
            input: {
              $substrCP: [
                {
                  $replaceAll: {
                    input: { $concat: [{ $ifNull: ["$topicsDiscussed", ""] }, " ", { $ifNull: ["$nextSteps", ""] }] },
                    find: "  ", replacement: " "
                  }
                },
                0, 160
              ]
            }
          }
        },

        updatedAt: 1,

        rawSession: {
          _id: "$_sessionIdForLookup",
          topic: "$sessionDoc.topic",
          scheduleStart: "$sessionDoc.scheduleStart",
          scheduleEnd: "$sessionDoc.scheduleEnd",
          mentorId: "$sessionDoc.mentorId",
          participants: "$sessionDoc.participants",
          attendance: "$sessionDoc.attendance"
        },

        subjectText: { $ifNull: ["$subjectText", null] },
        sectionText: { $ifNull: ["$sectionText", null] },
        startsAt: { $ifNull: ["$startsAt", null] },
        mentorNameText: { $ifNull: ["$mentorNameText", null] },
      }
    });

    const rows = await SessionNote.aggregate(pipeline);
    const notes = rows.map((r) => ({
      ...r,
      id: String(r.id),
      sessionId: String(r.sessionId),
      dateTimeISO: r.dateTimeISO ? new Date(r.dateTimeISO).toISOString() : "",
      endISO: r.endISO ? new Date(r.endISO).toISOString() : ""
    }));

    res.json({ notes });
  } catch (e) {
    console.error("[session-notes] GET /mine error:", e);
    res.status(500).json({ message: e.message || "Failed to list my notes" });
  }
});

/* =========================
   POST /ensure
   ========================= */
router.post("/ensure", async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ message: "sessionId is required" });

    const check = await canAccessSession(req.user, sessionId);
    if (!check.ok) return res.status(check.code).json({ message: check.reason });

    let note = await ensureMyNote(sessionId, req.user);

    // 🔧 Accept frontend snapshots (subject, section, mentorName, dateTimeISO) as hints
    const { subject, section, mentorName, dateTimeISO, topic } = req.body || {};
    const patch = {};
    if (subject && !note.subjectText) patch.subjectText = String(subject);
    if (section && !note.sectionText) patch.sectionText = String(section);
    if (mentorName && !note.mentorNameText) patch.mentorNameText = String(mentorName);
    if (topic && !note.topic) patch.topic = String(topic);
    if (dateTimeISO && !note.startsAt) {
      const d = parseDateSafe(dateTimeISO);
      if (d) patch.startsAt = d;
    }
    if (Object.keys(patch).length) {
      await SessionNote.findByIdAndUpdate(note._id, { $set: patch });
      note = await SessionNote.findById(note._id).lean();
    }

    res.json({ note });
  } catch (e) {
    console.error("[session-notes] /ensure error:", e);
    res.status(500).json({ message: e.message || "Failed to ensure note" });
  }
});

/* =========================
   GET /mine/:sessionId — includes course + mentor + students
   ========================= */
router.get("/mine/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const check = await canAccessSession(req.user, sessionId);
    if (!check.ok) return res.status(check.code).json({ message: check.reason });

    const note = await ensureMyNote(sessionId, req.user);

    const s = await Session.findById(sessionId)
      .setOptions({ strictPopulate: false })
      .select([
        "mentorId", "mentorName",
        "section", "sectionName", "sectionCode", "block",
        "topic",
        "startISO", "startDateTime", "dateTime",
        "startDate", "startTime", "date", "time",
        "scheduleStart", "scheduleEnd",
        "offeringID",
        "participants",
        "attendance"
      ].join(" "))
      .populate({ path: "mentorId", select: "name firstName lastName email" })
      .lean();

    let dateTimeISO = pick(
      s?.scheduleStart,
      s?.startISO, s?.startDateTime, s?.dateTime,
      combineISO(s?.startDate, s?.startTime),
      combineISO(s?.date, s?.time)
    );
    if (dateTimeISO) {
      const dt = new Date(dateTimeISO);
      dateTimeISO = Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
    }

    let endISO = pick(s?.scheduleEnd, s?.endISO);
    if (!endISO && dateTimeISO) {
      endISO = new Date(new Date(dateTimeISO).getTime() + 30 * 60 * 1000).toISOString();
    }

    let subject = "";
    let yearLevel = null;
    if (Course && s?.offeringID) {
      const course = await Course.findById(s.offeringID).select("courseCode courseName yearLevel section").lean();
      if (course) {
        subject = pick(
          course.courseCode && course.courseName ? `${course.courseCode} ${course.courseName}` : "",
          course.courseCode,
          course.courseName
        );
        if (!s?.section && course.section) s.section = course.section;
        yearLevel = course.yearLevel ?? null;
      }
    }

    const mentorName = mkName(typeof s?.mentorId === "object" ? s.mentorId : null) || s?.mentorName || "";

    const bookedParts = (s?.participants || []).filter((p) => p?.status === "booked");
    const participantIds = bookedParts.map((p) => p.user).filter(Boolean);
    const attendanceIds = (s?.attendance?.students || []).map((a) => a.userId).filter(Boolean);

    const candidateIds = Array.from(new Set([...participantIds.map(String), ...attendanceIds.map(String)]))
      .map((id) => toObjectId(id))
      .filter(Boolean);

    const idsNoMentor = s?.mentorId
      ? candidateIds.filter((id) => String(id) !== String(s.mentorId))
      : candidateIds;

    const users = idsNoMentor.length
      ? await User.find({ _id: { $in: idsNoMentor } }).select("name firstName lastName").lean()
      : [];
    const students = users.map((u) => mkName(u)).filter(Boolean);

    const sessionMeta = {
      id: toId(s?._id) || sessionId,
      subject,
      section: pick(s?.sectionName, s?.sectionCode, s?.block, s?.section) || "",
      topic: s?.topic || "",
      mentorName,
      startISO: dateTimeISO || "",
      endISO: endISO || "",
      yearLevel,
      students,
    };

    res.json({ note, session: sessionMeta });
  } catch (e) {
    console.error("[session-notes] GET /mine/:id error:", e);
    res.status(500).json({ message: e.message || "Failed to fetch note" });
  }
});

/* =========================
   PATCH /mine/:sessionId — autosave
   ========================= */
router.patch("/mine/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const check = await canAccessSession(req.user, sessionId);
    if (!check.ok) return res.status(check.code).json({ message: check.reason });

    const base = await ensureMyNote(sessionId, req.user);
    if (!base || !base._id) return res.status(500).json({ message: "Failed to resolve note id" });

    const { topicsDiscussed = "", nextSteps = "" } = req.body || {};
    const update = {
      topicsDiscussed: String(topicsDiscussed ?? ""),
      nextSteps: String(nextSteps ?? ""),
      lastEditedAt: new Date(),
      lastEditedBy: req.user._id,
      lastEditedByName: req.user?.name || "",
    };

    const note = await SessionNote.findByIdAndUpdate(base._id, { $set: update }, { new: true }).lean();
    return res.json({ note });
  } catch (e) {
    console.error("[session-notes] PATCH mine error:", e);
    res.status(500).json({ message: e.message || "Failed to update note" });
  }
});

/* =========================
   GET /:sessionId — list visible notes for a session
   ========================= */
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const check = await canAccessSession(req.user, sessionId);
    if (!check.ok) return res.status(check.code).json({ message: check.reason });

    const isMentorOrAdmin = check.isMentor || roleCodeFromUser(req.user) === "admin";
    const q = isMentorOrAdmin ? { session: sessionId } : { session: sessionId, author: req.user._id };
    const notes = await SessionNote.find(q).sort({ updatedAt: -1 }).lean();
    res.json({ notes });
  } catch (e) {
    console.error("[session-notes] list error:", e);
    res.status(500).json({ message: e.message || "Failed to list notes" });
  }
});

module.exports = router;