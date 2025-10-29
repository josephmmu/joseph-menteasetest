// server/controllers/sessionController.js
const Session = require("../models/Session");

// minutes helper
const addMinutes = (iso, mins = 30) =>
  new Date(new Date(iso).getTime() + mins * 60 * 1000).toISOString();

const overlaps = (aStart, aEnd, bStart, bEnd) =>
  new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);

exports.create = async (req, res) => {
  try {
    const {
      courseId: offeringID,
      mentorId,
      topic = "",
      startISO,
      endISO,
    } = req.body;

    if (!offeringID || !mentorId || !startISO)
      return res.status(400).json({ message: "Missing required fields." });

    const scheduleStart = new Date(startISO).toISOString();
    const scheduleEnd   = endISO ? new Date(endISO).toISOString() : addMinutes(scheduleStart, 30);

    // simple conflict check for same mentor
    const clash = await Session.findOne({
      mentorId,
      status: { $ne: "cancelled" },
      $or: [
        { scheduleStart: { $lt: scheduleEnd }, scheduleEnd: { $gt: scheduleStart } },
      ],
    }).lean();

    if (clash) return res.status(409).json({ message: "Time slot conflicts with another session." });

    const doc = await Session.create({
      offeringID,
      mentorId,
      scheduleStart,
      scheduleEnd,
      topic,
      createdBy: req.user?._id, // assuming auth middleware
    });

    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to create session." });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, startISO, endISO, status } = req.body;

    const patch = {};
    if (typeof topic === "string") patch.topic = topic;
    if (startISO) patch.scheduleStart = new Date(startISO).toISOString();
    if (startISO || endISO) {
      const base = patch.scheduleStart || (await Session.findById(id).select("scheduleStart").lean()).scheduleStart;
      patch.scheduleEnd = endISO ? new Date(endISO).toISOString() : addMinutes(base, 30);
    }
    if (status) patch.status = status;

    // optional: conflict check when dates change (similar to create)
    if (patch.scheduleStart && patch.scheduleEnd) {
      const current = await Session.findById(id).lean();
      const clash = await Session.findOne({
        _id: { $ne: id },
        mentorId: current.mentorId,
        status: { $ne: "cancelled" },
        $or: [
          { scheduleStart: { $lt: patch.scheduleEnd }, scheduleEnd: { $gt: patch.scheduleStart } },
        ],
      }).lean();
      if (clash) return res.status(409).json({ message: "Time slot conflicts with another session." });
    }

    const updated = await Session.findByIdAndUpdate(id, patch, { new: true });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: e.message || "Failed to update session." });
  }
};