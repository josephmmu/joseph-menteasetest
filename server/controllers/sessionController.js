// backend/controllers/sessionController.js
const Session = require("../models/Session");
const mongoose = require("mongoose");
const { notifyAndEmail } = require("../utils/notify");

const addMinutes = (iso, mins = 30) =>
  new Date(new Date(iso).getTime() + mins * 60 * 1000).toISOString();

// For human-friendly strings (Asia/Manila)
const fmtRangePH = (startISO, endISO) => {
  if (!startISO) return "";
  const tz = "Asia/Manila";
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date(start.getTime() + 30 * 60 * 1000);

  const dateStr = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  });
  const time = (d) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });

  // duration in minutes
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `${dateStr}, ${time(start)}–${time(end)} GMT+8 (${minutes} mins)`;
};

exports.create = async (req, res) => {
  try {
    const { courseId: offeringID, mentorId, topic = "", startISO, endISO } = req.body;

    if (!offeringID || !mentorId || !startISO)
      return res.status(400).json({ message: "Missing required fields." });

    const scheduleStart = new Date(startISO).toISOString();
    const scheduleEnd = endISO ? new Date(endISO).toISOString() : addMinutes(scheduleStart, 30);

    // conflict check for same mentor (overlap if A.start < B.end && B.start < A.end)
    const clash = await Session.findOne({
      mentorId,
      status: { $ne: "cancelled" },
      $and: [
        { scheduleStart: { $lt: scheduleEnd } },
        { scheduleEnd: { $gt: scheduleStart } },
      ],
    }).lean();

    if (clash) return res.status(409).json({ message: "Time slot conflicts with another session." });

    const doc = await Session.create({
      offeringID,
      mentorId,
      scheduleStart,
      scheduleEnd,
      topic,
      createdBy: req.user?._id,
    });

    // Optional: notify mentor only (students may not be attached yet)
    try {
      await notifyAndEmail(
        [doc.mentorId],
        {
          type: "session",
          title: `[MentEase] Session created`,
          message: `A new session was created for ${fmtRangePH(scheduleStart, scheduleEnd)}.`,
          link: "/mentor/schedule",
          meta: { sessionId: String(doc._id), action: "created" },
        }
      );
    } catch {}
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to create session." });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, startISO, endISO, status, rescheduleReason, cancelReason, recordingUrl } = req.body;

    // Load current to compare (and for clash + notifications)
    const current = await Session.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Session not found." });

    const patch = {};
    if (typeof topic === "string") patch.topic = topic;
    if (typeof recordingUrl === "string") patch.recordingUrl = recordingUrl;
    if (typeof rescheduleReason === "string") patch.rescheduleReason = rescheduleReason;
    if (typeof cancelReason === "string") patch.cancelReason = cancelReason;
    if (status) patch.status = status;

    if (startISO) patch.scheduleStart = new Date(startISO).toISOString();
    if (startISO || endISO) {
      const base = patch.scheduleStart || current.scheduleStart;
      patch.scheduleEnd = endISO ? new Date(endISO).toISOString() : addMinutes(base, 30);
    }

    // conflict check when dates change
    if (patch.scheduleStart && patch.scheduleEnd) {
      const clash = await Session.findOne({
        _id: { $ne: id },
        mentorId: current.mentorId,
        status: { $ne: "cancelled" },
        $and: [
          { scheduleStart: { $lt: patch.scheduleEnd } },
          { scheduleEnd: { $gt: patch.scheduleStart } },
        ],
      }).lean();
      if (clash) return res.status(409).json({ message: "Time slot conflicts with another session." });
    }

    // Detect semantic changes for notifications
    const prevStart = current.scheduleStart;
    const prevEnd   = current.scheduleEnd;
    const nextStart = patch.scheduleStart || prevStart;
    const nextEnd   = patch.scheduleEnd   || prevEnd;

    const timeChanged =
      (prevStart && nextStart && prevStart !== nextStart) ||
      (prevEnd && nextEnd && prevEnd !== nextEnd);

    const isCancelNow =
      (status && String(status).toLowerCase() === "cancelled") &&
      String(current.status || "").toLowerCase() !== "cancelled";

    const updated = await Session.findByIdAndUpdate(id, patch, { new: true });
    res.json(updated);

    // ---- Build & send notifications (fire-and-forget) ----
    (async () => {
      // Build recipient list: mentor + students (from your helper)
      const { sess, students } = (await _rosterForSessionId(String(updated._id))) || {};
      const studentIds = (students || []).map((s) => s._id).filter(Boolean);
      const recipients = [updated.mentorId, ...studentIds];

      if (recipients.length === 0) return;

      const subjectLineBase = `[MentEase] ${sess?.subject || "Session"}`;
      const oldRange = fmtRangePH(prevStart, prevEnd);
      const newRange = fmtRangePH(nextStart, nextEnd);

      if (isCancelNow) {
        const msg = `Session cancelled.\n\nOriginally: ${oldRange}\nReason: ${updated.cancelReason || "N/A"}`;
        await notifyAndEmail(recipients, {
          type: "session",
          title: `${subjectLineBase} cancelled`,
          message: msg,
          link: "/my-schedule",
          meta: { sessionId: String(updated._id), action: "cancelled" },
        });
        return;
      }

      if (timeChanged) {
        const reason = updated.rescheduleReason || "N/A";
        const msg = `Session rescheduled.\n\nFrom: ${oldRange}\nTo:   ${newRange}\nReason: ${reason}`;
        await notifyAndEmail(recipients, {
          type: "session",
          title: `${subjectLineBase} rescheduled`,
          message: msg,
          link: "/my-schedule",
          meta: { sessionId: String(updated._id), action: "rescheduled" },
        });
      }
    })().catch(() => {});
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update session." });
  }
};

exports.getOne = async (req, res) => {
  try {
    const id = req.params.id;
    const q = mongoose.isValidObjectId(id) ? { _id: id } : { sessionId: id };
    const sess = await Session.findOne(q)
      .populate("participants.user", "name email")
      .lean();
    if (!sess) return res.status(404).json({ message: "Session not found" });
    return res.json(sess);
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to read session" });
  }
};

async function _rosterForSessionId(id) {
  const q = mongoose.isValidObjectId(id) ? { _id: id } : { sessionId: id };
  const sess = await Session.findOne(q)
    .populate("participants.user", "name email")
    .lean();
  if (!sess) return null;
  const mentorIdStr = String(sess.mentorId);
  const students = (sess.participants || [])
    .filter(p => p.status !== "cancelled" && p.user && String(p.user._id) !== mentorIdStr)
    .map(p => ({
      _id: p.user._id,
      name: p.user.name || "Student",
      email: p.user.email || "",
    }));
  return { sess, students };
}

exports.getRoster = async (req, res) => {
  try {
    const out = await _rosterForSessionId(req.params.id);
    if (!out) return res.status(404).json({ message: "Session not found" });
    return res.json({ session: { id: out.sess._id, offeringID: out.sess.offeringID, mentorId: out.sess.mentorId }, students: out.students });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to read roster" });
  }
};

exports.getRosterByQuery = async (req, res) => {
  try {
    const sid = req.query.sessionId;
    if (!sid) return res.status(400).json({ message: "sessionId is required" });
    const out = await _rosterForSessionId(sid);
    if (!out) return res.status(404).json({ message: "Session not found" });
    return res.json({ session: { id: out.sess._id, offeringID: out.sess.offeringID, mentorId: out.sess.mentorId }, students: out.students });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to read roster" });
  }
};