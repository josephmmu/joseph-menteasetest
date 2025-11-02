// routes/notificationRoutes.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Notification = require("../models/Notification");

// --- auth guard ---
const { protect } = require("../middleware/authMiddleware");
const auth = protect;

// --- email + db service (FIX: use service so emails actually send) ---
const {
  createNotificationAndMaybeEmail,
} = require("../services/notificationService");

/* ----------------------------------------
   Helpers
----------------------------------------- */

// Normalize body & target user
function pickRecipient(req) {
  const v =
    req.body?.toUserId ||
    req.body?.to ||
    req.params?.userId ||
    req.query?.recipient ||
    "";
  return String(v || "").trim();
}

function boolFromQuery(v, def = undefined) {
  if (v === undefined) return def;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return def;
}

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

// Unified sender → DB document shape
function shapeDocFromBody(req, to) {
  const sendEmail =
    boolFromQuery(req.body?.sendEmail, undefined) ??
    boolFromQuery(req.query?.email, true); // FIX: default to true so emails go out

  return {
    recipient: to,
    type: (req.body.type || "session").toLowerCase(),
    title: req.body.title || "Update",
    message: req.body.message || req.body.content || "",
    content: req.body.content || req.body.message || "",
    link: req.body.link || req.body.pageRelated || "/my-schedule",
    pageRelated: req.body.pageRelated || req.body.link || "/my-schedule",
    meta: req.body.meta || {},
    sendEmail,
  };
}

// Async wrapper to avoid try/catch noise
const aw =
  (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/* ----------------------------------------
   CREATE
----------------------------------------- */

// POST /api/notifications
const createNotification = aw(async (req, res) => {
  const toRaw = pickRecipient(req);
  const to =
    toRaw === "me"
      ? String(req.user?._id || req.user?.id || "")
      : String(toRaw || "");

  const toEmail =
    String(
      req.body?.recipientEmail ||
        req.body?.toEmail ||
        req.query?.recipientEmail ||
        req.query?.email ||
        ""
    ).trim();

  if (!to && !toEmail)
    return res.status(400).json({ message: "Missing recipient id or email" });


  const shaped = shapeDocFromBody(req, to);

  // FIX: go through service so email is attempted and emailSent flag recorded
  const doc = await createNotificationAndMaybeEmail({
    recipientId: shaped.recipient || undefined,
    recipientEmail: toEmail || undefined,
    type: shaped.type,
    title: shaped.title,
    message: shaped.message,
    link: shaped.link,
    sendEmail: !!shaped.sendEmail,
    // preserve extras in DB
    content: shaped.content,
    pageRelated: shaped.pageRelated,
    meta: shaped.meta,
  });

  return res.status(201).json(doc);
});
router.post("/", auth, createNotification);

// Aliases (reuse same handler)
router.post(
  "/send",
  auth,
  aw(async (req, res) => {
    req.body.toUserId = req.body.toUserId || req.body.to;
    req.body.recipientEmail = req.body.recipientEmail || req.body.toEmail || req.body.email;
    return createNotification(req, res);
  })
);

router.post(
  "/users/:userId/notifications",
  auth,
  aw(async (req, res) => {
    req.body.recipientEmail = req.body.recipientEmail || req.body.toEmail || req.body.email;
     return createNotification(req, res);
  })
);

router.post(
  "/users/:userId/notify",
  auth,
  aw(async (req, res) => {
    req.body.toUserId = req.params.userId;
    req.body.recipientEmail = req.body.recipientEmail || req.body.toEmail || req.body.email;
    return createNotification(req, res);
  })
);

/* ----------------------------------------
   READ / LIST
----------------------------------------- */

// GET /api/notifications/mine
router.get(
  "/mine",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit || "50", 10))
    );
    const before = req.query.before ? new Date(req.query.before) : null;
    const read = boolFromQuery(req.query.read, undefined);

    const query = { recipient: me };
    if (before && !isNaN(before.getTime())) query.createdAt = { $lt: before };
    if (typeof read === "boolean") query.read = read;

    const items = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextBefore = items.length ? items[items.length - 1].createdAt : null;

    res.json({ notifications: items, nextBefore });
  })
);

// GET /api/notifications?recipient=me|<id>&read=true|false&limit=50&before=<ISO>
router.get(
  "/",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    let { recipient } = req.query;

    if (!recipient) recipient = "me";
    const recipientId = recipient === "me" ? me : String(recipient);

    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit || "50", 10))
    );
    const before = req.query.before ? new Date(req.query.before) : null;
    const read = boolFromQuery(req.query.read, undefined);

    const query = { recipient: recipientId };
    if (before && !isNaN(before.getTime())) query.createdAt = { $lt: before };
    if (typeof read === "boolean") query.read = read;

    const items = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextBefore = items.length ? items[items.length - 1].createdAt : null;

    res.json({ notifications: items, nextBefore });
  })
);

// GET /api/notifications/unread
router.get(
  "/unread",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit || "50", 10))
    );
    const before = req.query.before ? new Date(req.query.before) : null;

    const query = { recipient: me, read: false };
    if (before && !isNaN(before.getTime())) query.createdAt = { $lt: before };

    const items = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const nextBefore = items.length ? items[items.length - 1].createdAt : null;

    res.json({ notifications: items, nextBefore });
  })
);

// GET /api/notifications/unread-count
router.get(
  "/unread-count",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const count = await Notification.countDocuments({
      recipient: me,
      read: false,
    });
    res.json({ count });
  })
);

/* ----------------------------------------
   UPDATE (read flags)
----------------------------------------- */

// PATCH /api/notifications/:id  { read: true|false }
router.patch(
  "/:id",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ message: "Invalid notification id" });

    const { read } = req.body;
    const doc = await Notification.findOneAndUpdate(
      { _id: id, recipient: me },
      { $set: { read: !!read } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  })
);

// POST /api/notifications/mark-all-read
// POST /api/notifications/read-all (alias)
const markAllRead = aw(async (req, res) => {
  const me = String(req.user?._id || req.user?.id || "");
  await Notification.updateMany(
    { recipient: me, read: false },
    { $set: { read: true } }
  );
  res.json({ ok: true });
});
router.post("/mark-all-read", auth, markAllRead);
router.post("/read-all", auth, markAllRead);

// POST /api/notifications/:id/read  (idempotent)
router.post(
  "/:id/read",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ message: "Invalid notification id" });

    const r = await Notification.updateOne(
      { _id: id, recipient: me },
      { $set: { read: true } }
    );
    if (r.matchedCount === 0)
      return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  })
);

/* ----------------------------------------
   DELETE (optional)
----------------------------------------- */

// DELETE /api/notifications/:id
router.delete(
  "/:id",
  auth,
  aw(async (req, res) => {
    const me = String(req.user?._id || req.user?.id || "");
    const { id } = req.params;
    if (!isValidId(id))
      return res.status(400).json({ message: "Invalid notification id" });

    const r = await Notification.deleteOne({ _id: id, recipient: me });
    if (r.deletedCount === 0)
      return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  })
);

module.exports = router;